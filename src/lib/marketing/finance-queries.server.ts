import { selectionIds, assertSelection } from "./filter-selection";
import { isRecoverableFunding } from "./funding-policy";
import { Prisma, OperationalRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize, civilToday, day, period, MarketingError, type MarketingViewer } from "./policy";
import { canActAsSalesResponsible } from "@/lib/team/policy";
import { applyCostCorrections, costCorrectionEvent } from "./cost-corrections.server";
import { economicLedger, physicalReconciliation, coveredDays, localDayBoundary, resolveOperationalIdentity } from "./finance-calculations";
import { toDecimal, roundMoney } from "@/lib/financeiro/money";

export async function marketingFinanceOptions(viewer: MarketingViewer, db = prisma) {
  authorize(viewer); const tenantId=viewer.tenant.id;
  const [accounts,people,campaigns]=await Promise.all([
    db.metaAdAccount.findMany({where:{tenantId},select:{id:true,name:true,currency:true,timezone:true,status:true,sourceAccountStatus:true},orderBy:{name:"asc"}}),
    db.operationPerson.findMany({where:{tenantId},select:{id:true,name:true,operationalRole:true,active:true,mergedIntoId:true},orderBy:{name:"asc"}}),
    db.marketingCampaign.findMany({where:{tenantId},select:{id:true,accountId:true,name:true},orderBy:[{name:"asc"},{id:"asc"}]})
  ]);
  return {accounts,campaigns,people:people.map(p=>({...p,eligible:canActAsSalesResponsible(p)})),canWrite:viewer.user.role==="OWNER"};
}
function roleFilter(params: URLSearchParams) {
 const role=params.get("role"); if(role && !Object.values(OperationalRole).includes(role as OperationalRole)) throw new MarketingError(400,"Função inválida."); return role as OperationalRole|null;
}
export async function moneyMovementList(viewer: MarketingViewer, params: URLSearchParams, db=prisma) {
 authorize(viewer);const tenantId=viewer.tenant.id,range=period(params),role=roleFilter(params);
 const page=Number(params.get("page")??1);if(!Number.isSafeInteger(page)||page<1||page>100000)throw new MarketingError(400,"Página inválida.");
 const origin=params.get("origin"),status=params.get("status");
 if(origin&&!['PERSON','FLYIMOB','OTHER'].includes(origin)||status&&!['PENDING','CONFIRMED','CANCELLED'].includes(status))throw new MarketingError(400,"Filtro inválido.");
 const selectedAccounts=selectionIds(params,"accountId"),selectedPeople=selectionIds(params,"personId");
 if(selectedAccounts.length)assertSelection(selectedAccounts,await db.metaAdAccount.findMany({where:{tenantId,id:{in:selectedAccounts}},select:{id:true}}));
 let personIds:string[]|undefined;
 if(selectedPeople.length||role){
  const people=await db.operationPerson.findMany({where:{tenantId},select:{id:true,mergedIntoId:true,operationalRole:true}});
  assertSelection(selectedPeople,people);
  const targets=new Set(selectedPeople.map(id=>resolveOperationalIdentity(people,id)));
  personIds=people.filter(p=>(!targets.size||targets.has(resolveOperationalIdentity(people,p.id)))&&(!role||people.find(root=>root.id===resolveOperationalIdentity(people,p.id))?.operationalRole===role)).map(p=>p.id);
 }
 const where:Prisma.MarketingMoneyMovementWhereInput={tenantId,effectiveDate:{gte:day(range.from),lte:day(range.to)},...(selectedAccounts.length?{accountId:{in:selectedAccounts}}:{}),...(personIds?{OR:[{beneficiaryPersonId:{in:personIds}},{beneficiaryPersonId:null,personId:{in:personIds},fundingNature:{notIn:["GLOBAL","RECOMPOSE_CASH"]}}]}:{}),...(origin?{origin}:{}),...(status?{status}:{})};
 const [items,total]=await Promise.all([db.marketingMoneyMovement.findMany({where,select:{id:true,kind:true,origin:true,beneficiaryPersonId:true,fundingNature:true,fundingMovementId:true,distributionMovementId:true,externalReference:true,recoveryMethod:true,affectsPhysicalBalance:true,adjustmentType:true,status:true,effectiveDate:true,amount:true,currency:true,note:true,reason:true,version:true,createdAt:true,updatedAt:true,account:{select:{id:true,name:true}},person:{select:{id:true,name:true,operationalRole:true,active:true}},beneficiary:{select:{id:true,name:true,operationalRole:true,active:true}},distributions:{where:{tenantId,status:{not:"CANCELLED"}},select:{amount:true,status:true}},settlements:{where:{tenantId,status:{not:"CANCELLED"}},select:{amount:true,status:true}},createdBy:{select:{name:true}},receipts:{select:{id:true,originalName:true,createdAt:true}}},orderBy:[{effectiveDate:"desc"},{createdAt:"desc"},{id:"desc"}],skip:(page-1)*20,take:20}),db.marketingMoneyMovement.count({where})]);
 return {items:items.map(m=>({...m,amount:m.amount.toFixed(2),settlements:undefined,distributions:undefined,availableToDistribute:m.kind==="CONTRIBUTION"&&m.status==="CONFIRMED"&&!m.beneficiaryPersonId&&(["GLOBAL","RECOMPOSE_CASH"].includes(m.fundingNature)||m.fundingNature==="STANDARD"&&m.origin==="FLYIMOB")?m.amount.minus((m.distributions??[]).reduce((sum,s)=>sum.plus(s.amount),toDecimal(0))).toFixed(2):null,beneficiary:m.beneficiary??(m.origin==="PERSON"&&!["GLOBAL","RECOMPOSE_CASH"].includes(m.fundingNature)?m.person:null),outstandingPrincipal:isRecoverableFunding(m.fundingNature)&&m.status==="CONFIRMED"?m.amount.minus(m.settlements.filter(s=>s.status==="CONFIRMED").reduce((sum,s)=>sum.plus(s.amount),toDecimal(0))).toFixed(2):null,availableToSettle:isRecoverableFunding(m.fundingNature)&&m.status==="CONFIRMED"?m.amount.minus(m.settlements.reduce((sum,s)=>sum.plus(s.amount),toDecimal(0))).toFixed(2):null})),total,page,...range,canWrite:viewer.user.role==="OWNER"};
}
async function lungData(viewer: MarketingViewer,params:URLSearchParams,db=prisma,now=new Date()) {
 authorize(viewer);const tenantId=viewer.tenant.id,range=period(params,civilToday("America/Sao_Paulo",now)),role=roleFilter(params);
 const selectedAccounts=selectionIds(params,"accountId"),personFilter=selectionIds(params,"personId");
 const accounts=await db.metaAdAccount.findMany({where:{tenantId,...(selectedAccounts.length?{id:{in:selectedAccounts}}:{})},select:{id:true,name:true,currency:true,timezone:true,status:true,sourceAccountStatus:true,lastSyncedAt:true},orderBy:{name:"asc"}});
 assertSelection(selectedAccounts,accounts);
 const accountIds=accounts.map(a=>a.id),through=day(range.to),from=day(range.from),historyThrough=day([range.to,civilToday("America/Sao_Paulo",now),...accounts.map(a=>civilToday(a.timezone,now))].sort().at(-1)!);
 const metricWhere={tenantId,date:{lte:historyThrough},campaign:{tenantId,accountId:{in:accountIds}}};
 if(await db.marketingDailyMetric.count({where:metricWhere})>250000||await db.marketingMoneyMovement.count({where:{tenantId,accountId:{in:accountIds},effectiveDate:{lte:historyThrough}}})>100000)throw new MarketingError(400,"Histórico muito grande. Filtre por conta.");
 const [movements,rawMetrics,people,campaigns,marks,latestSnapshots,events]=await Promise.all([
  db.marketingMoneyMovement.findMany({where:{tenantId,accountId:{in:accountIds},effectiveDate:{lte:historyThrough}},select:{id:true,accountId:true,personId:true,beneficiaryPersonId:true,fundingNature:true,fundingMovementId:true,distributionMovementId:true,externalReference:true,recoveryMethod:true,kind:true,origin:true,affectsPhysicalBalance:true,status:true,effectiveDate:true,amount:true,currency:true}}),
  db.marketingDailyMetric.findMany({where:metricWhere,select:{date:true,currency:true,state:true,metaSpend:true,effectiveSpend:true,leads:true,sourceObservedAt:true,campaign:{select:{id:true,name:true,purpose:true,accountId:true,assignments:{where:{tenantId,cancelledAt:null,validFrom:{lte:historyThrough}},select:{personId:true,brokerId:true,validFrom:true,validTo:true,person:{select:{name:true}},broker:{select:{name:true,personId:true}}}}}}}}),
  db.operationPerson.findMany({where:{tenantId},select:{id:true,name:true,operationalRole:true,active:true,mergedIntoId:true}}),
  db.marketingCampaign.findMany({where:{tenantId,accountId:{in:accountIds}},select:{id:true,accountId:true,sourceStatus:true,effectiveStatus:true,assignments:{where:{tenantId,cancelledAt:null,validFrom:{lte:day(civilToday("America/Sao_Paulo",now))}},select:{personId:true,brokerId:true,validFrom:true,validTo:true,broker:{select:{personId:true}}}}}}),
  db.marketingReconciliationMark.findMany({where:{tenantId,accountId:{in:accountIds}},orderBy:[{effectiveAt:"desc"},{createdAt:"desc"}]}),
  Promise.all(accounts.map(a=>db.marketingBalanceSnapshot.findFirst({where:{tenantId,accountId:a.id},orderBy:[{observedAt:"desc"},{id:"desc"}]}))),
  db.marketingAuditEvent.findMany({where:{tenantId,eventType:costCorrectionEvent},select:{metadata:true}})
 ]);
 assertSelection(personFilter,people);
 const selectedPeople=new Set(personFilter.map(id=>resolveOperationalIdentity(people,id)));
 const rules=events.length?await db.marketingCostRule.findMany({where:{tenantId},select:{id:true,percentage:true,validFrom:true,validTo:true},orderBy:{validFrom:"asc"}}):[];
 const resolve=(id:string)=>resolveOperationalIdentity(people,id);
 const rows=applyCostCorrections(rawMetrics.map(m=>({...m,campaign:{...m.campaign,assignments:m.campaign.assignments.map(a=>({...a,personId:a.personId??a.broker?.personId??null,broker:a.person??a.broker??{name:"Legado"}}))}})),rules,events);
 // Positions accumulate the imported history through the selected end date; period columns are separate.
 const ledger=economicLedger(movements,rows,from,through,resolve);
 for(const p of people.filter(canActAsSalesResponsible)) for(const currency of new Set(accounts.map(a=>a.currency))) if(!ledger.some(l=>l.id===p.id&&l.currency===currency))ledger.push(economicLedger([{origin:"PERSON",personId:p.id,currency,amount:toDecimal(0),status:"CONFIRMED",kind:"CONTRIBUTION",effectiveDate:through}],[],from,through)[0]);
 const table=ledger.map(l=> {
  const p=people.find(p=>p.id===l.id);
  const activeCampaigns=campaigns.filter(c=>(c.effectiveStatus??c.sourceStatus)==="ACTIVE" && accounts.find(a=>a.id===c.accountId)?.status==="ACTIVE" && accounts.find(a=>a.id===c.accountId)?.sourceAccountStatus===1 && accounts.find(a=>a.id===c.accountId)?.currency===l.currency && c.assignments.some(a=>resolve(a.personId??a.broker?.personId??a.brokerId??"UNASSIGNED")===l.id && a.validFrom<=day(civilToday(accounts.find(a=>a.id===c.accountId)?.timezone??"America/Sao_Paulo",now)) && (!a.validTo||a.validTo>day(civilToday(accounts.find(a=>a.id===c.accountId)?.timezone??"America/Sao_Paulo",now))))).length;
  const recent=rows.filter(m=>m.currency===l.currency && m.state==="CONFIRMED" && m.date>=new Date(through.getTime()-6*86400000) && m.date<=through && resolve(m.campaign.assignments.find(a=>a.validFrom<=m.date&&(!a.validTo||m.date<a.validTo))?.personId??"UNASSIGNED")===l.id);
  const daily=roundMoney(recent.reduce((sum,m)=>sum.plus(m.metaSpend??0),toDecimal(0)).div(7));
  return {...l,name:p?.name??({FLYIMOB:"Flyimob",OTHER:"Outras origens",UNASSIGNED:"Consumo sem responsável"}[l.id]??"Responsável legado"),role:p?.operationalRole??null,active:p?.active??true,activeCampaigns,dailyMetaSpend:daily.toFixed(2),situation:toDecimal(l.operationalCredit).gt(0)?"CRÉDITO OPERACIONAL":activeCampaigns?"COM MÍDIA":"SEM CAMPANHA ATIVA"};
 }).filter(l=>(!selectedPeople.size||selectedPeople.has(l.id))&&(!role||l.role===role));
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
  return {...a,economic:accountEconomicSummary(movements.filter(m=>m.accountId===a.id),rows.filter(m=>m.campaign.accountId===a.id),from,through,resolve),economicDailyComplete,snapshot:snapshot?{state:snapshot.state,availableBalance:snapshot.availableBalance?.toFixed(2)??null,observedAt:snapshot.observedAt,safeErrorCode:snapshot.safeErrorCode,displayString:snapshot.displayString}:null,stale,dailyMetaSpend:daily?.toFixed(2)??null,dailyComplete,autonomyDays:snapshot?.state==="AVAILABLE"&&!stale&&daily&&daily.gt(0)?snapshot.availableBalance!.div(daily).toFixed(1):null,lowBalance:!!(snapshot?.state==="AVAILABLE"&&daily&&daily.gt(0)&&snapshot.availableBalance!.lt(daily.mul(3))),reconciliation};
 }));
 const openingLedger=economicLedger(movements,rows,from,new Date(from.getTime()-86400000),resolve);
 const tableWithOpening=table.map(row=>({...row,openingPosition:openingLedger.find(o=>o.id===row.id&&o.currency===row.currency)?.position??"0.00",periodPositionChange:toDecimal(row.position).minus(openingLedger.find(o=>o.id===row.id&&o.currency===row.currency)?.position??0).toFixed(2)}));
 const totals=[...new Set(accounts.map(a=>a.currency))].map(currency=> {
  const acc=physical.filter(a=>a.currency===currency),personRows=table.filter(l=>l.currency===currency&&l.role!==null),company=ledger.find(l=>l.id==="FLYIMOB"&&l.currency===currency);
  const selectedPerson=(id:string)=>personRows.some(r=>r.id===id&&r.currency===currency);
  const accountPersonRows=acc.flatMap(a=>a.economic.positions.filter(r=>selectedPerson(r.id)));
  const credit=accountPersonRows.reduce((s,l)=>s.plus(l.operationalCredit),toDecimal(0));
  const potential=acc.reduce((sum,a)=>sum.plus(Prisma.Decimal.min(Prisma.Decimal.max(a.economic.institutionalAvailable,0),a.economic.positions.filter(r=>selectedPerson(r.id)).reduce((s,r)=>s.plus(r.unfundedCredit),toDecimal(0)))),toDecimal(0));
  const capital=toDecimal(company?.position),receivable=personRows.reduce((s,l)=>s.plus(l.outstandingDebt),toDecimal(0)),recoveredExternal=personRows.reduce((s,l)=>s.plus(l.recoveredExternal),toDecimal(0)),unfunded=accountPersonRows.reduce((s,l)=>s.plus(l.unfundedCredit),toDecimal(0)),available=acc.filter(a=>a.snapshot?.state==="AVAILABLE"&&!a.stale).reduce((s,a)=>s.plus(a.snapshot!.availableBalance!),toDecimal(0));
  const dailyComplete=acc.length>0&&acc.every(a=>a.dailyComplete),daily=dailyComplete?acc.reduce((s,a)=>s.plus(a.dailyMetaSpend??0),toDecimal(0)):null;
  const completeBalances=acc.length>0&&acc.every(a=>a.snapshot?.state==="AVAILABLE"&&!a.stale);
  const incoming=movements.filter(m=>m.currency===currency&&m.kind==='CONTRIBUTION'&&m.status==='CONFIRMED'&&m.effectiveDate>=from&&m.effectiveDate<=through).filter(m=>{
    const id=m.beneficiaryPersonId??(m.origin==='PERSON'&&!['GLOBAL','RECOMPOSE_CASH'].includes(m.fundingNature)?m.personId:null),person=id?people.find(p=>p.id===resolve(id)):null;
    return (!selectedPeople.size||id&&selectedPeople.has(resolve(id)))&&(!role||person?.operationalRole===role);
  }).reduce((sum,m)=>sum.plus(m.amount),toDecimal(0));
  return {currency,globalPeriodContributions:movements.filter(m=>m.currency===currency&&m.status==='CONFIRMED'&&m.kind==='CONTRIBUTION'&&m.effectiveDate>=from&&m.effectiveDate<=through).reduce((s,m)=>s.plus(m.amount),toDecimal(0)).toFixed(2),periodBeneficiaryDistributions:personRows.reduce((s,r)=>s.plus(r.periodDistributions),toDecimal(0)).toFixed(2),availableBalance:acc.some(a=>a.snapshot?.state==="AVAILABLE"&&!a.stale)?available.toFixed(2):null,completeBalances,dailyMetaSpend:daily?.toFixed(2)??null,autonomyDays:completeBalances&&daily&&daily.gt(0)?available.div(daily).toFixed(1):null,periodContributions:incoming.toFixed(2),flyimobPosition:capital.toFixed(2),operationalCredit:credit.toFixed(2),flyimobReceivable:receivable.toFixed(2),flyimobRecoveredExternal:recoveredExternal.toFixed(2),bonuses:personRows.reduce((sum,r)=>sum.plus(r.bonuses),toDecimal(0)).toFixed(2),forgiven:personRows.reduce((sum,r)=>sum.plus(r.forgiven),toDecimal(0)).toFixed(2),losses:personRows.reduce((sum,r)=>sum.plus(r.losses),toDecimal(0)).toFixed(2),unfundedConsumption:unfunded.toFixed(2),flyimobPotentialExposure:receivable.plus(potential).toFixed(2),operatingPeople:personRows.filter(l=>l.activeCampaigns>0&&toDecimal(l.dailyMetaSpend).gt(0)).length};
 });
 const tableWithCoverage=tableWithOpening.map(l=>({...l,dailyMetaSpend:physical.filter(a=>a.currency===l.currency).every(a=>a.economicDailyComplete)?l.dailyMetaSpend:null}));
 return {accounts:physical,table:tableWithCoverage,totals,...range,canWrite:viewer.user.role==="OWNER",methodology:"Crédito para mídia = aportes da origem + ajustes − crédito destinado a beneficiários + crédito recebido + transferências por compensação − consumo efetivo. Posição econômica = crédito para mídia + financiamento a receber − obrigação recuperável. Financiamento Flyimob entra uma vez no caixa; beneficiário recebe crédito para mídia e assume obrigação pelo principal. Liquidação Meta transfere crédito para a empresa sem nova entrada física; recuperação externa reduz a obrigação sem alterar caixa Meta. Consumo físico/autonomia: média do Investimento Meta nos 7 dias completos anteriores, por fuso da conta; sem cobertura completa a estimativa fica indisponível. Caixa e conciliação mostram a fotografia atual, independente do filtro de responsável. Consumo sem cobertura permanece pendência de conciliação, sem credor presumido. Bonificação posterior e perda reduzem o recebível, sem recuperação fictícia. Exposição potencial Flyimob = principal recuperável ainda a receber + cobertura potencial de consumo sem financiamento explícito (limitada ao crédito próprio da empresa para mídia); a parcela potencial não rastreia dinheiro fungível. Recuperações externas são exibidas separadamente e não são saldo Meta. Não somar exposição ao crédito utilizado."};
}

