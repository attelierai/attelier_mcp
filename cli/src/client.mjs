import { createHash } from 'node:crypto';
import { open, unlink } from 'node:fs/promises';

export class AttelierClient {
  constructor({appUrl='https://api.attelier.ai',inferenceUrl='https://inference.attelier.ai',key,fetchImpl=fetch}) {
    for(const raw of [appUrl,inferenceUrl]) {
      const u=new URL(raw);
      if(u.username||u.password||u.search||u.hash||(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname))))throw new Error('API URLs require HTTPS or loopback HTTP without credentials, query or fragment');
    }
    if(!key)throw new Error('Set ATTELIER_API_TOKEN');
    Object.assign(this,{appUrl,inferenceUrl,key,fetchImpl});
  }
  async request(path,{app=false,method='GET',body,mime='application/json',idempotencyKey,raw=false}={}) {
    const origin=app?this.appUrl:this.inferenceUrl;
    const response=await this.fetchImpl(origin.replace(/\/$/,'')+path,{method,headers:{authorization:`Bearer ${this.key}`,'content-type':mime,...(idempotencyKey?{'idempotency-key':idempotencyKey}:{})},...(body===undefined?{}:{body:mime==='application/json'?JSON.stringify(body):body}),redirect:'error',signal:AbortSignal.timeout(30000)});
    if(!response.ok) {
      const payload=await response.json().catch(()=>({}));
      const message=payload?.error?.message??payload?.message??(typeof payload?.error==='string'?payload.error:undefined);
      const error=new Error(typeof message==='string'?message:`HTTP ${response.status}`);
      error.status=response.status;
      error.code=payload?.error?.code??payload?.code??(typeof payload?.error==='string'&&typeof payload?.message==='string'?payload.error:undefined);
      error.requestId=payload?.error?.requestId??payload?.requestId??response.headers.get('x-request-id')??undefined;
      error.retryAfter=response.headers.get('retry-after')??undefined;
      throw error;
    }
    return raw?response:response.json();
  }
  models(id){return this.request('/v1/models'+(id?'/'+encodeURIComponent(id):''));}
  quote(model,parameters){return this.request('/v1/quotes',{method:'POST',body:{model,parameters}});}
  upload(bytes,mime){return this.request('/v1/uploads',{method:'POST',body:bytes,mime});}
  start(quoteId,idempotencyKey){
    if(!idempotencyKey)throw new Error('An explicit --idempotency-key is required');
    return this.request('/v1/requests',{method:'POST',body:{quoteId},idempotencyKey});
  }
  jobs(id,{limit=50,cursor}={}){return this.request(id?`/v1/requests/${encodeURIComponent(id)}`:`/v1/requests?${new URLSearchParams({limit:String(limit),...(cursor?{cursor}:{})})}`);}
  cancel(id){return this.request(`/v1/requests/${encodeURIComponent(id)}/cancel`,{method:'POST',body:{}});}
  usage(){return this.request('/v1/usage',{app:true});}
  projects(id){return this.request('/v1/projects'+(id?'/'+encodeURIComponent(id):''),{app:true});}
  async wait(id,{timeoutMs=600000,pollMs=1500}={}) {
    const deadline=Date.now()+timeoutMs;
    do {
      // Polling only reads: a dropped connection is retried until the deadline.
      let job;
      try {job=await this.jobs(id);} catch(error){if(error.status||Date.now()>=deadline)throw error;}
      if(job&&['succeeded','failed','cancelled'].includes(job.status))return job;
      if(Date.now()>=deadline)return {...job,id,waitTimedOut:true};
      await new Promise(r=>setTimeout(r,Math.min(pollMs,Math.max(0,deadline-Date.now()))));
    }while(true);
  }
  async download(id,destination) {
    const result=await this.request(`/v1/requests/${encodeURIComponent(id)}/result`);
    const output=result.outputs?.[0];if(!output?.url)throw new Error('No completed output');
    const url=new URL(output.url,this.inferenceUrl),base=new URL(this.inferenceUrl);
    if(url.origin!==base.origin||url.username||url.password||url.pathname!==`/v1/requests/${id}/content`)throw new Error('Invalid output origin');
    const handle=await open(destination,'wx',0o600);let complete=false;
    try {
      const response=await this.request(url.pathname,{raw:true}),hash=createHash('sha256');let bytes=0;
      for await(const part of response.body){bytes+=part.length;if(bytes>2*1024**3)throw new Error('Output exceeds 2 GiB');hash.update(part);await handle.writeFile(part);}
      const sha256=hash.digest('hex');if(!bytes||output.sha256&&sha256!==output.sha256)throw new Error('Output checksum mismatch');
      await handle.sync();complete=true;return {requestId:id,path:destination,bytes,sha256};
    }finally{await handle.close();if(!complete)await unlink(destination);}
  }
}
