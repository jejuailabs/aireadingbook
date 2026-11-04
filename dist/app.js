import * as pdfjs from './vendor/pdfjs/build/pdf.mjs';
pdfjs.GlobalWorkerOptions.workerSrc='./vendor/pdfjs/build/pdf.worker.mjs';
const $=s=>document.querySelector(s);
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LABELS={pdf:'PDF',image:'IMAGE',text:'TEXT',demo:'SAMPLE'};
const state={db:null,docs:[],filter:'all',query:'',busy:false,active:null,pdf:null,flip:null,nodes:[],cache:new Map(),generation:0,rendering:false,renderTask:null,pending:[],single:false,auto:null,zoom:1.5,thumbObserver:null,urls:new Set()};
let toastTimer,resizeTimer,saveTimer,deleteId;
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,5000);}
function openDatabase(){return new Promise((resolve,reject)=>{const req=indexedDB.open('folio-library',1);req.onupgradeneeded=()=>{for(const name of ['documents','files','settings'])req.result.createObjectStore(name,{keyPath:'id'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function database(store,mode,operation){return new Promise((resolve,reject)=>{const tx=state.db.transaction(store,mode);let result;const req=operation(tx.objectStore(store));if(req)req.onsuccess=()=>result=req.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('저장이 취소되었습니다.'));});}
const get=(store,id)=>database(store,'readonly',s=>s.get(id));
const put=(store,value)=>database(store,'readwrite',s=>s.put(value));
function saveImported(meta,file){return new Promise((resolve,reject)=>{const tx=state.db.transaction(['documents','files'],'readwrite');tx.objectStore('documents').put(meta);tx.objectStore('files').put({id:meta.id,blob:file});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
async function persistDoc(doc){try{await put('documents',{...doc});}catch{toast('읽은 위치를 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.');}}
async function createPDF(blob){const task=pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer()),cMapUrl:'./vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'./vendor/pdfjs/standard_fonts/',wasmUrl:'./vendor/pdfjs/wasm/',isEvalSupported:false});try{return await task.promise;}catch(error){await task.destroy().catch(()=>{});throw error;}}
async function pdfCanvas(pdf,index,width){const page=await pdf.getPage(index+1);const base=page.getViewport({scale:1});const viewport=page.getViewport({scale:width/base.width});const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;page.cleanup();return canvas;}
function canvasBlob(canvas){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('이미지를 만들 수 없습니다.')),'image/jpeg',.9));}
function objectURL(blob){const url=URL.createObjectURL(blob);state.urls.add(url);return url;}
function releaseURL(url){if(state.urls.delete(url))URL.revokeObjectURL(url);}
function sizeLabel(bytes){return bytes>=1048576?(bytes/1048576).toFixed(1)+' MB':Math.max(1,Math.round(bytes/1024))+' KB';}
function typeOf(file){const ext=file.name.split('.').pop().toLowerCase();return ext==='pdf'?'pdf':['jpg','jpeg','png','webp'].includes(ext)?'image':['txt','md'].includes(ext)?'text':null;}
function paginateText(text){const lines=[];for(const paragraph of text.replace(/\r\n?/g,'\n').replace(/\t/g,'    ').split('\n')){let line='',units=0;for(const char of paragraph){const unit=char.codePointAt(0)>255?2:1;if(units+unit>56){lines.push(line);line='';units=0;}line+=char;units+=unit;}lines.push(line);}const pages=[];for(let i=0;i<lines.length;i+=27)pages.push(lines.slice(i,i+27).join('\n'));return pages.length?pages:[''];}
const demoPages=[
 {kind:'cover',kicker:'FOLIO / A READING COMPANION',title:'The quiet<br>art of<br>reading.',body:'한 장씩, 나만의 속도로.',note:'문서가 책이 되는 순간'},
 {kicker:'01 — WELCOME TO YOUR LIBRARY',title:'문서를 모으는 곳에서,<br>생각을 발견하는 곳으로.',body:'저장해 둔 보고서, 다시 보고 싶은 자료, 여행에서 가져온 한 장의 이미지. 좋은 문서는 읽을 때마다 새로운 문장을 건넵니다.\n\nFolio는 그런 문서를 위한 작은 서재입니다. 여러 파일을 한 번에 놓고, 표지를 골라, 한 장씩 펼쳐보세요.',note:'이 책은 기능을 체험하기 위한 예시 문서입니다.'},
 {kind:'quote',kicker:'A MOMENT TO SLOW DOWN',title:'“좋은 문장은<br>서두르지 않는<br>사람에게 머문다.”',body:'잠시 속도를 늦추고,\n다음 장을 넘겨보세요.',note:'FOLIO ORIGINAL'},
 {kicker:'02 — MAKE IT YOURS',title:'흩어져 있던 파일이<br>하나의 서재가 됩니다.',body:'서재 위쪽의 문서 추가 버튼을 누르거나, 파일 여러 개를 화면에 끌어다 놓으세요. PDF와 이미지, 텍스트 파일을 추가할 수 있습니다.\n\n표지 아래 별을 누르면 즐겨찾기에 모입니다. 검색창에서는 제목으로 문서를 찾고, 최근 읽은 문서에서는 이어 읽을 책을 고를 수 있습니다.',note:'PDF · IMAGE · TEXT'},
 {kicker:'03 — A BETTER WAY TO READ',title:'넘기는 움직임까지,<br>자연스럽게.',body:'페이지 가장자리나 아래 모서리를 잡고 천천히 끌어보세요. 종이와 함께 그림자가 움직입니다.\n\n화면 양쪽의 화살표와 키보드 방향키도 사용할 수 있습니다. 페이지 번호를 입력하면 원하는 장으로 바로 이동합니다.\n\n작은 화면에서는 한 쪽 보기로 읽을 수 있습니다.',note:'마우스 · 키보드 · 터치'},
 {kicker:'04 — LOOK A LITTLE CLOSER',title:'작은 글씨가<br>눈에 들어올 때.',body:'아래쪽 확대 버튼을 누르면 현재 페이지를 더 크게 볼 수 있습니다. PDF는 확대할 때 다시 그려 글자를 선명하게 만듭니다.\n\n자동 넘김을 켜면 선택한 간격으로 책장을 넘깁니다. 멈추고 싶은 문장을 만나면 자동 넘김 버튼을 한 번 더 눌러주세요.',note:'확대 · 전체 화면 · 자동 넘김'},
 {kind:'quote',kicker:'YOUR DOCUMENTS. YOUR OWN PACE.',title:'모든 문서를<br>다 읽지 않아도,<br>다시 펼칠 수 있도록.',body:'마지막으로 읽은 페이지는\n이 브라우저에 기억해 둡니다.',note:'A LITTLE SPACE FOR BIG IDEAS'},
 {kicker:'05 — YOUR NEXT CHAPTER',title:'이제, 당신의 문서를<br>펼쳐볼 차례입니다.',body:'왼쪽 위의 서재로 버튼을 누르고 첫 문서를 추가해 보세요.\n\n이 버전의 문서는 현재 브라우저 안에만 저장됩니다. 브라우저 데이터를 삭제하면 서재도 지워질 수 있으니 원본 파일은 따로 보관해 주세요.\n\n편안한 독서가 되기를 바랍니다.',note:'MADE FOR YOUR EVERYDAY READING'}
];
function demoMarkup(index){const page=demoPages[index%demoPages.length];return '<article class="demo-page '+(page.kind||'')+'"><div class="kicker">'+page.kicker+'</div><h2>'+page.title+'</h2>'+(page.kind==='cover'?'<div class="demo-circle"></div>':'')+page.body.split('\n\n').map(p=>'<p>'+p.replace(/\n/g,'<br>')+'</p>').join('')+'<footer><span>'+page.note+'</span><span>'+String(index+1).padStart(2,'0')+'</span></footer></article>';}
async function seed(){if(await get('settings','seeded'))return;let now=Date.now();const demos=[{id:'demo-reading',title:'한 장씩, 나만의 속도로',coverTitle:'The quiet<br>art of reading.',color:'sage',pages:8},{id:'demo-guide',title:'Folio, 나의 첫 번째 서재',coverTitle:'A place<br>for your<br>ideas.',color:'sand',pages:8}];for(const demo of demos)await put('documents',{...demo,type:'demo',size:0,created:now--,current:0,favorite:false,lastRead:0});await put('settings',{id:'seeded',value:true});}
function coverMarkup(doc){if(doc.coverAsset)return '<img class="document-cover" src="'+escapeHTML(doc.coverAsset)+'" alt="" loading="lazy">';if(doc.thumbnail)return '<img class="document-cover" src="'+doc.thumbnail+'" alt="" loading="lazy">';return '<div class="document-cover designed-cover cover-'+(doc.color||'navy')+'"><small>'+(doc.type==='demo'?'FOLIO EDITIONS':LABELS[doc.type]+' DOCUMENT')+'</small><strong>'+(doc.coverTitle||escapeHTML(doc.title))+'</strong><div class="cover-orbit"></div><em>'+(doc.type==='demo'?'A LITTLE READING COMPANION':'YOUR PERSONAL COLLECTION')+'</em></div>';}
function renderLibrary(){let docs=state.docs.filter(d=>!state.home||state.filter!=='all'||d.publication==='published'||d.type==='demo').filter(d=>state.filter==='all'||(state.filter==='favorite'?d.favorite:state.filter==='recent'?d.lastRead>0:state.filter==='uploads'?d.type!=='demo'&&!d.editorial:d.type===state.filter)).filter(d=>d.title.toLocaleLowerCase().includes(state.query));const sort=$('#sort').value;docs.sort((a,b)=>sort==='title'?a.title.localeCompare(b.title,'ko'):sort==='read'||state.filter==='recent'?(b.lastRead||0)-(a.lastRead||0):b.created-a.created);const titles={all:'새로 놓인 책',uploads:'내가 올린 책',recent:'읽고 있는 책',favorite:'찜한 책',pdf:'PDF 문서',image:'이미지',text:'텍스트 · Markdown'};$('#shelf-title').firstChild.textContent=titles[state.filter]+' ';$('#visible-count').textContent=docs.length;$('#all-count').textContent=state.docs.length;$('#document-grid').innerHTML=docs.map(doc=>'<article class="document-card" data-id="'+doc.id+'"><button class="cover-button" data-action="open" aria-label="'+escapeHTML(doc.title)+' 열기"><div class="cover-wrap">'+coverMarkup(doc)+'</div><h3 class="card-title">'+escapeHTML(doc.title)+'</h3></button><div class="card-meta"><span class="file-badge">'+LABELS[doc.type]+'</span><span>'+doc.pages+'쪽</span><span>·</span><span>'+(doc.author?escapeHTML(doc.author):doc.type==='demo'?'Folio 오리지널':sizeLabel(doc.size))+'</span></div><button class="favorite-button '+(doc.favorite?'on':'')+'" data-action="favorite" aria-label="'+escapeHTML(doc.title)+' 즐겨찾기" aria-pressed="'+doc.favorite+'">'+(doc.favorite?'★':'☆')+'</button><button class="delete-button" data-action="delete" aria-label="'+escapeHTML(doc.title)+' 삭제">×</button><div class="progress-track" title="'+(doc.lastRead?'읽던 위치 '+(doc.current+1)+'쪽':'아직 읽지 않음')+'"><i style="width:'+(doc.lastRead?Math.round((doc.current+1)/doc.pages*100):0)+'%"></i></div></article>').join('');$('#empty-state').hidden=docs.length>0;window.dispatchEvent(new Event('folio:library'));}
async function importFiles(files){if(state.busy){toast('이전 문서를 추가하는 중입니다. 잠시만 기다려 주세요.');return;}state.busy=true;$('#upload-button').disabled=true;$('#import-status').hidden=false;const errors=[];let added=0,duplicates=0;for(const [index,file]of Array.from(files).entries()){let pdf;try{const type=typeOf(file);if(!type)throw new Error('지원하지 않는 형식입니다. PDF로 변환해 추가해 주세요.');if(file.size>100*1024*1024)throw new Error('파일당 100 MB까지 추가할 수 있습니다.');if(!file.size)throw new Error('빈 파일입니다.');$('#import-status').textContent=(index+1)+' / '+files.length+' · '+file.name+' 준비 중…';const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))).map(b=>b.toString(16).padStart(2,'0')).join('');if(state.docs.some(d=>d.hash===hash)){duplicates++;continue;}const doc={id:crypto.randomUUID(),title:file.name.replace(/\.[^.]+$/,''),filename:file.name,type,hash,size:file.size,created:Date.now(),lastRead:0,current:0,favorite:false,pages:1,color:type==='text'?'clay':'navy'};if(type==='pdf'){pdf=await createPDF(file);doc.pages=pdf.numPages;const canvas=await pdfCanvas(pdf,0,280);doc.thumbnail=canvas.toDataURL('image/jpeg',.8);const page=await pdf.getPage(1);const vp=page.getViewport({scale:1});doc.ratio=vp.height/vp.width;}else if(type==='image'){const bitmap=await createImageBitmap(file);const c=document.createElement('canvas');c.width=280;c.height=Math.max(1,Math.round(280*bitmap.height/bitmap.width));const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(bitmap,0,0,c.width,c.height);doc.thumbnail=c.toDataURL('image/jpeg',.85);doc.ratio=Math.min(2,Math.max(.5,bitmap.height/bitmap.width));bitmap.close();}else{doc.pages=paginateText(await file.text()).length;}await saveImported(doc,file);state.docs.push(doc);added++;renderLibrary();}catch(error){errors.push(file.name+': '+(error.name==='PasswordException'?'암호가 설정된 PDF입니다. 암호를 해제한 사본을 추가해 주세요.':error.name==='InvalidPDFException'?'정상적인 PDF 파일이 아닙니다.':error.name==='QuotaExceededError'?'브라우저 저장 공간이 부족합니다.':error.message||'문서를 읽을 수 없습니다.'));}finally{if(pdf)await pdf.loadingTask.destroy().catch(console.error);}}state.busy=false;$('#upload-button').disabled=false;$('#file-input').value='';$('#import-status').textContent=[added+'개 추가 완료',duplicates?duplicates+'개 중복 건너뜀':'',errors.length?errors.length+'개 추가하지 못함':''].filter(Boolean).join(' · ');if(errors.length){$('#import-status').textContent+='\n'+errors.join('\n');$('#import-status').style.whiteSpace='pre-wrap';}else toast(added+'개 문서를 서재에 추가했습니다.');}
function textCanvas(text,index,width){const c=document.createElement('canvas');c.width=800;c.height=1132;const ctx=c.getContext('2d');ctx.fillStyle='#fffef9';ctx.fillRect(0,0,800,1132);ctx.fillStyle='#35463c';ctx.font='22px "Malgun Gothic", sans-serif';let y=90;for(const line of text.split('\n')){ctx.fillText(line,72,y);y+=34;}ctx.fillStyle='#909987';ctx.font='16px sans-serif';ctx.textAlign='center';ctx.fillText(String(index+1),400,1080);return c;}
function currentIndex(){return state.flip?state.flip.getCurrentPageIndex():state.active?.current||0;}
function pageWidth(){return state.nodes[0]?.getBoundingClientRect().width||400;}
async function renderPage(index,width){const doc=state.active;if(doc.type==='pdf')return pdfCanvas(state.pdf,index,width);if(doc.type==='text')return textCanvas(state.textPages[index],index,width);if(doc.type==='image'){const bitmap=await createImageBitmap(state.blob);const c=document.createElement('canvas');const scale=Math.min(width/bitmap.width,1);c.width=Math.max(1,Math.round(bitmap.width*scale));c.height=Math.max(1,Math.round(bitmap.height*scale));c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height);bitmap.close();return c;}return null;}
function desiredPages(){const at=currentIndex(),count=state.active.pages;return [...new Set([at,at+1,at+2,at+3,at-1,at-2,at+4,at+5,at-3].filter(i=>i>=0&&i<count))];}
function applyPage(index,url){const content=state.nodes[index]?.querySelector('.page-content');if(content){const img=document.createElement('img');img.alt='문서 '+(index+1)+'쪽';img.src=url;content.replaceChildren(img);}}
function preparePages(){if(!state.active||['demo','text'].includes(state.active.type))return;state.pending=desiredPages();if(state.rendering)return state.renderPromise;state.rendering=true;const generation=state.generation;state.renderPromise=(async()=>{try{while(state.pending.length&&generation===state.generation){const index=state.pending.shift();const renderWidth=Math.min(2200,Math.max(800,pageWidth()*Math.min(devicePixelRatio,2)*(Math.abs(index-currentIndex())<=1?view.targetScale:1)));if(state.cache.has(index)&&state.cache.get(index).width>=renderWidth*.95)continue;try{const canvas=await renderPage(index,renderWidth);if(generation!==state.generation)break;const blob=await canvasBlob(canvas);canvas.width=canvas.height=1;if(generation!==state.generation)break;const url=objectURL(blob);const previous=state.cache.get(index);state.cache.set(index,{url,width:renderWidth});applyPage(index,url);if(previous)releaseURL(previous.url);if(state.cache.has(currentIndex())&&(currentIndex()===0||currentIndex()===state.active.pages-1||state.flip?.getOrientation()==='portrait'||state.cache.has(currentIndex()+1)))$('#reader-loading').hidden=true;}catch(error){if(generation!==state.generation)break;const content=state.nodes[index]?.querySelector('.page-content');if(content){content.classList.add('page-error');content.textContent='이 페이지를 표시하지 못했습니다. 문서를 다시 열어주세요.';}console.error('Page render failed',error);}}if(generation===state.generation){const keep=new Set(desiredPages());for(const [i,item]of state.cache){if(!keep.has(i)){state.nodes[i]?.querySelector('.page-content')?.replaceChildren();releaseURL(item.url);state.cache.delete(i);}}}}finally{state.rendering=false;if(state.active&&generation!==state.generation)preparePages();}})();return state.renderPromise;}
function dimensions(){const stage=$('#reader-stage');const narrow=window.innerWidth<760;const availableWidth=Math.max(200,stage.clientWidth-(narrow?50:140));const availableHeight=Math.max(180,stage.clientHeight-84);const single=state.single||state.active.pages===1||availableWidth<580;const ratio=Math.min(2,Math.max(.55,state.active.ratio||1.414));const width=Math.floor(Math.min(availableWidth/(single?1:2),availableHeight/ratio,560));return {width,height:Math.floor(width*ratio),single};}
function buildBook(start=0){if(!state.active)return;const dims=dimensions();if(state.flip){state.flip.destroy();state.flip=null;}const mount=$('#book-mount');mount.replaceChildren();mount.style.width=(dims.width*(dims.single?1:2))+'px';mount.style.height=dims.height+'px';const book=document.createElement('div');book.id='book';mount.append(book);state.nodes=Array.from({length:state.active.pages},(_,i)=>{const p=document.createElement('div');p.className='page';p.style.setProperty('--page-width',dims.width+'px');p.dataset.page=i;p.innerHTML='<div class="page-content">'+(state.active.type==='demo'?demoMarkup(i):state.active.type==='text'?'<div class="text-page">'+escapeHTML(state.textPages[i])+'</div><span class="text-page-number">'+(i+1)+'</span>':'<span class="page-placeholder">'+(i+1)+'쪽 준비 중</span>')+'</div>';book.append(p);return p;});for(const [i,item]of state.cache)applyPage(i,item.url);if(state.active.pages===1){book.style.width=dims.width+'px';book.style.height=dims.height+'px';state.nodes[0].style.width='100%';state.nodes[0].style.height='100%';state.flip={getCurrentPageIndex:()=>0,getOrientation:()=> 'portrait',getState:()=> 'read',destroy:()=>{},turnToPage:()=>{},flipNext:()=>{},flipPrev:()=>{}};onFlip();return;}state.flip=new St.PageFlip(book,{width:dims.width,height:dims.height,size:'fixed',showCover:true,usePortrait:true,drawShadow:true,maxShadowOpacity:.28,flippingTime:matchMedia('(prefers-reduced-motion: reduce)').matches?1:720,startPage:Math.min(start,state.active.pages-1),mobileScrollSupport:false,showPageCorners:true,disableFlipByClick:true,useMouseEvents:!state.selecting,swipeDistance:25});state.flip.on('flip',()=>onFlip());state.flip.loadFromHTML(state.nodes);onFlip();}
function onFlip(){if(!state.active||!state.flip)return;window.dispatchEvent(new Event('folio:page')); const index=currentIndex();state.active.current=index;state.active.lastRead=Date.now();$('#page-number').value=index+1;$('#page-total').textContent='/ '+state.active.pages;$('#page-number').max=state.active.pages;const atEnd=index>=state.active.pages-(state.flip.getOrientation()==='landscape'?2:1);$('#prev-page').disabled=index===0;$('#first-page').disabled=index===0;$('#next-page').disabled=atEnd;$('#last-page').disabled=atEnd;if(atEnd)stopAuto();clearTimeout(saveTimer);const doc=state.active;saveTimer=setTimeout(()=>persistDoc(doc),250);preparePages();for(const thumb of document.querySelectorAll('.thumb'))thumb.classList.toggle('active',Number(thumb.dataset.page)===index);}
async function openDocument(id){if(state.active)return;const doc=state.docs.find(d=>d.id===id);if(!doc)return;state.active=doc;resetView(true);const generation=++state.generation;$('#reader-title').textContent=doc.title;$('#reader-type').textContent=LABELS[doc.type]+' · '+doc.pages+' PAGES';$('#reader-favorite').textContent=doc.favorite?'★':'☆';$('#reader-favorite').setAttribute('aria-pressed',String(doc.favorite));$('#download-button').disabled=doc.type==='demo';$('#reader').hidden=false;$('#library').inert=true;$('#reader-loading').hidden=false;document.body.style.overflow='hidden';try{if(doc.type!=='demo'){const record=await get('files',id);if(generation!==state.generation)return;if(!record)throw new Error('저장된 파일을 찾을 수 없습니다.');state.blob=record.blob;if(doc.type==='pdf'){const pdf=await createPDF(state.blob);if(generation!==state.generation){await pdf.loadingTask.destroy();return;}state.pdf=pdf;}else if(doc.type==='text')state.textPages=paginateText(await state.blob.text());}if(generation!==state.generation)return;buildBook(doc.current);await preparePages();if(generation!==state.generation)return;$('#reader-loading').hidden=true;if(document.activeElement===document.body)$('#back-button').focus();}catch(error){if(generation!==state.generation)return;await closeReader();toast('문서를 열 수 없습니다. '+(error.message||''));}}
async function closeReader(){if(!state.active)return;window.dispatchEvent(new Event('folio:close')); const doc=state.active;state.active=null;++state.generation;resetView(true);stopAuto();clearTimeout(saveTimer);await persistDoc(doc);state.thumbObserver?.disconnect();state.thumbObserver=null;state.flip?.destroy();state.flip=null;$('#book-mount').replaceChildren();$('#thumbnail-panel').hidden=true;$('#thumbnail-panel').replaceChildren();$('#thumbnails-button').setAttribute('aria-expanded','false');if($('#zoom-dialog').open)$('#zoom-dialog').close();for(const item of state.cache.values())releaseURL(item.url);state.cache.clear();const pdf=state.pdf;state.pdf=null;if(pdf)await pdf.loadingTask.destroy();state.blob=null;state.textPages=null;state.pending=[];$('#reader').hidden=true;$('#library').inert=false;document.body.style.overflow='';if(document.fullscreenElement)await document.exitFullscreen().catch(()=>{});renderLibrary();document.querySelector('[data-id="'+doc.id+'"] .cover-button')?.focus();}
async function toggleFavorite(id){const doc=state.docs.find(d=>d.id===id);if(!doc)return;doc.favorite=!doc.favorite;await persistDoc(doc);renderLibrary();if(state.active?.id===id){$('#reader-favorite').textContent=doc.favorite?'★':'☆';$('#reader-favorite').setAttribute('aria-pressed',String(doc.favorite));}}
function stopAuto(){clearInterval(state.auto);state.auto=null;$('#auto-button').setAttribute('aria-pressed','false');$('#auto-button').innerHTML='▷ <span>자동 넘김</span>';}
function startAuto(){stopAuto();if(!state.active||$('#next-page').disabled)return;state.auto=setInterval(()=>{if(document.hidden)return;if($('#next-page').disabled){stopAuto();return;}if(state.flip.getState()==='read')state.flip.flipNext();},Number($('#auto-speed').value)*1000);$('#auto-button').setAttribute('aria-pressed','true');$('#auto-button').innerHTML='Ⅱ <span>일시 정지</span>';}
function jump(index){stopAuto();if(!state.active)return;state.flip.turnToPage(Math.max(0,Math.min(state.active.pages-1,index)));onFlip();}
async function showThumbnails(){const panel=$('#thumbnail-panel');panel.hidden=!panel.hidden;$('#thumbnails-button').setAttribute('aria-expanded',String(!panel.hidden));if(panel.hidden)return;panel.innerHTML=Array.from({length:state.active.pages},(_,i)=>'<button class="thumb '+(i===currentIndex()?'active':'')+'" data-page="'+i+'" aria-label="'+(i+1)+'쪽으로 이동"><div class="thumb-preview">'+(state.cache.has(i)?'<img src="'+state.cache.get(i).url+'" alt="">':(i+1))+'</div>'+(i+1)+'</button>').join('');panel.querySelector('.active')?.scrollIntoView({block:'nearest',inline:'center'});}
let zoomTicket=0,zoomURL=null;
async function renderZoom(){if(!state.active)return;const ticket=++zoomTicket;const index=currentIndex();const generation=state.generation;const content=$('#zoom-content');content.textContent='선명한 페이지를 준비하는 중…';$('#zoom-level').textContent=Math.round(state.zoom*100)+'%';$('#zoom-title').textContent=(index+1)+'쪽 확대';const sheet=document.createElement('div');sheet.className='zoom-sheet';sheet.style.setProperty('--page-width',(620*state.zoom)+'px');sheet.style.width=Math.round(620*state.zoom)+'px';sheet.style.minHeight=Math.round(620*state.zoom*(state.active.ratio||1.414))+'px';if(state.active.type==='demo')sheet.innerHTML=demoMarkup(index);else if(state.active.type==='text'){const pre=document.createElement('div');pre.className='text-page';pre.style.fontSize=(16*state.zoom)+'px';pre.textContent=state.textPages[index];sheet.append(pre);}else{try{const canvas=await renderPage(index,Math.min(2800,620*state.zoom*Math.min(devicePixelRatio,2)));if(ticket!==zoomTicket||generation!==state.generation)return;const blob=await canvasBlob(canvas);if(ticket!==zoomTicket||generation!==state.generation)return;if(zoomURL)releaseURL(zoomURL);zoomURL=objectURL(blob);const img=document.createElement('img');img.src=zoomURL;img.alt=(index+1)+'쪽 확대';sheet.append(img);canvas.width=canvas.height=1;}catch{if(ticket===zoomTicket)content.textContent='확대 화면을 불러오지 못했습니다.';return;}}if(ticket===zoomTicket&&generation===state.generation)content.replaceChildren(sheet);}
$('#upload-button').onclick=()=>$('#file-input').click();
$('#file-input').onchange=e=>importFiles(e.target.files);
let dragDepth=0;document.addEventListener('dragenter',e=>{if(!Array.from(e.dataTransfer?.types||[]).includes('Files'))return;e.preventDefault();dragDepth++;$('#drop-zone').classList.add('dragging');});
document.addEventListener('dragover',e=>{if(Array.from(e.dataTransfer?.types||[]).includes('Files'))e.preventDefault();});
document.addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;$('#drop-zone').classList.remove('dragging');}});
document.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('#drop-zone').classList.remove('dragging');if(state.active){toast('서재로 돌아가서 문서를 추가해 주세요.');return;}if(e.dataTransfer?.files.length)importFiles(e.dataTransfer.files);});
document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{state.filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b===button));renderLibrary();});
$('#search').oninput=e=>{state.query=e.target.value.toLocaleLowerCase();renderLibrary();};
$('#sort').onchange=renderLibrary;
$('#document-grid').onclick=e=>{const button=e.target.closest('[data-action]'),card=e.target.closest('[data-id]');if(!button||!card)return;const id=card.dataset.id;if(button.dataset.action==='open')openDocument(id);else if(button.dataset.action==='favorite')toggleFavorite(id);else{deleteId=id;$('#delete-description').textContent=state.docs.find(d=>d.id===id).title;$('#delete-dialog').showModal();}};
$('#delete-cancel').onclick=()=>$('#delete-dialog').close();
$('#delete-confirm').onclick=async()=>{try{await new Promise((resolve,reject)=>{const tx=state.db.transaction(['documents','files'],'readwrite');tx.objectStore('documents').delete(deleteId);tx.objectStore('files').delete(deleteId);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});state.docs=state.docs.filter(d=>d.id!==deleteId);$('#delete-dialog').close();renderLibrary();toast('문서를 서재에서 삭제했습니다.');}catch{toast('삭제하지 못했습니다. 다시 시도해 주세요.');}};
$('#back-button').onclick=closeReader;
$('#reader-favorite').onclick=()=>state.active&&toggleFavorite(state.active.id);
$('#prev-page').onclick=()=>{stopAuto();state.flip?.flipPrev();};
$('#next-page').onclick=()=>{stopAuto();state.flip?.flipNext();};
$('#first-page').onclick=()=>jump(0);
$('#last-page').onclick=()=>jump(state.active.pages-1);
$('#page-number').onchange=e=>jump((Number(e.target.value)||1)-1);
$('#page-number').onkeydown=e=>{if(e.key==='Enter'){jump((Number(e.target.value)||1)-1);e.target.blur();}};
$('#layout-button').onclick=()=>{state.single=!state.single;$('#layout-button').setAttribute('aria-pressed',String(state.single));$('#layout-button').innerHTML=state.single?'▥ <span>양면 보기</span>':'▥ <span>한 쪽 보기</span>';resetView(true);buildBook(currentIndex());};
$('#auto-button').onclick=()=>state.auto?stopAuto():startAuto();
$('#auto-speed').onchange=()=>{if(state.auto)startAuto();};
$('#thumbnails-button').onclick=showThumbnails;
$('#thumbnail-panel').onclick=e=>{const thumb=e.target.closest('[data-page]');if(thumb){jump(Number(thumb.dataset.page));$('#thumbnail-panel').hidden=true;$('#thumbnails-button').setAttribute('aria-expanded','false');}};
$('#fullscreen-button').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('#reader').requestFullscreen();}catch{toast('이 브라우저에서는 전체 화면 전환을 지원하지 않습니다.');}};
$('#download-button').onclick=()=>{if(!state.blob)return;const url=objectURL(state.blob);const a=document.createElement('a');a.href=url;a.download=state.active.filename||state.active.title;document.body.append(a);a.click();a.remove();setTimeout(()=>releaseURL(url),10000);};
$('#zoom-button').onclick=()=>{stopAuto();$('#zoom-dialog').showModal();renderZoom();};
$('#zoom-close').onclick=()=>$('#zoom-dialog').close();
$('#zoom-dialog').addEventListener('close',()=>{zoomTicket++;if(zoomURL){releaseURL(zoomURL);zoomURL=null;}$('#zoom-content').replaceChildren();});
$('#zoom-in').onclick=()=>{state.zoom=Math.min(3,state.zoom+.25);renderZoom();};
$('#zoom-out').onclick=()=>{state.zoom=Math.max(.75,state.zoom-.25);renderZoom();};
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(state.active&&!$('#reader-loading').hidden)return;if(state.active)buildBook(currentIndex());},180);});
document.addEventListener('keydown',e=>{if(!state.active||e.target.matches('input,textarea,select')||$('#zoom-dialog').open||$('#delete-dialog').open)return;if(e.key==='Escape'){e.preventDefault();closeReader();}else if(e.key==='ArrowRight'){e.preventDefault();stopAuto();state.flip?.flipNext();}else if(e.key==='ArrowLeft'){e.preventDefault();stopAuto();state.flip?.flipPrev();}else if(e.key==='Home'){e.preventDefault();jump(0);}else if(e.key==='End'){e.preventDefault();jump(state.active.pages-1);}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopAuto();});

