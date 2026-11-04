import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthSession,authErrorMessage} from '../dist/auth-session.js';

function fixture(overrides={}){
 const calls=[];let changed;const auth={};
 const sdk={getApps:()=>[],initializeApp:(config,name)=>{calls.push(['init',name]);return {name};},initializeAuth:(app,options)=>{calls.push(['persistence',options.persistence.length]);return auth;},GoogleAuthProvider:class{setCustomParameters(p){calls.push(['prompt',p.prompt]);}},onAuthStateChanged:(a,cb)=>{changed=cb;return ()=>{};},signInWithPopup:async()=>{calls.push(['popup']);},signOut:async()=>{calls.push(['logout']);changed(null);},indexedDBLocalPersistence:'indexed',browserLocalPersistence:'local',browserSessionPersistence:'session',browserPopupRedirectResolver:'popup',...overrides};
 const states=[];const session=createAuthSession({sdk,config:{projectId:'test'},onChange:s=>states.push(s)});
 return {session,states,calls,change:user=>changed(user)};
}
test('startup restores auth through SDK without opening sign-in or assigning roles',()=>{
 const f=fixture();f.session.start();f.session.start();
 assert.equal(f.calls.filter(c=>c[0]==='init').length,1);assert.equal(f.calls.some(c=>c[0]==='popup'),false);
 f.change({uid:'123',displayName:'Reader',email:'reader@example.com',accessToken:'SECRET',admin:true});
 assert.deepEqual(f.session.getState().user,{uid:'123',displayName:'Reader',email:'reader@example.com'});
 assert.equal(f.session.getState().ready,true);
});
test('duplicate sign-in clicks produce one popup and release busy after completion',async()=>{
 let resolve;let count=0;const f=fixture({signInWithPopup:()=>{count++;return new Promise(r=>resolve=r);}});
 const p=f.session.signIn();await f.session.signIn();assert.equal(count,1);assert.equal(f.session.getState().busy,true);
 resolve();await p;assert.equal(f.session.getState().busy,false);
});
test('popup denial is recoverable and never exposes provider messages',async()=>{
 const f=fixture({signInWithPopup:async()=>{throw {code:'auth/popup-blocked',message:'secret-token'};}});
 await f.session.signIn();assert.match(f.session.getState().error,/팝업/);assert.equal(f.session.getState().busy,false);assert.ok(!JSON.stringify(f.states).includes('secret-token'));
});
test('logout clears user only from provider auth-state callback',async()=>{
 const f=fixture();f.session.start();f.change({uid:'x',displayName:'Reader'});await f.session.signOut();
 assert.equal(f.session.getState().user,null);assert.equal(f.calls.filter(c=>c[0]==='logout').length,1);
});
test('logout failure retains signed-in user and permits retry',async()=>{
 const f=fixture({signOut:async()=>{throw {code:'auth/network-request-failed'};}});f.session.start();f.change({uid:'x'});await f.session.signOut();
 assert.equal(f.session.getState().user.uid,'x');assert.equal(f.session.getState().busy,false);assert.match(f.session.getState().error,/네트워크/);
});
test('unauthorized domain and unknown errors have actionable safe messages',()=>{
 assert.match(authErrorMessage({code:'auth/unauthorized-domain'}),/허용 도메인/);
 assert.ok(!authErrorMessage({message:'secret',code:'unknown'}).includes('secret'));
});
