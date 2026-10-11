// Bundle the real sibling Horizonte endpoints with only identity/database/storage isolated.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const {build}=createRequire(require.resolve('tsx/package.json'))('esbuild');
export async function horizonteFixture(){
 const root=resolve(process.env.HORIZONTE_TEST_ROOT||'../horizonte','src');
 const bundle=await build({stdin:{contents:"export {POST,PATCH,DELETE} from './app/api/lessons/[id]/playback/route';export {POST as PROGRESS} from './app/api/lessons/[id]/progress/route';",resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'isolate',setup(b){
  b.onResolve({filter:/.*/},args=>{const file=args.path.startsWith('@/')?resolve(root,args.path.slice(2)):args.path.startsWith('.')?resolve(args.resolveDir,args.path):'';for(const [ending,name] of [['lib/db','db'],['lib/media/storage','storage'],['lib/auth','auth'],['lib/integration/service','integration']])if(file.replaceAll('\\','/').endsWith(ending))return {path:name,namespace:'fixture'};if(args.path.startsWith('@/'))return {path:file+'.ts'};});
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'js',contents:({db:'export const db=globalThis.fixture.db;',storage:'export function storage(){return {readUrl:async()=>"/clip.mp4"};}',auth:'export async function currentUser(){return globalThis.fixture.actor;}',integration:'export async function integrationActor(){return globalThis.fixture.actor;}'}[args.path])}));
 }}]});
 let now=Date.now(),counter=0,transaction=Promise.resolve();
 const state={revoked:false,rejected:false,sessions:[],progress:new Map(),requests:[]};
 const actor={id:'synthetic-learner',role:'STUDENT'};
 const matches=(row,where)=>Object.entries(where||{}).every(([key,value])=>{if(key==='NOT')return !matches(row,value);if(value&&typeof value==='object'){if('gt'in value)return row[key]>value.gt;if('startsWith'in value)return row[key].startsWith(value.startsWith);if('in'in value)return value.in.includes(row[key]);}return row[key]===value;});
 const db={lesson:{findFirst:async({where})=>state.revoked?null:{id:where.id,videoSource:'PRIVATE',activeMediaId:where.id+'-media',youtubeId:null,activeMedia:{state:'READY',outputKey:'synthetic.mp4',metadata:{duration:2707}},module:{courseId:'course'}},count:async()=>state.revoked?0:1},
  playbackSession:{findMany:async({where})=>state.sessions.filter(s=>matches(s,where)).sort((a,b)=>b.id.localeCompare(a.id)).slice(0,1),count:async({where})=>state.sessions.filter(s=>matches(s,where)).length,create:async({data})=>{const s={id:`legacy-${++counter}`,sequence:0,lastReportAt:new Date(now),...data};state.sessions.push(s);return s;},findFirst:async({where})=>state.sessions.find(s=>matches(s,where)),update:async({where,data})=>Object.assign(state.sessions.find(s=>matches(s,where)),data),updateMany:async({where,data})=>{for(const s of state.sessions.filter(s=>matches(s,where)))Object.assign(s,data);return {}; }},
  playbackProgress:{findUnique:async({where})=>state.progress.get(where.userId_lessonId_revision.lessonId),upsert:async({create,update})=>{const data={...(state.progress.get(create.lessonId)||create),...update};state.progress.set(create.lessonId,data);return data;}},auditEvent:{create:async()=>{}},progress:{upsert:async()=>{}},$executeRaw:async()=>{},$transaction:fn=>{const work=transaction.then(()=>fn(db));transaction=work.catch(()=>{});return work;}};
 class ClockDate extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 const sandbox={fixture:{db,actor},module:{exports:{}},exports:{},require,Date:ClockDate,Response,URL,process:{env:{}},console,Buffer};sandbox.exports=sandbox.module.exports;vm.runInNewContext(bundle.outputFiles[0].text,sandbox);
 const api=sandbox.module.exports;
 return {state,age:ms=>{now+=ms;},async request(id,action,method,body){now+=4000;if(action==='progress'&&body?.segments?.length)now+=Math.max(0,body.segments.reduce((sum,s)=>sum+s.seconds,0)*1000-4000);state.requests.push({id,action,method,body});if(state.rejected&&action==='progress')return Response.json({code:'INVALID_PROGRESS',error:'Este envio de progresso foi recusado.'},{status:422});const request=new Request(`https://synthetic.invalid/api/lessons/${id}/${action}`,{method,headers:{origin:'https://synthetic.invalid','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return api[action==='progress'?'PROGRESS':method](request,{params:Promise.resolve({id})});}};
}