// Keep wheel interaction on the book surface; all work stays in the browser.
const view={scale:1,targetScale:1,x:0,y:0,targetX:0,targetY:0,raf:0,drag:null,qualityTimer:null};
function clampView(){
 const mount=$('#book-mount'),stage=$('#reader-stage');
 if(view.targetScale<=1){view.targetX=0;view.targetY=0;return;}
 const maxX=Math.max(0,mount.offsetWidth*(view.targetScale-1)/2);
 const maxY=Math.max(0,mount.offsetHeight*(view.targetScale-1)/2);
 view.targetX=Math.max(-maxX,Math.min(maxX,view.targetX));
 view.targetY=Math.max(-maxY,Math.min(maxY,view.targetY));
}
function drawView(){
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const k=reduced?1:.24;
 view.scale+=(view.targetScale-view.scale)*k;
 view.x+=(view.targetX-view.x)*k;view.y+=(view.targetY-view.y)*k;
 const done=Math.abs(view.scale-view.targetScale)<.001&&Math.abs(view.x-view.targetX)<.1&&Math.abs(view.y-view.targetY)<.1;
 if(done){view.scale=view.targetScale;view.x=view.targetX;view.y=view.targetY;}
 $('#book-mount').style.transform='translate3d('+view.x+'px,'+view.y+'px,0) scale('+view.scale+')';
 $('#reader-stage').classList.toggle('is-zoomed',view.scale>1.02);
 $('#view-zoom-label').textContent=Math.round(view.targetScale*100)+'%';
 $('#view-zoom-out').disabled=view.targetScale<=.75;
 $('#view-zoom-in').disabled=view.targetScale>=3;
 $('#reader-hint').textContent=view.targetScale>1.02?'드래그로 이동 · 휠로 확대/축소 · 상단 배율을 누르면 원래 크기로':view.targetScale<.98?'휠로 확대 · ← → 키로 넘기기 · 상단 배율로 원래 크기 복원':'휠로 확대 · 모서리를 끌거나 ← → 키로 넘기기';
 view.raf=done?0:requestAnimationFrame(drawView);
}
function requestView(){if(!view.raf)view.raf=requestAnimationFrame(drawView);}
function setViewZoom(scale,clientX,clientY){
 if(!state.active)return;
 stopAuto();
 const mount=$('#book-mount'),rect=mount.getBoundingClientRect();
 const centerX=rect.left+rect.width/2-view.x,centerY=rect.top+rect.height/2-view.y;
 const mx=clientX===undefined?0:clientX-centerX,my=clientY===undefined?0:clientY-centerY;
 const next=Math.max(.75,Math.min(3,scale)),ratio=next/view.targetScale;
 view.targetX=mx-(mx-view.targetX)*ratio;view.targetY=my-(my-view.targetY)*ratio;
 view.targetScale=next;clampView();requestView();
 clearTimeout(view.qualityTimer);view.qualityTimer=setTimeout(()=>preparePages(),220);
}
function resetView(immediate=false){
 cancelAnimationFrame(view.raf);clearTimeout(view.qualityTimer);view.raf=0;view.drag=null;
 view.targetScale=1;view.targetX=0;view.targetY=0;
 if(immediate){view.scale=1;view.x=0;view.y=0;}
 $('#reader-stage').classList.remove('is-dragging');drawView();
}
$('#reader-stage').addEventListener('wheel',event=>{
 if(!state.active||!$('#reader-loading').hidden)return;
 event.preventDefault();
 const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?200:1);
 setViewZoom(view.targetScale*Math.exp(-Math.max(-180,Math.min(180,delta))*(event.ctrlKey?.007:.0017)),event.clientX,event.clientY);
},{passive:false});
$('#view-zoom-in').onclick=()=>setViewZoom(view.targetScale*1.25);
$('#view-zoom-out').onclick=()=>setViewZoom(view.targetScale/1.25);
$('#view-zoom-label').onclick=()=>resetView();
$('#reader-stage').addEventListener('pointerdown',event=>{
 if(state.selecting||view.scale<=1.02||event.button!==0||event.target.closest('button,input,select'))return;
 event.preventDefault();stopAuto();
 view.drag={id:event.pointerId,x:event.clientX,y:event.clientY,startX:view.targetX,startY:view.targetY};
 $('#reader-stage').setPointerCapture(event.pointerId);$('#reader-stage').classList.add('is-dragging');
});
$('#reader-stage').addEventListener('pointermove',event=>{
 if(!view.drag||view.drag.id!==event.pointerId)return;
 view.targetX=view.drag.startX+event.clientX-view.drag.x;view.targetY=view.drag.startY+event.clientY-view.drag.y;
 clampView();requestView();
});
function endPan(event){if(view.drag?.id!==event.pointerId)return;view.drag=null;$('#reader-stage').classList.remove('is-dragging');}
$('#reader-stage').addEventListener('pointerup',endPan);
$('#reader-stage').addEventListener('pointercancel',endPan);
document.addEventListener('keydown',event=>{
 if(!state.active||event.target.matches('input,textarea,select')||$('#zoom-dialog').open)return;
 if(event.key==='0'){event.preventDefault();resetView();}
 else if(event.key==='+'||event.key==='='){event.preventDefault();setViewZoom(view.targetScale*1.2);}
 else if(event.key==='-'){event.preventDefault();setViewZoom(view.targetScale/1.2);}
});

try{state.db=await openDatabase();await seed();state.docs=await database('documents','readonly',s=>s.getAll());renderLibrary();}catch(error){console.error(error);$('#import-status').hidden=false;$('#import-status').textContent='브라우저 저장소를 열 수 없습니다. 일반 브라우저 창에서 다시 열어주세요.';$('#upload-button').disabled=true;}






const {initCafe}=await import('./cafe.js');
await initCafe({state,$,get,put,database,persistDoc,renderLibrary,openDocument,currentIndex,jump,buildBook,toast,escapeHTML,paginateText,saveImported});
