import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { authorize,civilToday,day,MarketingError,period,type MarketingViewer } from './policy';
import { applyCostCorrections,costCorrectionEvent } from './cost-corrections.server';
import { resolveOperationalIdentity } from './finance-calculations';
import { comparisonRange,performanceSeries,salesScope,change } from './performance';

/** enforcedPersonId must originate from a future authenticated portal policy, never a request field. */
export async function marketingPerformance(viewer:MarketingViewer,params:URLSearchParams,db=prisma,enforcedPersonId?:string,now=new Date()) {
 authorize(viewer);
 const selectedPeople=salesScope(params,enforcedPersonId);
 return db.$transaction(async tx=>{
  const tenantId=viewer.tenant.id;
  const accounts=await tx.metaAdAccount.findMany({where:{tenantId,...(params.get('accountId')?{id:params.get('accountId')!}:{})},select:{id:true,name:true,currency:true,timezone:true,lastSyncedAt:true}});
  if(params.get('accountId')&&!accounts.length)throw new MarketingError(404,'Conta não encontrada na operação.');
  const range=period(params,civilToday(accounts.length===1?accounts[0].timezone:'America/Sao_Paulo',now));
  if(range.to>civilToday(accounts.length===1?accounts[0].timezone:'America/Sao_Paulo',now))throw new MarketingError(400,'Não selecione datas futuras.');
  const previous=params.get('compare')==='false'?null:comparisonRange(range.from,range.to);
  const currency=params.get('currency')||'BRL';if(!/^[A-Z]{3}$/.test(currency))throw new MarketingError(400,'Moeda inválida.');
  const people=await tx.operationPerson.findMany({where:{tenantId},select:{id:true,name:true,mergedIntoId:true}});
  for(const id of selectedPeople)if(id!=='unassigned'&&!people.some(p=>p.id===id))throw new MarketingError(404,'Responsável não encontrado na operação.');
  const selected=selectedPeople.map(id=>id==='unassigned'?id:resolveOperationalIdentity(people,id));
  const ids=accounts.filter(a=>a.currency===currency).map(a=>a.id);
  const where={tenantId,date:{gte:day(previous?.from??range.from),lte:day(range.to)},currency,campaign:{tenantId,accountId:{in:ids}}};
  if(await tx.marketingDailyMetric.count({where})>100000)throw new MarketingError(400,'Reduza o período ou selecione uma conta.');
  const [raw,runs,events]=await Promise.all([
   tx.marketingDailyMetric.findMany({where,select:{date:true,currency:true,state:true,metaSpend:true,effectiveSpend:true,leads:true,campaign:{select:{id:true,name:true,purpose:true,accountId:true,assignments:{where:{tenantId,cancelledAt:null},select:{personId:true,brokerId:true,validFrom:true,validTo:true,person:{select:{name:true}},broker:{select:{name:true,personId:true}}}}}}}}),
   tx.marketingSyncRun.findMany({where:{tenantId,accountId:{in:ids},periodFrom:{lte:day(range.to)},periodTo:{gte:day(previous?.from??range.from)}},select:{accountId:true,status:true,periodFrom:true,periodTo:true,finishedAt:true,safeErrorCode:true}}),
   tx.marketingAuditEvent.findMany({where:{tenantId,eventType:costCorrectionEvent},select:{metadata:true}})
  ]);
  const rules=events.length?await tx.marketingCostRule.findMany({where:{tenantId},select:{id:true,percentage:true,validFrom:true,validTo:true},orderBy:{validFrom:'asc'}}):[];
  const rows=applyCostCorrections(raw.map(r=>({...r,campaign:{...r.campaign,assignments:r.campaign.assignments.map(a=>{const id=a.personId??a.broker?.personId??a.brokerId;const resolved=id&&people.some(p=>p.id===id)?resolveOperationalIdentity(people,id):id;return {...a,brokerId:resolved,broker:{name:people.find(p=>p.id===resolved)?.name??a.person?.name??a.broker?.name??'Responsável legado'}};})}})),rules,events);
  const covered=(accountId:string,date:string)=>date<civilToday(accounts.find(a=>a.id===accountId)!.timezone,now)&&runs.some(r=>r.accountId===accountId&&r.status==='SUCCEEDED'&&r.periodFrom<=day(date)&&r.periodTo>=day(date));
  const current=performanceSeries(rows,range.from,range.to,currency,selected,covered,ids);
  const comparison=previous?performanceSeries(rows,previous.from,previous.to,currency,selected,covered,ids):null;
  return {range,previous,currency,current,comparison,changes:comparison?{metaSpend:change(current.totals.metaSpend,comparison.totals.metaSpend),effectiveSpend:change(current.totals.effectiveSpend,comparison.totals.effectiveSpend),leads:change(current.totals.leads,comparison.totals.leads),cplMeta:change(current.totals.cplMeta,comparison.totals.cplMeta),cplEffective:change(current.totals.cplEffective,comparison.totals.cplEffective)}:null,accounts:accounts.filter(a=>a.currency===currency),currencies:[...new Set(accounts.map(a=>a.currency))],syncIssues:runs.filter(r=>r.status!=='SUCCEEDED').map(r=>({accountId:r.accountId,status:r.status,code:r.safeErrorCode})),timezone:accounts.length===1?accounts[0].timezone:'Dias locais de cada conta; atalhos em America/Sao_Paulo',hourly:{available:false,reason:'Dados horários não são coletados pela integração atual. A compatibilidade de actions com messaging_conversation_started_7d no breakdown hourly_stats_aggregated_by_advertiser_time_zone precisa ser validada na Meta antes de uma coleta adicional. Não há estimativa de leads por hora.'}};
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:30000});
}
export type PerformanceReport=Awaited<ReturnType<typeof marketingPerformance>>;
