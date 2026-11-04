export class RunpodClient {
  constructor({key,endpoint,fetchImpl=fetch}) {
    if(!key||!/^[A-Za-z0-9_-]+$/.test(endpoint||''))throw new Error('RunPod configuration missing');
    this.key=key;this.endpoint=endpoint;this.fetch=fetchImpl;
  }
  async request(url,method='GET',body) {
    let response;
    try{response=await this.fetch(url,{method,headers:{Authorization:`Bearer ${this.key}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});}catch{throw new Error('RUNPOD_NETWORK_UNKNOWN');}
    if(!response.ok)throw new Error(`RUNPOD_HTTP_${response.status}`);
    try{return await response.json();}catch{throw new Error('RUNPOD_RESPONSE_UNKNOWN');}
  }
  inspect(){return this.request(`https://rest.runpod.io/v1/endpoints/${this.endpoint}`);}
  submit(text,settings,timeoutMs){return this.request(`https://api.runpod.ai/v2/${this.endpoint}/run`,'POST',{input:{mode:'tts',text,language:settings.language,speaker:settings.voice,instruct:settings.instruct},policy:{executionTimeout:timeoutMs,ttl:Math.max(900000,timeoutMs+300000)}});}
  status(id){return this.request(`https://api.runpod.ai/v2/${this.endpoint}/status/${encodeURIComponent(id)}`);}
  cancel(id){return this.request(`https://api.runpod.ai/v2/${this.endpoint}/cancel/${encodeURIComponent(id)}`,'POST');}
}
export function decodeWav(output) {
  const value=output?.audio_base64;
  if(typeof value!=='string'||!value.length||value.length>70*1024*1024||value.length%4||/[^A-Za-z0-9+/=]/.test(value))throw new Error('Invalid audio response');
  const bytes=Buffer.from(value,'base64');
  if(bytes.toString('base64')!==value)throw new Error('Invalid base64 response');
  if(bytes.length>50*1024*1024||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE')throw new Error('Invalid WAV response');
  let byteRate=0,dataSize=0;
  for(let p=12;p+8<=bytes.length;){const size=bytes.readUInt32LE(p+4),end=p+8+size;if(end>bytes.length)throw new Error('Truncated WAV');const type=bytes.toString('ascii',p,p+4);if(type==='fmt '&&size>=16)byteRate=bytes.readUInt32LE(p+16);if(type==='data')dataSize+=size;p=end+(size%2);}
  if(!byteRate||!dataSize)throw new Error('Empty WAV');
  return {bytes,seconds:dataSize/byteRate};
}
