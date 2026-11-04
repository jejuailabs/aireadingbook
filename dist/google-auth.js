import {initializeApp,getApps} from './vendor/firebase/firebase-app.js';
import {initializeAuth,GoogleAuthProvider,onAuthStateChanged,signInWithPopup,signOut,indexedDBLocalPersistence,browserLocalPersistence,browserSessionPersistence,browserPopupRedirectResolver} from './vendor/firebase/firebase-auth.js';
import {firebaseConfig} from './firebase-config.js';
import {createAuthSession} from './auth-session.js';

export function initGoogleAuth(){
 const dialog=document.querySelector('#account-dialog');
 const signInButton=document.querySelector('#google-sign-in');
 const signOutButton=document.querySelector('#google-sign-out');
 const message=document.querySelector('#account-message');
 const account=document.querySelector('#signed-in-account');
 const badge=document.querySelector('#account-button');
 const session=createAuthSession({config:firebaseConfig,sdk:{initializeApp,getApps,initializeAuth,GoogleAuthProvider,onAuthStateChanged,signInWithPopup,signOut,indexedDBLocalPersistence,browserLocalPersistence,browserSessionPersistence,browserPopupRedirectResolver},onChange:state=>{
  signInButton.disabled=state.busy;signOutButton.disabled=state.busy;
  signInButton.hidden=!!state.user;signOutButton.hidden=!state.user;account.hidden=!state.user;
  message.textContent=state.error||(state.busy?'Google 계정에 연결하고 있습니다…':state.user?'로그인되었습니다. 책과 독서 기록은 현재 기기에 보관됩니다.':'Google 계정으로 나만의 리딩룸을 시작하세요.');
  if(state.user){document.querySelector('#account-name').textContent=state.user.displayName;document.querySelector('#account-email').textContent=state.user.email;}
  else{document.querySelector('#account-name').textContent='';document.querySelector('#account-email').textContent='';}
  badge.textContent=state.user?state.user.displayName.slice(0,1):'로그인';badge.classList.toggle('signed-in',!!state.user);badge.setAttribute('aria-label',state.user?'Google 계정 관리':'Google 로그인');
  document.querySelectorAll('[data-account-label]').forEach(el=>el.textContent=state.user?'Google 계정 관리':'Google로 로그인');
 }});
 document.addEventListener('click',e=>{if(e.target.closest('[data-account-open]'))dialog.showModal();});
 document.querySelector('#account-close').onclick=()=>dialog.close();
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
 signInButton.onclick=()=>session.signIn();signOutButton.onclick=()=>session.signOut();
 session.start();
}
