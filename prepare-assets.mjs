import {mkdir, cp} from 'node:fs/promises';
await mkdir('dist/vendor/pdfjs', {recursive:true});
for (const part of ['build','cmaps','standard_fonts','wasm']) await cp(`node_modules/pdfjs-dist/${part}`, `dist/vendor/pdfjs/${part}`, {recursive:true});
await cp('node_modules/pdfjs-dist/LICENSE','dist/vendor/pdfjs/LICENSE');
await mkdir('dist/vendor/page-flip',{recursive:true});
await cp('node_modules/page-flip/dist/js/page-flip.browser.js','dist/vendor/page-flip/page-flip.browser.js');
await cp('node_modules/page-flip/LICENSE','dist/vendor/page-flip/LICENSE');
console.log('Local browser assets ready. No CDN connection required.');
