import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { AttelierClient } from '../src/client.mjs';

const runCli = async (args,{env={}}={}) => {
  const child=spawn(process.execPath,['cli/bin/attelier.mjs',...args],{cwd:new URL('../../',import.meta.url),env:{...process.env,ATTELIER_API_TOKEN:'fixture',...env}});
  let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
  const code=await new Promise(r=>child.on('close',r));
  return {code,out,err};
};

const listen = async (handler) => {
  const server=createServer(handler);
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${server.address().port}`;
  return {url,close:()=>new Promise(r=>server.close(r))};
};
test('CLI uses one key and never submits again on local wait timeout',async()=>{
  let starts=0;const calls=[];
  const server=createServer(async(req,res)=>{
    calls.push([req.method,req.url,req.headers.authorization,req.headers['idempotency-key']]);
    for await(const _ of req){}
    if(req.method==='POST')starts++;
    res.setHeader('content-type','application/json');res.end(JSON.stringify({id:'one',status:'running'}));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${server.address().port}`;
  try {
    const child=spawn(process.execPath,['cli/bin/attelier.mjs','run','--quote','q','--idempotency-key','same','--wait','--timeout','0','--json'],{cwd:new URL('../../',import.meta.url),env:{...process.env,ATTELIER_API_TOKEN:'fixture',ATTELIER_INFERENCE_URL:url,ATTELIER_API_URL:url}});
    let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
    assert.equal(await new Promise(r=>child.on('close',r)),2,err);
    assert.equal(JSON.parse(out).waitTimedOut,true);assert.equal(starts,1);assert.equal(calls[0][3],'same');
    const client=new AttelierClient({key:'fixture',appUrl:url,inferenceUrl:url});await client.usage();await client.models();
    assert.ok(calls.every(c=>c[2]==='Bearer fixture'));
  }finally{await new Promise(r=>server.close(r));}
});
test('ambiguous admission is reported, without automatic retry',async()=>{
  let calls=0;const client=new AttelierClient({key:'fixture',fetchImpl:async()=>{calls++;throw new Error('lost response');}});
  await assert.rejects(client.start('q','same'),/lost response/);assert.equal(calls,1);
  await assert.rejects(async()=>client.start('q',''),/idempotency/);assert.equal(calls,1);
});
test('waiting survives a dropped poll and still never submits',async()=>{
  let polls=0;const client=new AttelierClient({key:'fixture',fetchImpl:async()=>{if(polls++===0)throw new TypeError('fetch failed');return new Response(JSON.stringify({id:'one',status:'succeeded'}),{headers:{'content-type':'application/json'}});}});
  assert.equal((await client.wait('one',{timeoutMs:5000,pollMs:1})).status,'succeeded');assert.equal(polls,2);
});

test('CLI preserves string and structured API errors with retry guidance at the HTTP boundary',async()=>{
  const upstream=await listen((req,res)=>{
    res.setHeader('content-type','application/json');
    if(req.url==='/v1/models/structured'){
      res.statusCode=403;res.setHeader('x-request-id','header-request');res.end(JSON.stringify({error:{message:'scope inference:read is required',code:'FORBIDDEN',requestId:'body-request'}}));return;
    }
    if(req.url==='/v1/models/human'){
      res.statusCode=429;res.end(JSON.stringify({error:'auth_rate_limited',message:'Please wait before trying again'}));return;
    }
    res.statusCode=429;res.setHeader('retry-after','60');res.setHeader('x-request-id','rate-request');res.end(JSON.stringify({error:'too many requests'}));
  });
  try {
    const common={ATTELIER_INFERENCE_URL:upstream.url,ATTELIER_API_URL:upstream.url};
    const stringFailure=await runCli(['models','--json'],{env:common});
    assert.equal(stringFailure.code,1);
    assert.deepEqual(JSON.parse(stringFailure.err),{error:{message:'too many requests',status:429,requestId:'rate-request',retryAfter:'60'}});
    const structuredFailure=await runCli(['models','structured','--json'],{env:common});
    assert.equal(structuredFailure.code,1);
    assert.deepEqual(JSON.parse(structuredFailure.err),{error:{message:'scope inference:read is required',status:403,code:'FORBIDDEN',requestId:'body-request'}});
    const humanFailure=await runCli(['models','human','--json'],{env:common});
    assert.equal(humanFailure.code,1);
    assert.deepEqual(JSON.parse(humanFailure.err),{error:{message:'Please wait before trying again',status:429,code:'auth_rate_limited'}});
  } finally { await upstream.close(); }
});

test('run --wait uses terminal exit codes and submits exactly once per explicit invocation',async()=>{
  const starts=[];
  const upstream=await listen(async(req,res)=>{
    for await(const _ of req){}
    res.setHeader('content-type','application/json');
    if(req.method==='POST'&&req.url==='/v1/requests'){
      const key=req.headers['idempotency-key'];starts.push(key);res.end(JSON.stringify({id:String(key),status:'running'}));return;
    }
    const status=String(req.url).split('/').at(-1);
    res.end(JSON.stringify({id:status,status:status==='timeout'?'running':status}));
  });
  try {
    const env={ATTELIER_INFERENCE_URL:upstream.url,ATTELIER_API_URL:upstream.url};
    for(const [key,expected] of [['succeeded',0],['failed',1],['cancelled',1],['timeout',2]]){
      const result=await runCli(['run','--quote','quote-1','--idempotency-key',key,'--wait','--timeout','0','--json'],{env});
      assert.equal(result.code,expected,`${key}: ${result.err}`);
      const value=JSON.parse(result.out);
      if(key==='timeout') assert.equal(value.waitTimedOut,true); else assert.equal(value.status,key);
    }
    assert.deepEqual(starts,['succeeded','failed','cancelled','timeout']);
  } finally { await upstream.close(); }
});

test('CLI refuses unsafe API URLs and never follows an authenticated redirect',async()=>{
  const unsafe=await runCli(['models','--json'],{env:{ATTELIER_INFERENCE_URL:'http://attelier.test',ATTELIER_API_URL:'https://api.attelier.ai'}});
  assert.equal(unsafe.code,1);assert.match(unsafe.err,/API URLs require HTTPS or loopback HTTP/);
  let destinationHits=0;
  const upstream=await listen((req,res)=>{
    if(req.url==='/redirect-target') destinationHits++;
    res.statusCode=302;res.setHeader('location','/redirect-target');res.end();
  });
  try {
    const result=await runCli(['models','--json'],{env:{ATTELIER_INFERENCE_URL:upstream.url,ATTELIER_API_URL:upstream.url}});
    assert.equal(result.code,1);assert.match(result.err,/fetch failed/i);assert.equal(destinationHits,0);
  } finally { await upstream.close(); }
});
