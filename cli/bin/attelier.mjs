#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { AttelierClient } from '../src/client.mjs';
const help=`attelier models [model] | upload FILE --mime TYPE | quote --model MODEL --input JSON_FILE
attelier run --quote ID --idempotency-key KEY [--wait] [--timeout SECONDS]
attelier jobs [ID] [--limit N] [--cursor ID] | cancel ID | download ID --output FILE
attelier usage | projects [ID]
All commands support --json. Configure ATTELIER_API_TOKEN, ATTELIER_API_URL and ATTELIER_INFERENCE_URL.
A local timeout never retries a purchase; resume with jobs ID or the same quote and idempotency key.`;
try {
  const {values:v,positionals:[command,id,...extra]}=parseArgs({allowPositionals:true,options:{json:{type:'boolean'},help:{type:'boolean'},wait:{type:'boolean'},model:{type:'string'},input:{type:'string'},quote:{type:'string'},'idempotency-key':{type:'string'},timeout:{type:'string'},limit:{type:'string'},cursor:{type:'string'},mime:{type:'string'},output:{type:'string'}}});
  if(v.help||!command){console.log(help);} else {
    if(!['models','upload','quote','run','jobs','cancel','download','usage','projects'].includes(command))throw new Error(`Unknown command: ${command}`);
    if(extra.length||id&&['quote','run','usage'].includes(command))throw new Error(`Unexpected argument for ${command}`);
    const limit=Number(v.limit??50);
    if(!Number.isSafeInteger(limit)||limit<1)throw new Error('--limit must be a positive integer');
    const client=new AttelierClient({key:process.env.ATTELIER_API_TOKEN,appUrl:process.env.ATTELIER_API_URL,inferenceUrl:process.env.ATTELIER_INFERENCE_URL});
    const required=(value,name)=>{if(!value)throw new Error(`${name} is required`);return value;};
    let value;
    if(command==='models')value=await client.models(id);
    else if(command==='upload')value=await client.upload(await readFile(required(id,'FILE')),required(v.mime,'--mime'));
    else if(command==='quote')value=await client.quote(required(v.model,'--model'),JSON.parse(await readFile(required(v.input,'--input'),'utf8')));
    else if(command==='run') {
      const timeoutMs=Number(v.timeout??600)*1000;if(!Number.isFinite(timeoutMs)||timeoutMs<0)throw new Error('Invalid timeout');
      const quoteId=required(v.quote,'--quote'),idem=required(v['idempotency-key'],'--idempotency-key');
      try {value=await client.start(quoteId,idem);}catch(error){error.message+=` Resume only with quote ${quoteId} and idempotency key ${idem}.`;throw error;}
      if(v.wait)value=await client.wait(value.id,{timeoutMs});
    } else if(command==='jobs')value=await client.jobs(id,{limit,cursor:v.cursor});
    else if(command==='cancel')value=await client.cancel(required(id,'ID'));
    else if(command==='download')value=await client.download(required(id,'ID'),required(v.output,'--output'));
    else if(command==='usage')value=await client.usage();
    else if(command==='projects')value=await client.projects(id);
    else throw new Error(`Unknown command: ${command}`);
    console.log(JSON.stringify(value,null,v.json?undefined:2));
    if(value.waitTimedOut)process.exitCode=2;
    else if(command==='run'&&v.wait&&['failed','cancelled'].includes(value.status))process.exitCode=1;
  }
} catch(error){console.error(JSON.stringify({error:{message:error.message,status:error.status,code:error.code,requestId:error.requestId,retryAfter:error.retryAfter}}));process.exitCode=1;}
