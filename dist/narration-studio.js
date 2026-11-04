import {createPlan,hash,VOICES,costRange} from './narration-core.js';
let lastReport=null;
function metricsMarkup(){
  if(!lastReport)return '<p>제작 후 report.json을 가져오면 책별 시간과 추정 원가가 표시됩니다.</p>';
  return `<div class="table-wrap"><table><thead><tr><th>책</th><th>완료 구간</th><th>GPU 실행</th><th>전체 소요*</th><th>음원 길이</th><th>실행비 추정</th></tr></thead><tbody>${lastReport.summary.map(r=>{const c=costRange(r.executionMs);return `<tr><td>${escapeText(r.title)}</td><td>${r.completed} / ${r.segments}</td><td>${(r.executionMs/60000).toFixed(2)}분${r.executionTimeIncomplete?' · 일부 미확인':''}</td><td>${(r.wallMs/60000).toFixed(2)}분</td><td>${(r.audioSeconds/60).toFixed(2)}분</td><td>$${c.lowUsd.toFixed(4)}~$${c.highUsd.toFixed(4)}</td></tr>`;}).join('')}</tbody></table></div><p>* 구간별 관측 시간 합계로, 중단 후 재개하면 중단 시간도 포함됩니다. 비용은 실행 시간만 기준으로 한 추정치이며 모델 로딩·유휴·디스크·세금은 별도입니다. 실제 청구서는 아닙니다.</p>`;
}
export function studioMarkup(docs){
  const books=docs.filter(d=>['text','pdf'].includes(d.type));
  return `<section class="panel"><h2>책 나레이션 일괄 제작</h2><p>Qwen3-TTS · 원고를 묶어 준비하고, 승인 후 로컬 제작 도구에서 순서대로 생성합니다. 이 화면의 버튼은 유료 API를 호출하지 않습니다.</p><form id="narration-export"><div class="batch-books">${books.map(d=>`<label><input type="checkbox" name="bookId" value="${encodeURIComponent(d.id)}"> ${escapeText(d.title)} <small>${d.pages}쪽 · ${d.type.toUpperCase()}</small></label>`).join('')||'<p>텍스트 또는 PDF 책을 먼저 가져와 주세요.</p>'}</div><div class="job-fields"><label>목소리<select name="voice">${VOICES.map(v=>`<option>${v}</option>`).join('')}</select></label><label>언어<select name="language"><option value="Korean">한국어</option><option>English</option><option>Japanese</option><option>Chinese</option><option>Auto</option></select></label><label>구간 길이<input name="chunkChars" type="number" min="80" max="1000" value="600" required></label><button class="secondary" type="submit">원고 묶음 내려받기</button></div><p>스캔 PDF는 OCR이 필요합니다. 음원 길이와 제작 시간은 별도로 측정합니다.</p></form><div class="inline-actions"><button id="narration-import-button">완성 음원 폴더 가져오기</button></div><input id="narration-import-files" type="file" webkitdirectory multiple hidden><div id="narration-studio-status" role="status"></div></section><section class="panel"><h2>책별 제작 시간과 원가</h2><div class="inline-actions"><button id="narration-report-button">제작 리포트 가져오기</button></div><input id="narration-report-file" type="file" accept=".json,application/json" hidden><div id="narration-metrics"></div></section>`;
}
const escapeText=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function initNarrationStudio({state,$,get,put,paginateText,toast,jump,currentIndex}){
  const panel=$('#feature-panel');let audio=null,objectUrl=null,playing=false,playToken=0,starting=false;
  const renderMetrics=()=>{const node=$('#narration-metrics');if(node)node.innerHTML=metricsMarkup();};
  get('settings','narration-last-report').then(r=>{lastReport=r?.value||null;renderMetrics();}).catch(()=>{});
  new MutationObserver(renderMetrics).observe(panel,{childList:true});
  const status=text=>{const node=$('#narration-studio-status');if(node)node.textContent=text;};
  async function pagesFor(doc){
    const record=await get('files',doc.id);if(!record)throw new Error('원본 파일을 찾을 수 없습니다.');
    if(doc.type==='text')return paginateText(await record.blob.text());
    const pdfjs=await import('./vendor/pdfjs/build/pdf.mjs');
    const task=pdfjs.getDocument({data:new Uint8Array(await record.blob.arrayBuffer()),cMapUrl:'./vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'./vendor/pdfjs/standard_fonts/',wasmUrl:'./vendor/pdfjs/wasm/',isEvalSupported:false});
    try{const pdf=await task.promise,pages=[];for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i),content=await page.getTextContent();pages.push(content.items.map(x=>x.str+(x.hasEOL?'\n':' ')).join(''));page.cleanup();}return pages;}finally{await task.destroy();}
  }
  panel.addEventListener('submit',async e=>{
    if(e.target.id!=='narration-export')return;e.preventDefault();const form=e.target,submit=form.querySelector('[type=submit]');submit.disabled=true;
    try{const data=new FormData(form),ids=data.getAll('bookId').map(decodeURIComponent);if(!ids.length)throw new Error('제작할 책을 선택해 주세요.');
      status('원고를 추출하고 있습니다…');const books=[];
      for(const id of ids){const doc=state.docs.find(d=>d.id===id);if(!doc)throw new Error('선택한 책이 없습니다.');const pages=await pagesFor(doc);if(doc.type==='pdf'&&pages.some(p=>!p.trim()))throw new Error(`${doc.title}: 텍스트가 없는 페이지가 있습니다. OCR/빈 페이지 검수 후 진행해 주세요.`);books.push({id:doc.id,title:doc.title,pages});}
      const plan=await createPlan(books,{voice:data.get('voice'),language:data.get('language'),chunkChars:Number(data.get('chunkChars'))});
      const blob=new Blob([JSON.stringify({version:1,books,settings:plan.settings},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='folio-narration-manuscripts.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      status(`${books.length}권 · ${plan.books.reduce((n,b)=>n+b.segments.length,0)}개 구간을 준비했습니다. 생성 요청은 보내지 않았습니다.`);
    }catch(error){status(error.message);toast(error.message);}finally{submit.disabled=false;}
  });
  panel.addEventListener('click',e=>{if(e.target.closest('#narration-import-button'))$('#narration-import-files').click();if(e.target.closest('#narration-report-button'))$('#narration-report-file').click();});
  panel.addEventListener('change',async e=>{
    if(e.target.id==='narration-report-file'){
      try{const file=e.target.files[0];if(!file)return;if(file.size>5*1024*1024)throw new Error('리포트가 너무 큽니다.');const report=JSON.parse(await file.text());
        if(!Array.isArray(report.summary)||report.summary.length>100)throw new Error('report.json 형식을 확인해 주세요.');
        const summary=report.summary.map(r=>{for(const k of ['executionMs','wallMs','audioSeconds','segments','completed'])if(!Number.isFinite(r[k])||r[k]<0)throw new Error('잘못된 측정값입니다.');return {title:String(r.title).slice(0,300),executionMs:r.executionMs,wallMs:r.wallMs,audioSeconds:r.audioSeconds,segments:r.segments,completed:r.completed,executionTimeIncomplete:!!r.executionTimeIncomplete};});
        await put('settings',{id:'narration-last-report',value:{summary}});lastReport={summary};renderMetrics();toast('제작 측정 리포트를 가져왔습니다.');
      }catch(error){toast(error.message);}finally{e.target.value='';}return;
    }
    if(e.target.id!=='narration-import-files')return;const input=e.target;
    try{const files=[...input.files],manifestFile=files.find(f=>f.name==='narration-result.json');if(!manifestFile)throw new Error('narration-result.json이 있는 완성 폴더를 선택해 주세요.');if(manifestFile.size>20*1024*1024)throw new Error('결과 목록이 너무 큽니다.');const manifest=JSON.parse(await manifestFile.text());if(manifest.version!==1||manifest.provider!=='runpod-qwen3'||!Array.isArray(manifest.books)||!manifest.books.length||manifest.books.length>100)throw new Error('완성된 책이 없는 결과 파일입니다.');
      const parent=manifestFile.webkitRelativePath.slice(0,-manifestFile.name.length),byPath=new Map(files.map(f=>[f.webkitRelativePath,f]));let imported=0;
      for(const book of manifest.books){
        const doc=state.docs.find(d=>d.id===book.id);if(!doc)throw new Error(`${book.title}: 같은 원본 책을 먼저 서재에 추가해 주세요.`);
        const pages=await pagesFor(doc);if(await hash(JSON.stringify(pages))!==book.sourceHash)throw new Error('원고가 변경되어 음원을 연결할 수 없습니다.');
        if(!Array.isArray(book.segments)||!book.segments.length||book.segments.length>10000)throw new Error('잘못된 구간 목록입니다.');
        const items=[],ids=new Set();let previousPage=-1,previousEnd=0;
        for(const s of book.segments){
          if(!/^s\d{6}$/.test(s.id)||ids.has(s.id)||s.audioFile!==s.id+'.wav'||!Number.isInteger(s.page)||!pages[s.page]||!Number.isInteger(s.start)||!Number.isInteger(s.end)||s.start<0||s.end<=s.start||s.end>pages[s.page].length||pages[s.page].slice(s.start,s.end)!==s.text||s.page<previousPage||(s.page===previousPage&&s.start<previousEnd)||!Number.isFinite(s.audioSeconds)||s.audioSeconds<=0)throw new Error('음원 구간 검증에 실패했습니다.');
          ids.add(s.id);previousPage=s.page;previousEnd=s.end;const file=byPath.get(parent+s.audioFile);if(!file||file.size>50*1024*1024)throw new Error(`${s.audioFile}: 음원이 없거나 크기 제한을 초과했습니다.`);
          const header=new Uint8Array(await file.slice(0,12).arrayBuffer());if(String.fromCharCode(...header.slice(0,4))!=='RIFF'||String.fromCharCode(...header.slice(8,12))!=='WAVE')throw new Error('WAV 형식을 확인해 주세요.');
          const id=`narration:${book.id}:${s.id}`;items.push({id,blob:file,segment:{id:s.id,fileId:id,page:s.page,start:s.start,end:s.end,text:s.text,audioSeconds:s.audioSeconds}});
        }
        const prior=await get('settings','narration:'+book.id);
        await new Promise((resolve,reject)=>{const tx=state.db.transaction(['files','settings'],'readwrite');for(const old of prior?.value?.segments||[])tx.objectStore('files').delete(old.fileId);for(const item of items)tx.objectStore('files').put({id:item.id,blob:item.blob});tx.objectStore('settings').put({id:'narration:'+book.id,value:{sourceHash:book.sourceHash,settings:manifest.settings,segments:items.map(x=>x.segment)}});tx.oncomplete=resolve;tx.onerror=()=>reject(new Error('브라우저 저장 공간이 부족하거나 저장에 실패했습니다.'));tx.onabort=()=>reject(new Error('저장이 취소되었습니다.'));});imported++;status(`${imported}권의 완성 음원을 저장했습니다.`);
      }
      toast('책의 듣기 버튼에서 저장된 AI 음원을 재생할 수 있습니다.');
    }catch(error){status(error.message);toast(error.message);}finally{input.value='';}
  });
  function stop(){playToken++;playing=false;if(audio){audio.pause();audio.src='';audio=null;}if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}$('#transcript-body').classList.remove('spoken-line');$('#listen-page').textContent='▷ 듣기';$('#listen-page').setAttribute('aria-pressed','false');}
  async function playSaved(){
    if(starting)return true;starting=true;
    try{return await startSaved();}catch{stop();toast('저장된 음원을 불러오지 못했습니다.');return true;}finally{starting=false;}
  }
  async function startSaved(){
    if(!state.active)return false;if(playing){stop();return true;}
    const requestToken=playToken;
    const bookId=state.active.id,saved=await get('settings','narration:'+bookId);if(!saved?.value?.segments?.length)return false;
    if(requestToken!==playToken||!state.active||state.active.id!==bookId)return true;
    if($('#record-voice').getAttribute('aria-pressed')==='true'){toast('녹음을 마친 뒤 듣기를 시작해 주세요.');return true;}
    const pages=state.active.type==='text'?state.textPages:await pagesFor(state.active);
    if(await hash(JSON.stringify(pages))!==saved.value.sourceHash){toast('원고와 음원 버전이 다릅니다. 다시 제작해 주세요.');return true;}
    if(requestToken!==playToken||!state.active||state.active.id!==bookId)return true;
    const segments=saved.value.segments;let index=segments.findIndex(s=>s.page>=currentIndex());if(index<0){toast('현재 페이지 이후에는 저장된 음원이 없습니다.');return true;}
    stop();playing=true;const token=++playToken;
    async function next(){
      if(token!==playToken||state.active?.id!==bookId)return;
      const s=segments[index++];if(!s){stop();return;}
      const record=await get('files',s.fileId);if(token!==playToken)return;if(!record){stop();toast('저장된 음원을 찾을 수 없습니다.');return;}
      // onFlip stops playback on user navigation. Internal page moves are guarded.
      internalJump=true;try{jump(s.page);}finally{internalJump=false;}
      if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=URL.createObjectURL(record.blob);audio=new Audio(objectUrl);audio.playbackRate=Number($('#voice-rate').value);
      $('#transcript').hidden=false;$('#transcript-body').textContent=s.text;$('#transcript-body').dataset.readable='true';$('#transcript-body').classList.add('spoken-line');
      $('#listen-page').textContent='Ⅱ AI 음원 중지';$('#listen-page').setAttribute('aria-pressed','true');audio.onended=()=>next().catch(()=>{stop();toast('음원 재생에 실패했습니다.');});audio.onerror=()=>{stop();toast('음원 재생에 실패했습니다.');};
      try{await audio.play();}catch{stop();toast('재생 버튼을 다시 눌러 주세요.');}
    }
    await next();return true;
  }
  let internalJump=false;
  window.addEventListener('folio:page',()=>{if(!internalJump){stop();$('#transcript-body').classList.remove('spoken-line');}});
  window.addEventListener('folio:close',()=>{stop();$('#transcript-body').classList.remove('spoken-line');});
  $('#record-voice').addEventListener('click',()=>stop());
  return {playSaved,stop};
}
