import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {loadDocumentationEnv} from './documentacoes-env.mjs';
import {marketingPerformance} from '../src/lib/marketing/performance.server';
import {overview,campaignList} from '../src/lib/marketing/queries.server';
import {marketingLung,moneyMovementList} from '../src/lib/marketing/finance-queries.server';
loadDocumentationEnv();const db=new PrismaClient();
async function main(){try{await db.$transaction(async tx=>{
 await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
 const sample=await tx.marketingDailyMetric.findFirst({select:{tenantId:true}});assert.ok(sample);
 const owner=await tx.user.findFirst({where:{tenantId:sample.tenantId,role:'OWNER',isActive:true},select:{id:true,tenantId:true}});assert.ok(owner);
 const viewer={user:{...owner,role:'OWNER' as const},tenant:{id:owner.tenantId,isPlatform:false}};
 const scoped={...tx,$transaction:async(fn:(client:typeof tx)=>unknown)=>fn(tx)} as unknown as typeof db;
 const accounts=await tx.metaAdAccount.findMany({where:{tenantId:owner.tenantId},select:{id:true,currency:true},orderBy:{id:'asc'}});
 const people=await tx.operationPerson.findMany({where:{tenantId:owner.tenantId},select:{id:true,mergedIntoId:true}});
 const fingerprint=async()=>createHash('sha256').update(JSON.stringify(await tx.marketingMoneyMovement.findMany({where:{tenantId:owner.tenantId},orderBy:{id:'asc'}}))).digest('hex');
 assert.ok(accounts.length>=3,"São necessárias três contas para esta verificação.");assert.ok(people.length>=3,"São necessárias três pessoas para esta verificação.");
 const before=await fingerprint();let checks=0;
 for(const count of [1,3,0])for(const pcount of [1,3,0]){
  const ids=count?accounts.filter(a=>a.currency==='BRL').slice(0,count).map(a=>a.id):[];
  const persons=pcount?people.filter(p=>!p.mergedIntoId).slice(0,pcount).map(p=>p.id):[];
  const query=new URLSearchParams('period=custom&from=2026-10-01&to=2026-10-09&purpose=ALL&compare=false&metaStatus=ALL');ids.forEach(id=>query.append('accountId',id));persons.forEach(id=>query.append('personId',id));
  const direct:{spend:string;leads:string}[]=await tx.$queryRawUnsafe<{spend:string;leads:string}[]>(`SELECT COALESCE(SUM(m."metaSpend"),0)::text AS spend, COALESCE(SUM(m.leads),0)::text AS leads FROM "MarketingDailyMetric" m JOIN "MarketingCampaign" c ON c.id=m."campaignId" AND c."tenantId"=m."tenantId" WHERE m."tenantId"=$1 AND m.date BETWEEN DATE '2026-10-01' AND DATE '2026-10-09' AND m.currency='BRL' AND m.state='CONFIRMED' AND (cardinality($2::text[])=0 OR c."accountId"=ANY($2::text[])) AND (cardinality($3::text[])=0 OR EXISTS (SELECT 1 FROM "CampaignBrokerAssignment" a WHERE a."campaignId"=c.id AND a."tenantId"=m."tenantId" AND a."cancelledAt" IS NULL AND a."validFrom"<=m.date AND (a."validTo" IS NULL OR a."validTo">m.date) AND a."personId"=ANY($3::text[])))`,owner.tenantId,ids,persons);
  const performance=await marketingPerformance(viewer,query,scoped);
  assert.equal(Number(performance.current.totals.metaSpend),Number(direct[0].spend));assert.equal(performance.current.totals.leads,Number(direct[0].leads));checks+=2;
  const overviewQuery=new URLSearchParams(query);overviewQuery.delete('personId');persons.forEach(id=>overviewQuery.append('brokerId',id));
  const general=await overview(viewer,overviewQuery,scoped);const brl=general.totals.find(t=>t.currency==='BRL');assert.equal(Number(brl?.metaSpend??0),Number(direct[0].spend));assert.equal(brl?.leads??0,Number(direct[0].leads));checks+=2;
  if(count===3&&pcount===3){const lung=await marketingLung(viewer,query,scoped);const unrestricted=new URLSearchParams(query);unrestricted.delete('personId');const all=await marketingLung(viewer,unrestricted,scoped);
  assert.deepEqual(lung.accounts,all.accounts);checks++;}
  await moneyMovementList(viewer,query,scoped);const campaignQuery=new URLSearchParams(overviewQuery);campaignQuery.delete("purpose");await campaignList(viewer,campaignQuery,scoped);checks+=2;
 }
 assert.equal(await fingerprint(),before);checks++;
 console.log(JSON.stringify({readOnly:true,checks,movementsUnchanged:true,accountOptions:accounts.length,personOptions:people.length}));
 },{isolationLevel:'RepeatableRead',timeout:180000});}catch(e){console.error('Readonly validation failed:',e instanceof Error?e.name:'unknown',(e as {code?:string}).code??'',e instanceof Error?e.message.replace(/postgres(?:ql)?:\/\/\S+/g,'[REDACTED]').slice(-300):'');process.exitCode=1;}finally{await db.$disconnect();}}
void main();
