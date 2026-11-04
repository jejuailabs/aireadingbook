// Shared, network-free planning and estimate functions (browser + Node).
export const MODEL = 'Qwen3-TTS-12Hz-1.7B-CustomVoice';
export const RATE_DATE = '2026-11-04';
export const GPU_RATES_USD = Object.freeze({
  'NVIDIA RTX A4000': .58, 'NVIDIA RTX A4500': .58,
  'NVIDIA RTX 4000 Ada Generation': .58, 'NVIDIA RTX 2000 Ada Generation': .58,
  'NVIDIA RTX A5000': .75, 'NVIDIA L4': .75,
  'NVIDIA A40': 1.22, 'NVIDIA RTX A6000': 1.22,
  'NVIDIA GeForce RTX 4090': 1.34
});
export const VOICES = ['Sohee','Serena','Vivian','Ono_Anna','Aiden','Ryan','Uncle_Fu','Dylan','Eric'];
export const LANGUAGES = ['Korean','English','Japanese','Chinese','Auto'];
export async function hash(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
}
export function splitPage(text, limit=600) {
  if(!Number.isInteger(limit)||limit<80||limit>1000)throw new Error('분할 길이는 80~1,000자여야 합니다.');
  const result=[];let start=0;
  while(start<text.length){
    while(start<text.length&&/\s/u.test(text[start]))start++;
    if(start===text.length)break;
    let end=Math.min(text.length,start+limit);
    if(end<text.length){
      // Never split a surrogate pair; prefer a paragraph or sentence boundary.
      if(/[\uDC00-\uDFFF]/.test(text[end]))end--;
      const window=text.slice(start,end);const breaks=[...window.matchAll(/\n\s*\n|[.!?。！？](?:\s+|$)/gu)];
      const boundary=breaks.at(-1);
      if(boundary&&boundary.index>limit/3)end=start+boundary.index+boundary[0].length;
      else {const space=window.lastIndexOf(' ');if(space>limit/2)end=start+space;}
    }
    let trimmed=end;while(trimmed>start&&/\s/u.test(text[trimmed-1]))trimmed--;
    if(trimmed>start)result.push({start,end:trimmed,text:text.slice(start,trimmed)});
    start=end;
  }
  return result;
}
export async function createPlan(books,options={}) {
  const settings={voice:options.voice||'Sohee',language:options.language||'Korean',instruct:options.instruct??'Speak calmly and slowly with a gentle, reassuring tone.',chunkChars:options.chunkChars??600};
  if(!VOICES.includes(settings.voice)||!LANGUAGES.includes(settings.language)||typeof settings.instruct!=='string'||settings.instruct.length>500)throw new Error('지원하지 않는 음성 설정입니다.');
  if(!Array.isArray(books)||!books.length||books.length>100)throw new Error('책을 1~100권 선택해 주세요.');
  let count=0;const seen=new Set();const prepared=[];
  for(const book of books){
    if(typeof book.id!=='string'||!book.id||seen.has(book.id)||typeof book.title!=='string'||!Array.isArray(book.pages)||!book.pages.length||book.pages.some(p=>typeof p!=='string'))throw new Error('원고 형식 또는 도서 ID를 확인해 주세요.');
    seen.add(book.id);
    if(book.pages.join('').length>2_000_000)throw new Error('한 권은 200만 자 이하로 나누어 준비해 주세요.');
    const segments=book.pages.flatMap((text,page)=>splitPage(text,settings.chunkChars).map(part=>({...part,page,id:`s${String(++count).padStart(6,'0')}`})));
    if(!segments.length)throw new Error(`${book.title}: 읽을 텍스트가 없습니다. 스캔 PDF는 OCR이 먼저 필요합니다.`);
    prepared.push({id:book.id,title:book.title,sourceHash:await hash(JSON.stringify(book.pages)),pages:book.pages,segments});
  }
  if(count>10000)throw new Error('한 묶음은 10,000개 구간까지 지원합니다.');
  const content={version:1,provider:'runpod-qwen3',model:MODEL,settings,books:prepared};
  return {...content,fingerprint:await hash(JSON.stringify(content)),createdAt:new Date().toISOString()};
}
export function costRange(executionMs,low=.58,high=1.34){
  if(!Number.isFinite(executionMs)||executionMs<0)throw new Error('유효하지 않은 실행 시간');
  return {lowUsd:executionMs/3600000*low,highUsd:executionMs/3600000*high,basis:'execution-only estimate; excludes cold start, idle, storage, tax'};
}
export function summarize(plan,records={}) {
  return plan.books.map(book=>{
    const rows=book.segments.map(s=>records[s.id]).filter(Boolean),done=rows.filter(r=>r.status==='completed');
    const executionMs=rows.reduce((n,r)=>n+(Number.isFinite(r.executionMs)?r.executionMs:0),0);
    const audioSeconds=done.reduce((n,r)=>n+(r.audioSeconds||0),0);
    const complete=done.length===book.segments.length;
    const missingExecution=rows.some(r=>['completed','failed','cancelled'].includes(r.status)&&!Number.isFinite(r.executionMs));
    return {bookId:book.id,title:book.title,segments:book.segments.length,completed:done.length,complete,characters:book.segments.reduce((n,s)=>n+s.text.length,0),executionMs,audioSeconds,executionTimeIncomplete:missingExecution,wallMs:rows.reduce((n,r)=>n+(r.wallMs||0),0),queueMs:rows.reduce((n,r)=>n+(r.queueMs||0),0),realtimeFactor:audioSeconds?executionMs/1000/audioSeconds:null,computeEstimate:costRange(executionMs),reservedUsd:rows.reduce((n,r)=>n+(r.reservedUsd||0),0)};
  });
}
