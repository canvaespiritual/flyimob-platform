import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {requestContext} from '../documentacoes/request-context';
import {prisma} from '../../src/lib/prisma';
import {createSessionToken} from '../../src/lib/auth.server';
import {POST,DELETE} from '../../src/app/api/training/lessons/[id]/[action]/route';
test('authenticated BFF forwards context, measured segments and owned close; strips caller identity and rejects invalid payloads',async()=>{
 const names=['SESSION_SECRET','HORIZONTE_ENABLED','HORIZONTE_ORIGIN','HORIZONTE_CLIENT_ID','HORIZONTE_PRIVATE_KEY'];const env=names.map(n=>process.env[n]);
 const oldFetch=globalThis.fetch,oldTransaction=prisma.$transaction,oldUser=prisma.user.findFirst;
 const {privateKey}=generateKeyPairSync('ed25519');
 Object.assign(process.env,{SESSION_SECRET:'synthetic-playback-session',HORIZONTE_ENABLED:'true',HORIZONTE_ORIGIN:'https://synthetic.invalid',HORIZONTE_CLIENT_ID:'synthetic',HORIZONTE_PRIVATE_KEY:privateKey.export({format:'pem',type:'pkcs8'}).toString()});
 const calls:{path:string;method?:string;body:unknown}[]=[];
 prisma.user.findFirst=(async()=>({id:'broker',tenantId:'tenant',role:'BROKER',name:'Fixture',email:'fixture@example.invalid',isActive:true,sessionVersion:0,tenant:{id:'tenant',slug:'fixture',name:'Fixture',isPlatform:false,parentId:null}})) as unknown as typeof oldUser;
 const tx={$executeRaw:async()=>{},user:{findFirst:async()=>({id:'broker'})},trainingAccess:{findUnique:async()=>({courseIds:['course']}),update:async()=>{}}};
 prisma.$transaction=(async(fn:(tx:unknown)=>unknown)=>fn(tx)) as typeof oldTransaction;
 globalThis.fetch=async(url,init)=>{const path=new URL(String(url)).pathname;const body=init?.body?JSON.parse(String(init.body)):undefined;calls.push({path,method:init?.method,body});if(path.endsWith('/exchange'))return Response.json({token:'t'.repeat(43),tokenType:'Bearer',expiresAt:new Date(Date.now()+300000).toISOString()});if(path.endsWith('/courses'))return Response.json({data:[{id:'course',modules:[{lessons:[{id:'lesson'}]}]}]});return Response.json({sessionId:'owned',position:240,percent:0});};
 const token=createSessionToken({uid:'broker',tid:'tenant',role:'BROKER',sv:0});
 const send=async(action:string,method:string,body:unknown)=>requestContext(token,()=> (method==='DELETE'?DELETE:POST)(new Request(`https://flyimob.test/api/training/lessons/lesson/${action}`,{method,headers:{origin:'https://flyimob.test','Content-Type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({id:'lesson',action})}));
 try{
  const context={contextId:randomUUID(),generation:Date.now()};assert.equal((await send('playback','POST',{...context,userId:'other',tenantId:'other'})).status,200);assert.deepEqual(calls.at(-1)?.body,context);
  const progress={sessionId:'owned',sequence:1,position:240,playing:true,rate:1,segments:[{start:0,end:10,seconds:10,rate:1}]};assert.equal((await send('progress','POST',{...progress,userId:'other'})).status,200);assert.deepEqual(calls.at(-1)?.body,progress);
  assert.equal((await send('playback','DELETE',{sessionId:'owned',userId:'other'})).status,200);assert.equal(calls.at(-1)?.method,'DELETE');assert.deepEqual(calls.at(-1)?.body,{sessionId:'owned'});
  const count=calls.length;assert.equal((await send('playback','POST',{contextId:'bad',generation:1})).status,400);assert.equal((await send('progress','POST',{...progress,segments:[{start:0,end:100,seconds:-1,rate:1}]})).status,422);assert.equal((await send('progress','DELETE',{sessionId:'owned'})).status,404);assert.equal(calls.length,count);
 }finally{globalThis.fetch=oldFetch;prisma.$transaction=oldTransaction;prisma.user.findFirst=oldUser;names.forEach((n,i)=>{if(env[i]===undefined)delete process.env[n];else process.env[n]=env[i];});}
});
