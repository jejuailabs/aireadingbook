import http from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'dist');
const port=Number(process.env.PORT||4173);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.wasm':'application/wasm','.pdf':'application/pdf','.png':'image/png','.jpg':'image/jpeg','.bcmap':'application/octet-stream','.pfb':'application/octet-stream','.ttf':'font/ttf'};
const server=http.createServer(async(req,res)=>{
 try {
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  if(!(await stat(target)).isFile())throw new Error('Not a file');
  res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Opener-Policy':'same-origin-allow-popups','Content-Security-Policy':"default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://apis.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; worker-src 'self' blob:; connect-src 'self' blob: https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://automovie-4498a.firebaseapp.com; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-src https://automovie-4498a.firebaseapp.com https://apis.google.com"});
  res.end(req.method==='HEAD'?undefined:await readFile(target));
 } catch {res.writeHead(404);res.end('Not found');}
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Port ${port} is in use. Open http://localhost:${port} or set PORT to another number.`:error);process.exit(1);});
server.listen(port,'127.0.0.1',()=>console.log(`Folio ready: http://localhost:${port}`));

