import {GPU_RATES_USD,createPlan} from '../../dist/narration-core.js';
import {decodeWav} from './runpod.mjs';
export async function validatePlan(plan){
  const rebuilt=await createPlan(plan.books.map(b=>({id:b.id,title:b.title,pages:b.pages})),plan.settings);
  if(rebuilt.fingerprint!==plan.fingerprint||JSON.stringify(rebuilt.books)!==JSON.stringify(plan.books)||plan.model!==rebuilt.model||plan.provider!==rebuilt.provider||plan.version!==1)throw new Error('Plan was changed; prepare a new plan.');
}
export function validateApproval(approval,plan,endpoint,now=Date.now()){
  if(!approval||approval.provider!=='runpod-qwen3'||approval.fingerprint!==plan.fingerprint||approval.endpoint!==endpoint||!approval.approvedBy?.trim()||!approval.acknowledgeUnmeteredOverhead)throw new Error('Explicit batch-specific billing approval required.');
  if(!Number.isFinite(Date.parse(approval.expiresAt))||Date.parse(approval.expiresAt)<=now)throw new Error('Billing approval expired.');
  for(const k of ['maxReservedUsd','maxSubmissions','hourlyRateCeilingUsd','perSegmentTimeoutSeconds','startupAllowanceSeconds'])if(!Number.isFinite(approval[k])||approval[k]<=0)throw new Error(`Invalid approval limit: ${k}`);
  if(!Number.isInteger(approval.maxSubmissions)||approval.perSegmentTimeoutSeconds>600||approval.perSegmentTimeoutSeconds<5)throw new Error('Invalid execution limits.');
}
export function validateEndpoint(info,approval){
  if(info.id!==approval.endpoint||info.workersMin!==0||info.workersMax!==1||info.gpuCount!==1||!Number.isFinite(info.idleTimeout)||info.idleTimeout<0||info.idleTimeout>5||info.networkVolumeId)throw new Error('Endpoint must remain one on-demand GPU, min=0/max=1, idle<=5s, no network volume.');
  if(!Array.isArray(info.gpuTypeIds)||!info.gpuTypeIds.length||info.gpuTypeIds.some(g=>!GPU_RATES_USD[g]||GPU_RATES_USD[g]>approval.hourlyRateCeilingUsd))throw new Error('GPU pricing exceeds or is outside the reviewed rate table.');
}
// Sequential durable execution. Submission uncertainty never causes an automatic retry.
// The caller owns a filesystem lock. Each save must be durably committed before a POST.
export async function runBatch({plan,journal,approval,client,save,writeAudio,enabled=false,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms)),shouldStop=()=>false}){
  await validatePlan(plan);
  if(!enabled)throw new Error('NARRATION_ENABLED is false; no provider calls made.');
  if(journal.fingerprint!==plan.fingerprint||!journal.segments||!Number.isInteger(journal.submissions)||journal.submissions<0||!Number.isFinite(journal.reservedUsd)||journal.reservedUsd<0)throw new Error('Invalid journal.');
  const allowedIds=new Set(plan.books.flatMap(b=>b.segments.map(s=>s.id)));
  const rows=Object.entries(journal.segments);
  if(rows.some(([id,r])=>!allowedIds.has(id)||!Number.isFinite(r.reservedUsd)||r.reservedUsd<=0)||rows.length!==journal.submissions||Math.abs(rows.reduce((n,[,r])=>n+r.reservedUsd,0)-journal.reservedUsd)>1e-8)throw new Error('Journal reservations do not reconcile.');
  // An expired approval permits retrieving an already submitted result only.
  validateApproval(approval,plan,client.endpoint,Math.min(now(),Date.parse(approval?.expiresAt)-1));
  validateEndpoint(await client.inspect(),approval);
  for(const book of plan.books)for(const segment of book.segments){
    if(shouldStop())return;
    let row=journal.segments[segment.id];
    if(row?.status==='completed')continue;
    if(row&&['submitting','unknown','failed','cancelled'].includes(row.status))throw new Error(`Segment ${segment.id} requires manual reconciliation; it will not be resubmitted.`);
    if(!row){
      validateApproval(approval,plan,client.endpoint,now());
      // Recheck the shared endpoint before every paid submission. Never PATCH it.
      const endpoint=await client.inspect();validateEndpoint(endpoint,approval);
      const reserve=(approval.perSegmentTimeoutSeconds+approval.startupAllowanceSeconds+endpoint.idleTimeout)*approval.hourlyRateCeilingUsd/3600;
      if(journal.submissions>=approval.maxSubmissions||journal.reservedUsd+reserve>approval.maxReservedUsd)throw new Error('Approved submission/budget limit reached.');
      row={status:'submitting',reservedUsd:reserve,startedAt:now()};journal.segments[segment.id]=row;journal.reservedUsd+=reserve;journal.submissions++;
      await save(journal);
      try{const job=await client.submit(segment.text,plan.settings,approval.perSegmentTimeoutSeconds*1000);if(typeof job.id!=='string'||!job.id)throw new Error('Missing provider job ID');row.jobId=job.id;row.status='queued';await save(journal);}catch{row.status='unknown';await save(journal);throw new Error(`Submission result unknown for ${segment.id}; do not retry until reconciled in RunPod.`);}
    }
    if(!row.jobId)throw new Error('Queued segment has no job ID.');
    const pollDeadline=now()+18*60*1000;
    while(true){
      if(shouldStop()||now()>pollDeadline){await save(journal);return;}
      // Polling an existing job may continue to save its result after approval expiry;
      // expiry blocks all NEW submissions above.
      const job=await client.status(row.jobId);
      row.providerStatus=job.status;
      if(typeof job.workerId==='string')row.workerId=job.workerId;
      if(Number.isFinite(job.executionTime)&&job.executionTime>=0)row.executionMs=job.executionTime;
      if(Number.isFinite(job.delayTime)&&job.delayTime>=0)row.queueMs=job.delayTime;
      row.wallMs=now()-row.startedAt;
      if(job.status==='COMPLETED'){
        try{const wav=decodeWav(job.output);await writeAudio(segment.id,wav.bytes);row.audioSeconds=wav.seconds;row.audioFile=`${segment.id}.wav`;row.handlerMs=Number.isFinite(job.output?.elapsed_ms)?job.output.elapsed_ms:null;row.status='completed';}catch{row.status='failed';await save(journal);throw new Error(`Invalid/missing audio for ${segment.id}; no automatic regeneration.`);}
        await save(journal);break;
      }
      if(['FAILED','CANCELLED','TIMED_OUT'].includes(job.status)){row.status=job.status==='CANCELLED'?'cancelled':'failed';await save(journal);throw new Error(`Provider ended ${segment.id}: ${job.status}.`);}
      if(!['IN_QUEUE','IN_PROGRESS'].includes(job.status))throw new Error('Unknown provider state; saved job ID retained.');
      row.status='queued';await save(journal);await sleep(5000);
    }
  }
}
