// Read-only configuration audit. Never print tokens or OAuth secrets.
import {createSign} from 'node:crypto';
try {
 const account=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||'{}');
 if(account.project_id!=='automovie-4498a')throw new Error();
 const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const now=Math.floor(Date.now()/1000);
 const unsigned=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:account.client_email,scope:'https://www.googleapis.com/auth/cloud-platform',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+600});
 const signature=createSign('RSA-SHA256').update(unsigned).sign(account.private_key,'base64url');
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+signature}),signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error();const {access_token}=await response.json();
 for(const [label,url] of [
  ['auth',`https://identitytoolkit.googleapis.com/admin/v2/projects/${account.project_id}/config`],
  ['google',`https://identitytoolkit.googleapis.com/admin/v2/projects/${account.project_id}/defaultSupportedIdpConfigs/google.com`],
  ['billing',`https://cloudbilling.googleapis.com/v1/projects/${account.project_id}/billingInfo`]
 ]){
  const result=await fetch(url,{headers:{Authorization:'Bearer '+access_token},redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!result.ok){console.log(JSON.stringify({kind:label,httpStatus:result.status}));continue;}
  const data=await result.json();
  const safe=label==='auth'?{subtype:data.subtype,authorizedDomains:data.authorizedDomains}:label==='google'?{enabled:data.enabled,hasClientId:!!data.clientId}:{billingEnabled:data.billingEnabled};
  console.log(JSON.stringify({kind:label,...safe}));
 }
}catch{console.error('Read-only Firebase configuration inspection failed; secrets withheld.');process.exitCode=1;}
