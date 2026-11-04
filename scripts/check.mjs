import { readFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
for (const file of ['dist/app.js','dist/cafe.js','dist/auth-session.js','dist/google-auth.js','dist/firebase-config.js','dist/narration-core.js','dist/narration-studio.js','lib/narration/runpod.mjs','lib/narration/batch.mjs','scripts/narration-batch.mjs','scripts/inspect-runpod.mjs','server.mjs','api/production-jobs.mjs']) execFileSync(process.execPath,['--check',file]);
const html=await readFile('dist/index.html','utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
assert.equal(new Set(ids).size,ids.length,'Duplicate DOM IDs');
for(const match of html.matchAll(/(?:src|href)="\.\/([^"#]+)"/g)) await access('dist/'+match[1]);
const config=JSON.parse(await readFile('vercel.json','utf8'));
assert.equal(config.outputDirectory,'dist');
assert.ok(!config.crons,'No automatic billable jobs');
const {default:handler}=await import('../api/production-jobs.mjs');
for(const method of ['GET','POST']){
 const result={headers:{},setHeader(k,v){this.headers[k]=v;},status(s){this.code=s;return this;},json(value){this.body=value;return this;}};
 handler({method,headers:{authorization:'Bearer untrusted'},body:{role:'admin',approved:true}},result);
 assert.equal(result.code,method==='POST'?503:405);
 assert.ok(!result.body.jobId,'Disabled API must not enqueue a paid job');
}
console.log('PASS: syntax, unique IDs, local entry assets, Vercel config, production API fail-closed behavior.');