export async function marketingLung(viewer:MarketingViewer,params:URLSearchParams,db=prisma,now=new Date()) {
 authorize(viewer);
 return db.$transaction(async tx=>lungData(viewer,params,tx as unknown as typeof prisma,now),{isolationLevel:"RepeatableRead",timeout:60000});
}

function accountEconomicSummary(movements:Parameters<typeof economicLedger>[0],metrics:Parameters<typeof economicLedger>[1],from:Date,to:Date,resolve:(id:string)=>string){
 const ledger=economicLedger(movements,metrics,from,to,resolve),confirmed=movements.filter(m=>m.status==='CONFIRMED'&&m.effectiveDate<=to);
 const sum=(field:keyof typeof ledger[number])=>ledger.reduce((total,row)=>total.plus(String(row[field])),toDecimal(0));
 const expected=confirmed.filter(m=>m.kind==='CONTRIBUTION'||m.fundingNature==='STANDARD'||!m.fundingNature).reduce((total,m)=>total.plus(m.amount),toDecimal(0)).minus(sum('consumption'));
 const media=sum('mediaPosition'),positionSum=sum('position');
 const company=ledger.find(r=>r.id==='FLYIMOB');
 const pendingCash=confirmed.filter(m=>m.fundingNature==='RECOMPOSE_CASH').reduce((total,parent)=>total.plus(parent.amount).minus(confirmed.filter(m=>m.distributionMovementId===parent.id).reduce((s,m)=>s.plus(m.amount),toDecimal(0))),toDecimal(0));
 const opening=economicLedger(movements,metrics,from,new Date(from.getTime()-86400000),resolve);
 const positions=ledger.map(r=>({...r,openingPosition:opening.find(o=>o.id===r.id&&o.currency===r.currency)?.position??'0.00',periodPositionChange:toDecimal(r.position).minus(opening.find(o=>o.id===r.id&&o.currency===r.currency)?.position??0).toFixed(2)}));
 return {positions,contributions:sum('contributions').toFixed(2),consumption:sum('consumption').toFixed(2),mediaRights:ledger.filter(r=>!['FLYIMOB','OTHER','UNASSIGNED'].includes(r.id)).reduce((s,r)=>s.plus(Prisma.Decimal.max(r.mediaPosition,0)),toDecimal(0)).toFixed(2),institutionalMedia:company?.mediaPosition??'0.00',institutionalAvailable:toDecimal(company?.mediaPosition).minus(pendingCash).toFixed(2),pendingPhysicalRecomposition:pendingCash.toFixed(2),unfundedConsumption:sum('unfundedCredit').toFixed(2),receivable:company?.receivable??'0.00',bonuses:company?.bonuses??'0.00',forgiven:company?.forgiven??'0.00',losses:company?.losses??'0.00',recoveredExternal:company?.recoveredExternal??'0.00',expectedEconomic:expected.toFixed(2),mediaTotal:media.toFixed(2),positionTotal:positionSum.toFixed(2),invariantDifference:media.minus(expected).toFixed(2),balanced:media.eq(expected)&&positionSum.eq(media),missingMetrics:ledger.reduce((s,r)=>s+r.missing,0)};
}
