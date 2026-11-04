import {readFile,writeFile,mkdir,rename,open,unlink,access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPlan,summarize,RATE_DATE} from '../dist/narration-core.js';
import {RunpodClient} from '../lib/narration/runpod.mjs';
import {runBatch,validatePlan} from '../lib/narration/batch.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../data/narration');
const [command,input]=process.argv.slice(2);
const read=async file=>JSON.parse(await readFile(file,'utf8'));
const atomic=async(file,value)=>{await writeFile(file+'.tmp',JSON.stringify(value,null,2),'utf8');await rename(file+'.tmp',file);};
function batchFolder(id){if(!/^[a-f0-9]{20}$/.test(id||''))throw new Error('Use the batch ID returned by prepare.');return path.join(root,id);}
async function report(folder,plan,journal){
  const summary=summarize(plan,journal.segments);
  await atomic(path.join(folder,'report.json'),{batchId:plan.fingerprint.slice(0,20),updatedAt:new Date().toISOString(),pricingReviewedAt:RATE_DATE,provider:'runpod-qwen3',summary,notice:'Execution-only USD estimates. Not a billing invoice or a hard cloud spending cap. Cold starts, idle, disk, taxes and other applications are excluded.'});
  const csv=value=>{let s=String(value??'');if(/^[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  const rows=[['book','segments','completed','execution_minutes','wall_minutes','queue_minutes','audio_minutes','realtime_factor','compute_low_usd','compute_high_usd','reserved_usd'],...summary.map(s=>[s.title,s.segments,s.completed,s.executionMs/60000,s.wallMs/60000,s.queueMs/60000,s.audioSeconds/60,s.realtimeFactor,s.computeEstimate.lowUsd,s.computeEstimate.highUsd,s.reservedUsd])];
  await writeFile(path.join(folder,'report.csv'),'\uFEFF'+rows.map(r=>r.map(csv).join(',')).join('\n'),'utf8');
  // Only complete books can be imported as finished narration. No fake success.
  const books=plan.books.filter(b=>b.segments.every(s=>journal.segments[s.id]?.status==='completed')).map(b=>({id:b.id,title:b.title,sourceHash:b.sourceHash,segments:b.segments.map(s=>({...s,audioFile:journal.segments[s.id].audioFile,audioSeconds:journal.segments[s.id].audioSeconds}))}));
  await atomic(path.join(folder,'narration-result.json'),{version:1,provider:plan.provider,model:plan.model,settings:plan.settings,fingerprint:plan.fingerprint,books});
  return summary;
}
async function main(){
  if(command==='prepare'){
    if(!input)throw new Error('Usage: npm run narration:prepare -- <exported-manuscripts.json>');
    const source=await read(path.resolve(input));
    const plan=await createPlan(source.books,source.settings);
    const id=plan.fingerprint.slice(0,20),folder=batchFolder(id);await mkdir(folder,{recursive:true});
    // Never reset a journal or overwrite a prior approved scope.
    const writeOnce=async(name,value)=>{try{await writeFile(path.join(folder,name),JSON.stringify(value,null,2),{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}};
    await writeOnce('plan.json',plan);
    await writeOnce('journal.json',{version:1,fingerprint:plan.fingerprint,endpoint:process.env.RUNPOD_QWEN3_TTS_ENDPOINT_ID||'',segments:{},submissions:0,reservedUsd:0});
    await writeOnce('approval.example.json',{provider:plan.provider,fingerprint:plan.fingerprint,endpoint:process.env.RUNPOD_QWEN3_TTS_ENDPOINT_ID||'',approvedBy:'',expiresAt:'',maxReservedUsd:0,maxSubmissions:0,hourlyRateCeilingUsd:1.34,perSegmentTimeoutSeconds:600,startupAllowanceSeconds:180,acknowledgeUnmeteredOverhead:false,notes:'Fill approval.json only AFTER the user explicitly approves this batch, cost basis, budget and duration. No approval is created by prepare.'});
    console.log(JSON.stringify({batchId:id,books:plan.books.length,segments:plan.books.reduce((n,b)=>n+b.segments.length,0),folder,mode:'offline; no API calls'},null,2));return;
  }
  if(!['run','report','cancel'].includes(command)){console.log('Commands: prepare <input.json> | run <batchId> | report <batchId> | cancel <batchId>');return;}
  const folder=batchFolder(input);let lock;
  try{lock=await open(path.join(folder,'batch.lock'),'wx');await lock.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));}catch(e){if(e.code==='EEXIST')throw new Error('Batch is locked. Stop the previous runner and reconcile pending jobs before manually removing batch.lock.');throw e;}
  try{
    const plan=await read(path.join(folder,'plan.json')),journal=await read(path.join(folder,'journal.json'));
    await validatePlan(plan);
    if(journal.fingerprint!==plan.fingerprint)throw new Error('Journal/plan mismatch.');
    if(command==='report'){console.log(JSON.stringify(await report(folder,plan,journal),null,2));return;}
    if(journal.endpoint!==process.env.RUNPOD_QWEN3_TTS_ENDPOINT_ID)throw new Error('Configured endpoint changed; do not migrate an active batch.');
    const client=new RunpodClient({key:process.env.RUNPOD_API_KEY,endpoint:journal.endpoint});
    const save=async value=>{await atomic(path.join(folder,'journal.json'),value);await report(folder,plan,value);};
    if(command==='cancel'){
      for(const row of Object.values(journal.segments))if(row.jobId&&row.status==='queued'){await client.cancel(row.jobId);row.providerStatus='CANCEL_REQUESTED';await save(journal);}
      console.log('Cancellation requested for known active jobs. Poll/resume to confirm final states; unknown submissions require RunPod console reconciliation.');return;
    }
    if(process.env.NARRATION_ENABLED!=='true')throw new Error('Generation disabled. Set NARRATION_ENABLED=true only after explicit cost approval.');
    const approval=await read(path.join(folder,'approval.json'));
    // Missing audio should stop, not silently spend again.
    for(const row of Object.values(journal.segments))if(row.status==='completed')await access(path.join(folder,row.audioFile));
    let stop=false;const onStop=()=>{stop=true;console.log('Stopping before the next submission. An already submitted job can continue; use cancel after this process exits.');};
    process.once('SIGINT',onStop);process.once('SIGTERM',onStop);
    try{await runBatch({plan,journal,approval,client,save,enabled:true,shouldStop:()=>stop,writeAudio:async(id,bytes)=>{if(!/^s\d{6}$/.test(id))throw new Error('Invalid segment ID');await writeFile(path.join(folder,id+'.wav'),bytes);}});}finally{process.removeListener('SIGINT',onStop);process.removeListener('SIGTERM',onStop);await report(folder,plan,journal);}
    console.log('Checkpoint and report saved. Only fully completed books appear in narration-result.json.');
  }finally{await lock.close();await unlink(path.join(folder,'batch.lock'));}
}
main().catch(error=>{console.error(error.code==='ENOENT'?'Required file missing. Prepare the batch and provide an explicit approval.json before generation.':error.message);process.exitCode=1;});
