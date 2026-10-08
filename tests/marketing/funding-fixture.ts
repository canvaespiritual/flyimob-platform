import {Prisma} from '@prisma/client';
import {prisma} from '../../src/lib/prisma';
import {day} from '../../src/lib/marketing/policy';
const D=(value:string|number)=>new Prisma.Decimal(value),date=day('2026-05-11');
type Row=Prisma.MarketingMoneyMovementGetPayload<Record<string,never>>;
export function dbFixture(){
 const records:Row[]=[],events:Record<string,unknown>[]=[];let active=true,role='BROKER';
 const matches=(r:Row,w:Record<string,unknown>):boolean=>{
  return (!w.tenantId||r.tenantId===w.tenantId)&&(!w.accountId||(typeof w.accountId==='string'?r.accountId===w.accountId:(w.accountId as {in:string[]}).in.includes(r.accountId)))&&(!w.fundingMovementId||r.fundingMovementId===w.fundingMovementId)&&(!w.distributionMovementId||r.distributionMovementId===w.distributionMovementId)&&(!w.id||typeof w.id==='string'?(!w.id||r.id===w.id):r.id!==(w.id as {not:string}).not)&&(!w.status||(typeof w.status==='string'?r.status===w.status:r.status!==(w.status as {not:string}).not))&&(!w.effectiveDate||r.effectiveDate<=(w.effectiveDate as {lte:Date}).lte);
 };
 const tx={
  marketingMoneyMovement:{findUnique:async({where}:{where:{tenantId_idempotencyKey:{tenantId:string;idempotencyKey:string}}})=>records.find(r=>r.tenantId===where.tenantId_idempotencyKey.tenantId&&r.idempotencyKey===where.tenantId_idempotencyKey.idempotencyKey)??null,
   findFirst:async({where}:{where:Record<string,unknown>})=>records.find(r=>matches(r,where))??null,
   findMany:async({where}:{where:Record<string,unknown>})=>records.filter(r=>matches(r,where)),count:async({where}:{where:Record<string,unknown>})=>records.filter(r=>matches(r,where)).length,
   aggregate:async({where}:{where:Record<string,unknown>})=>({_sum:{amount:records.filter(r=>matches(r,where)).reduce((s,r)=>s.plus(r.amount),D(0))}}),
   create:async({data}:{data:Row})=>{const r={...data,id:data.idempotencyKey,version:0,createdAt:date,updatedAt:date};records.push(r);return {id:r.id};},
   updateMany:async({where,data}:{where:Record<string,unknown>;data:{status:string;version:{increment:number}}})=>{const r=records.find(r=>matches(r,where)&&r.version===where.version);if(!r)return {count:0};r.status=data.status;r.version+=data.version.increment;return {count:1};}},
  operationPerson:{findFirst:async({where}:{where:{id:string;tenantId:string}})=>where.tenantId==='tenant'&&['sandra','other'].includes(where.id)?{id:where.id,active,operationalRole:role,mergedIntoId:null}:null,findMany:async()=>[{id:'sandra',name:'Sandra',active,operationalRole:role,mergedIntoId:null},{id:'other',name:'Other',active:true,operationalRole:'DIRECTOR',mergedIntoId:null}]},
  metaAdAccount:{findFirst:async({where}:{where:{id:string;tenantId:string}})=>where.id==='account'&&where.tenantId==='tenant'?{currency:'BRL',timezone:'America/Sao_Paulo'}:null},
  marketingDailyMetric:{findMany:async()=>[]},marketingCostRule:{findMany:async()=>[]},marketingAuditEvent:{create:async({data}:{data:Record<string,unknown>})=>{events.push(data);return data;},findMany:async({where}:{where?:Record<string,unknown>}={})=>events.filter(e=>!where||(!where.eventType||e.eventType===where.eventType)&&(!where.entityId||e.entityId===where.entityId))}
 };
 const db={...tx,$transaction:async<T>(fn:(tx:unknown)=>Promise<T>)=>{const saved=records.map(r=>({...r})),oldEvents=events.length;try{return await fn(tx);}catch(e){records.splice(0,records.length,...saved);events.length=oldEvents;throw e;}}} as unknown as typeof prisma;
 return {db,records,events,setActive:(value:boolean)=>{active=value;},setRole:(value:string)=>{role=value;}};
}
