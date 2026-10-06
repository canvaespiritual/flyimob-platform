import { Prisma, OperationalRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize, civilToday, day, period, MarketingError, type MarketingViewer } from "./policy";
import { canActAsSalesResponsible } from "@/lib/team/policy";
import { applyCostCorrections, costCorrectionEvent } from "./cost-corrections.server";
import { economicLedger, physicalReconciliation, coveredDays, localDayBoundary, resolveOperationalIdentity } from "./finance-calculations";
import { toDecimal, roundMoney } from "@/lib/financeiro/money";

export async function marketingFinanceOptions(viewer: MarketingViewer, db = prisma) {
  authorize(viewer); const tenantId=viewer.tenant.id;
  const [accounts,people]=await Promise.all([
    db.metaAdAccount.findMany({where:{tenantId},select:{id:true,name:true,currency:true,timezone:true,status:true,sourceAccountStatus:true},orderBy:{name:"asc"}}),
    db.operationPerson.findMany({where:{tenantId},select:{id:true,name:true,operationalRole:true,active:true,mergedIntoId:true},orderBy:{name:"asc"}})
  ]);
  return {accounts,people:people.map(p=>({...p,eligible:canActAsSalesResponsible(p)})),canWrite:viewer.user.role==="OWNER"};
}
function roleFilter(params: URLSearchParams) {
 const role=params.get("role"); if(role && !Object.values(OperationalRole).includes(role as OperationalRole)) throw new MarketingError(400,"Função inválida."); return role as OperationalRole|null;
}
export async function moneyMovementList(viewer: MarketingViewer, params: URLSearchParams, db=prisma) {
 authorize(viewer);const tenantId=viewer.tenant.id,range=period(params),role=roleFilter(params);
 const page=Number(params.get("page")??1);if(!Number.isSafeInteger(page)||page<1||page>100000)throw new MarketingError(400,"Página inválida.");
 const origin=params.get("origin"),status=params.get("status");
 if(origin&&!['PERSON','FLYIMOB','OTHER'].includes(origin)||status&&!['PENDING','CONFIRMED','CANCELLED'].includes(status))throw new MarketingError(400,"Filtro inválido.");
 let personIds:string[]|undefined;
 if(params.get("personId")||role){
  const people=await db.operationPerson.findMany({where:{tenantId},select:{id:true,mergedIntoId:true,operationalRole:true}});
  const target=params.get("personId")?resolveOperationalIdentity(people,params.get("personId")!):null;
  personIds=people.filter(p=>(!target||resolveOperationalIdentity(people,p.id)===target)&&(!role||people.find(root=>root.id===resolveOperationalIdentity(people,p.id))?.operationalRole===role)).map(p=>p.id);
 }
 const where:Prisma.MarketingMoneyMovementWhereInput={tenantId,effectiveDate:{gte:day(range.from),lte:day(range.to)},...(params.get("accountId")?{accountId:params.get("accountId")!}:{}),...(personIds?{personId:{in:personIds}}:{}),...(origin?{origin}:{}),...(status?{status}:{})};
 const [items,total]=await Promise.all([db.marketingMoneyMovement.findMany({where,select:{id:true,kind:true,origin:true,affectsPhysicalBalance:true,adjustmentType:true,status:true,effectiveDate:true,amount:true,currency:true,note:true,reason:true,version:true,createdAt:true,updatedAt:true,account:{select:{id:true,name:true}},person:{select:{id:true,name:true,operationalRole:true,active:true}},createdBy:{select:{name:true}},receipts:{select:{id:true,originalName:true,createdAt:true}}},orderBy:[{effectiveDate:"desc"},{createdAt:"desc"},{id:"desc"}],skip:(page-1)*20,take:20}),db.marketingMoneyMovement.count({where})]);
 return {items:items.map(m=>({...m,amount:m.amount.toFixed(2)})),total,page,...range,canWrite:viewer.user.role==="OWNER"};
}
async function lungData(viewer: MarketingViewer,params:URLSearchParams,db=prisma,now=new Date()) {
 authorize(viewer);const tenantId=viewer.tenant.id,range=period(params,civilToday("America/Sao_Paulo",now)),role=roleFilter(params);
 const accountId=params.get("accountId"),personFilter=params.get("personId");
 const accounts=await db.metaAdAccount.findMany({where:{tenantId,...(accountId?{id:accountId}:{})},select:{id:true,name:true,currency:true,timezone:true,status:true,sourceAccountStatus:true,lastSyncedAt:true},orderBy:{name:"asc"}});
 const accountIds=accounts.map(a=>a.id),through=day(range.to),from=day(range.from),historyThrough=day([range.to,civilToday("America/Sao_Paulo",now),...accounts.map(a=>civilToday(a.timezone,now))].sort().at(-1)!);
 const metricWhere={tenantId,date:{lte:historyThrough},campaign:{tenantId,accountId:{in:accountIds}}};
 if(await db.marketingDailyMetric.count({where:metricWhere})>250000||await db.marketingMoneyMovement.count({where:{tenantId,accountId:{in:accountIds},effectiveDate:{lte:historyThrough}}})>100000)throw new MarketingError(400,"Histórico muito grande. Filtre por conta.");
 const [movements,rawMetrics,people,campaigns,marks,latestSnapshots,events]=await Promise.all([
  db.marketingMoneyMovement.findMany({where:{tenantId,accountId:{in:accountIds},effectiveDate:{lte:historyThrough}},select:{id:true,accountId:true,personId:true,kind:true,origin:true,affectsPhysicalBalance:true,status:true,effectiveDate:true,amount:true,currency:true}}),
  db.marketingDailyMetric.findMany({where:metricWhere,select:{date:true,currency:true,state:true,metaSpend:true,effectiveSpend:true,leads:true,sourceObservedAt:true,campaign:{select:{id:true,name:true,purpose:true,accountId:true,assignments:{where:{tenantId,cancelledAt:null,validFrom:{lte:historyThrough}},select:{personId:true,brokerId:true,validFrom:true,validTo:true,person:{select:{name:true}},broker:{select:{name:true,personId:true}}}}}}}}),
  db.operationPerson.findMany({where:{tenantId},select:{id:true,name:true,operationalRole:true,active:true,mergedIntoId:true}}),
  db.marketingCampaign.findMany({where:{tenantId,accountId:{in:accountIds}},select:{id:true,accountId:true,sourceStatus:true,effectiveStatus:true,assignments:{where:{tenantId,cancelledAt:null,validFrom:{lte:day(civilToday("America/Sao_Paulo",now))}},select:{personId:true,brokerId:true,validFrom:true,validTo:true,broker:{select:{personId:true}}}}}}),
  db.marketingReconciliationMark.findMany({where:{tenantId,accountId:{in:accountIds}},orderBy:[{effectiveAt:"desc"},{createdAt:"desc"}]}),
  Promise.all(accounts.map(a=>db.marketingBalanceSnapshot.findFirst({where:{tenantId,accountId:a.id},orderBy:[{observedAt:"desc"},{id:"desc"}]}))),
  db.marketingAuditEvent.findMany({where:{tenantId,eventType:costCorrectionEvent},select:{metadata:true}})
 ]);
 const rules=events.length?await db.marketingCostRule.findMany({where:{tenantId},select:{id:true,percentage:true,validFrom:true,validTo:true},orderBy:{validFrom:"asc"}}):[];
 const resolve=(id:string)=>resolveOperationalIdentity(people,id);
 const rows=applyCostCorrections(rawMetrics.map(m=>({...m,campaign:{...m.campaign,assignments:m.campaign.assignments.map(a=>({...a,personId:a.personId??a.broker?.personId??null,broker:a.person??a.broker??{name:"Legado"}}))}})),rules,events);
 // Positions accumulate the imported history through the selected end date; period columns are separate.
 const ledger=economicLedger(movements,rows,from,through,resolve);
 for(const p of people.filter(canActAsSalesResponsible)) for(const currency of new Set(accounts.map(a=>a.currency))) if(!ledger.some(l=>l.id===p.id&&l.currency===currency))ledger.push({id:p.id,currency,contributions:"0.00",adjustments:"0.00",consumption:"0.00",periodContributions:"0.00",periodConsumption:"0.00",position:"0.00",operationalCredit:"0.00",cpl:null,leads:0,missing:0});
 const table=ledger.map(l=> {
  const p=people.find(p=>p.id===l.id);
  const activeCampaigns=campaigns.filter(c=>(c.effectiveStatus??c.sourceStatus)==="ACTIVE" && accounts.find(a=>a.id===c.accountId)?.status==="ACTIVE" && accounts.find(a=>a.id===c.accountId)?.sourceAccountStatus===1 && accounts.find(a=>a.id===c.accountId)?.currency===l.currency && c.assignments.some(a=>resolve(a.personId??a.broker?.personId??a.brokerId??"UNASSIGNED")===l.id && a.validFrom<=day(civilToday(accounts.find(a=>a.id===c.accountId)?.timezone??"America/Sao_Paulo",now)) && (!a.validTo||a.validTo>day(civilToday(accounts.find(a=>a.id===c.accountId)?.timezone??"America/Sao_Paulo",now))))).length;
  const recent=rows.filter(m=>m.currency===l.currency && m.state==="CONFIRMED" && m.date>=new Date(through.getTime()-6*86400000) && m.date<=through && resolve(m.campaign.assignments.find(a=>a.validFrom<=m.date&&(!a.validTo||m.date<a.validTo))?.personId??"UNASSIGNED")===l.id);
  const daily=roundMoney(recent.reduce((sum,m)=>sum.plus(m.metaSpend??0),toDecimal(0)).div(7));
  return {...l,name:p?.name??({FLYIMOB:"Flyimob",OTHER:"Outras origens",UNASSIGNED:"Consumo sem responsável"}[l.id]??"Responsável legado"),role:p?.operationalRole??null,active:p?.active??true,activeCampaigns,dailyMetaSpend:daily.toFixed(2),situation:toDecimal(l.position).isNegative()?"CRÉDITO OPERACIONAL":activeCampaigns?"COM MÍDIA":"SEM CAMPANHA ATIVA"};
 }).filter(l=>(!personFilter||l.id===resolve(personFilter))&&(!role||l.role===role));
 const physical=await Promise.all(accounts.map(async a=> {
  const snapshot=latestSnapshots.find(s=>s?.accountId===a.id)??null;
  const today=civilToday(a.timezone,now),yesterday=new Date(day(today).getTime()-86400000),start=new Date(yesterday.getTime()-6*86400000);
  const recent=rows.filter(m=>m.campaign.accountId===a.id&&m.date>=start&&m.date<=yesterday&&m.state==="CONFIRMED");
  const runs=await db.marketingSyncRun.findMany({where:{tenantId,accountId:a.id,status:"SUCCEEDED",periodTo:{gte:new Date(Math.min((marks.find(m=>m.accountId===a.id)?.effectiveDate??start).getTime(),through.getTime()-6*86400000,start.getTime()))}},select:{periodFrom:true,periodTo:true,finishedAt:true}});
  const dailyComplete=coveredDays(runs,start,yesterday)&&!rows.some(m=>m.campaign.accountId===a.id&&m.date>=start&&m.date<=yesterday&&m.state!=="CONFIRMED");
  const daily=dailyComplete?roundMoney(recent.reduce((s,m)=>s.plus(m.metaSpend??0),toDecimal(0)).div(7)):null;
  const stale=!snapshot||now.getTime()-snapshot.observedAt.getTime()>26*3600000;
  const mark=marks.find(m=>m.accountId===a.id&&(!snapshot||m.effectiveAt<=snapshot.observedAt))??null;
  let reconciliation: {expected:string|null;observed:string|null;difference:string|null;matched:boolean;status:string;effectiveDate:string;note:string;tolerance:string}|null=null;
  if(mark&&snapshot){
   const end=day(civilToday(a.timezone,snapshot.observedAt));
   const intraday=mark.effectiveAt.getTime()!==localDayBoundary(mark.effectiveDate.toISOString().slice(0,10),a.timezone).getTime();
   const ownRows=rows.filter(m=>m.campaign.accountId===a.id);
   // Reconciliation may require dates after the report filter; the physical comparison is always current.
   const withinReport=historyThrough>=end;
   const coverage=withinReport&&coveredDays(runs.filter(r=>r.finishedAt&&r.finishedAt<=snapshot.observedAt),mark.effectiveDate,end)&&!ownRows.some(m=>m.date>=mark.effectiveDate&&m.date<=end&&(m.state!=="CONFIRMED"||m.sourceObservedAt&&m.sourceObservedAt>snapshot.observedAt));
   const calc=physicalReconciliation(mark.openingBalance,movements.filter(m=>m.accountId===a.id),ownRows,mark.effectiveDate,end,snapshot.availableBalance,mark.tolerance);
   reconciliation={...calc,...(intraday?{expected:null,difference:null,matched:false}:{}),status:intraday?"MARCO INTRADIÁRIO: GASTO HORÁRIO NECESSÁRIO":!withinReport?"PERÍODO NÃO COBRE A CONCILIAÇÃO ATUAL":snapshot.state!=="AVAILABLE"?"SALDO INDISPONÍVEL":stale?"DADOS DESATUALIZADOS":!coverage?"IMPORTAÇÃO/ATUALIZAÇÃO NECESSÁRIA":calc.matched?"CONCILIADO":"DIFERENÇA",effectiveDate:mark.effectiveAt.toISOString(),note:mark.note,tolerance:mark.tolerance.toFixed(2)};
  }
  const economicDailyComplete=coveredDays(runs,new Date(through.getTime()-6*86400000),through);
  return {...a,economicDailyComplete,snapshot:snapshot?{state:snapshot.state,availableBalance:snapshot.availableBalance?.toFixed(2)??null,observedAt:snapshot.observedAt,safeErrorCode:snapshot.safeErrorCode,displayString:snapshot.displayString}:null,stale,dailyMetaSpend:daily?.toFixed(2)??null,dailyComplete,autonomyDays:snapshot?.state==="AVAILABLE"&&!stale&&daily&&daily.gt(0)?snapshot.availableBalance!.div(daily).toFixed(1):null,lowBalance:!!(snapshot?.state==="AVAILABLE"&&daily&&daily.gt(0)&&snapshot.availableBalance!.lt(daily.mul(3))),reconciliation};
 }));
 const totals=[...new Set(accounts.map(a=>a.currency))].map(currency=> {
  const acc=physical.filter(a=>a.currency===currency),personRows=table.filter(l=>l.currency===currency&&l.role!==null),company=ledger.find(l=>l.id==="FLYIMOB"&&l.currency===currency);
  const credit=personRows.reduce((s,l)=>s.plus(l.operationalCredit),toDecimal(0));
  const capital=toDecimal(company?.position),available=acc.filter(a=>a.snapshot?.state==="AVAILABLE"&&!a.stale).reduce((s,a)=>s.plus(a.snapshot!.availableBalance!),toDecimal(0));
  const dailyComplete=acc.length>0&&acc.every(a=>a.dailyComplete),daily=dailyComplete?acc.reduce((s,a)=>s.plus(a.dailyMetaSpend??0),toDecimal(0)):null;
  const completeBalances=acc.length>0&&acc.every(a=>a.snapshot?.state==="AVAILABLE"&&!a.stale);
  return {currency,availableBalance:acc.some(a=>a.snapshot?.state==="AVAILABLE"&&!a.stale)?available.toFixed(2):null,completeBalances,dailyMetaSpend:daily?.toFixed(2)??null,autonomyDays:completeBalances&&daily&&daily.gt(0)?available.div(daily).toFixed(1):null,periodContributions:table.filter(l=>l.currency===currency).reduce((s,l)=>s.plus(l.periodContributions),toDecimal(0)).toFixed(2),flyimobPosition:capital.toFixed(2),operationalCredit:credit.toFixed(2),flyimobPotentialExposure:Prisma.Decimal.min(Prisma.Decimal.max(capital,0),credit).toFixed(2),operatingPeople:personRows.filter(l=>l.activeCampaigns>0&&toDecimal(l.dailyMetaSpend).gt(0)).length};
 });
 const tableWithCoverage=table.map(l=>({...l,dailyMetaSpend:physical.filter(a=>a.currency===l.currency).every(a=>a.economicDailyComplete)?l.dailyMetaSpend:null}));
 return {accounts:physical,table:tableWithCoverage,totals,...range,canWrite:viewer.user.role==="OWNER",methodology:"Posição acumulada do histórico importado até o fim do período = aportes confirmados + ajustes confirmados − gasto efetivo por vigência. Consumo físico/autonomia: média do Investimento Meta nos 7 dias completos anteriores, por fuso da conta; sem cobertura completa a estimativa fica indisponível. Caixa e conciliação mostram a fotografia atual, independente do filtro de responsável. Exposição Flyimob é cobertura potencial (mínimo entre crédito utilizado e posição Flyimob positiva), não rastreamento do dinheiro fungível. Não somar exposição ao crédito utilizado."};
}

export async function marketingLung(viewer:MarketingViewer,params:URLSearchParams,db=prisma,now=new Date()) {
 authorize(viewer);
 return db.$transaction(async tx=>lungData(viewer,params,tx as unknown as typeof prisma,now),{isolationLevel:"RepeatableRead",timeout:60000});
}
