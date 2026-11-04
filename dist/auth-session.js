// Authentication state has no authority over server/admin roles.
export function authErrorMessage(error){
 const messages={
  'auth/popup-closed-by-user':'로그인 창을 닫았습니다. 다시 눌러 이어갈 수 있어요.',
  'auth/cancelled-popup-request':'이미 로그인 창이 열려 있습니다.',
  'auth/popup-blocked':'팝업이 차단되었습니다. 이 사이트의 팝업을 허용한 뒤 다시 눌러 주세요.',
  'auth/unauthorized-domain':'이 주소에서는 아직 로그인을 사용할 수 없습니다. Firebase 인증의 허용 도메인에 현재 사이트 주소를 추가해 주세요.',
  'auth/operation-not-allowed':'Firebase에서 Google 로그인 사용 설정이 필요합니다.',
  'auth/network-request-failed':'네트워크 연결을 확인하고 다시 시도해 주세요.',
  'auth/account-exists-with-different-credential':'이 이메일에 연결된 다른 로그인 방식이 있습니다. 기존 로그인 방식으로 접속해 주세요.',
  'auth/user-disabled':'사용 중지된 계정입니다. 운영자에게 문의해 주세요.',
  'auth/too-many-requests':'요청이 많습니다. 잠시 후 다시 시도해 주세요.',
  'auth/web-storage-unsupported':'브라우저 저장 공간을 사용할 수 없습니다. 개인정보 보호 설정을 확인해 주세요.'
 };
 return messages[error?.code]||'로그인 연결을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}
export function createAuthSession({sdk,config,onChange}){
 let auth=null,provider=null,unsubscribe=null,pending=false;
 let current={user:null,busy:false,ready:false,error:''};
 const publish=patch=>{current={...current,...patch};onChange({...current});};
 function start(){
  if(auth)return;
  const app=sdk.getApps().find(a=>a.name==='reading-room')||sdk.initializeApp(config,'reading-room');
  auth=sdk.initializeAuth(app,{persistence:[sdk.indexedDBLocalPersistence,sdk.browserLocalPersistence,sdk.browserSessionPersistence],popupRedirectResolver:sdk.browserPopupRedirectResolver});
  auth.languageCode='ko';provider=new sdk.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});
  unsubscribe=sdk.onAuthStateChanged(auth,user=>publish({ready:true,user:user?{uid:user.uid,displayName:user.displayName||'독서가',email:user.email||''}:null,error:''}),error=>publish({ready:true,error:authErrorMessage(error)}));
 }
 async function signIn(){
  if(pending)return;pending=true;publish({busy:true,error:''});
  try{start();await sdk.signInWithPopup(auth,provider);}catch(error){publish({error:authErrorMessage(error)});}finally{pending=false;publish({busy:false});}
 }
 async function signOut(){
  if(pending)return;pending=true;publish({busy:true,error:''});
  try{start();await sdk.signOut(auth);}catch(error){publish({error:authErrorMessage(error)});}finally{pending=false;publish({busy:false});}
 }
 return {start,signIn,signOut,getState:()=>({...current}),dispose:()=>unsubscribe?.()};
}
