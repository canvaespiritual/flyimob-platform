import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Prisma} from '@prisma/client';
import {dbFixture} from './funding-fixture';
import {prisma} from '../../src/lib/prisma';
import {createMoneyMovement,transitionMoneyMovement} from '../../src/lib/marketing/finance.server';
import {economicLedger,physicalReconciliation,type EconomicMovement} from '../../src/lib/marketing/finance-calculations';
import {day,type MarketingViewer} from '../../src/lib/marketing/policy';
import {moneyMovementList,marketingLung} from '../../src/lib/marketing/finance-queries.server';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {FundingBeneficiaryFields} from '../../src/app/admin/marketing/finance-ui';

const D=(v:string|number)=>new Prisma.Decimal(v),date=day('2026-05-11');
const viewer:MarketingViewer={user:{id:'owner',tenantId:'tenant',role:'OWNER'},tenant:{id:'tenant',isPlatform:false}};
const funding={accountId:'account',origin:'FLYIMOB',personId:null,beneficiaryPersonId:'sandra',fundingNature:'RECOVERABLE',kind:'CONTRIBUTION',status:'CONFIRMED',amount:'279.32',effectiveDate:'2026-05-11',currency:'BRL',idempotencyKey:'funding'};
const funded: EconomicMovement={...funding,id:'funding',amount:D('279.32'),effectiveDate:date};
const own: EconomicMovement={id:'own',personId:'sandra',origin:'PERSON',kind:'CONTRIBUTION',status:'CONFIRMED',amount:D('100'),effectiveDate:date,currency:'BRL'};
const spent=(value='100',personId='sandra',currency='BRL',at=date)=>({date:at,state:'CONFIRMED',currency,metaSpend:D(value),effectiveSpend:D(value),leads:2,campaign:{id:'campaign',assignments:[{personId,validFrom:day('2026-01-01'),validTo:null}]}});
const settlement=(value='100',nature='SETTLEMENT_META',at=date):EconomicMovement=>({id:'settlement',personId:'sandra',beneficiaryPersonId:'sandra',origin:'PERSON',kind:'ADJUSTMENT',fundingNature:nature,fundingMovementId:'funding',status:'CONFIRMED',amount:D(value),effectiveDate:at,currency:'BRL',affectsPhysicalBalance:false});
function ledger(m: EconomicMovement[],s:ReturnType<typeof spent>[]=[],from=date,to=date){return economicLedger(m,s,from,to);}
test('Sandra case: one physical contribution, company receivable, beneficiary obligation and no own contribution',()=>{
 const rows=ledger([funded]),sandra=rows.find(r=>r.id==='sandra')!,company=rows.find(r=>r.id==='FLYIMOB')!;
 assert.equal(sandra.contributions,'0.00');assert.equal(sandra.fundingReceived,'279.32');assert.equal(sandra.mediaPosition,'279.32');assert.equal(sandra.outstandingDebt,'279.32');assert.equal(sandra.position,'0.00');assert.equal(sandra.operationalCredit,'279.32');
 assert.equal(company.contributions,'279.32');assert.equal(company.fundingProvided,'279.32');assert.equal(company.mediaPosition,'0.00');assert.equal(company.receivable,'279.32');assert.equal(company.position,'279.32');
 assert.equal(rows.reduce((sum,r)=>sum.plus(r.position),D(0)).toFixed(2),'279.32');assert.equal(physicalReconciliation(D(0),[funded],[],date,date,D('279.32'),D('.02')).expected,'279.32');
});
test('consumption uses funded media before creating additional operational overdraft, without counting the loan twice',()=>{
 const s=ledger([funded],[spent('100')]).find(r=>r.id==='sandra')!;assert.equal(s.mediaPosition,'179.32');assert.equal(s.position,'-100.00');assert.equal(s.operationalCredit,'279.32');assert.equal(s.unfundedCredit,'0.00');
 const exceeded=ledger([funded],[spent('300')]).find(r=>r.id==='sandra')!;assert.equal(exceeded.operationalCredit,'300.00');assert.equal(exceeded.unfundedCredit,'20.68');
});
test('new own deposit and explicit Meta compensation reduce debt and transfer economic credit once',()=>{
 const movements=[funded,own,settlement()],rows=ledger(movements,[spent('279.32')]);
 const s=rows.find(r=>r.id==='sandra')!,c=rows.find(r=>r.id==='FLYIMOB')!;
 assert.equal(s.contributions,'100.00');assert.equal(s.outstandingDebt,'179.32');assert.equal(s.mediaPosition,'0.00');assert.equal(s.operationalCredit,'179.32');assert.equal(c.mediaPosition,'100.00');assert.equal(c.receivable,'179.32');assert.equal(c.position,'279.32');
 assert.equal(physicalReconciliation(D(0),movements,[spent('279.32')],date,date,D('100'),D('.02')).expected,'100.00');
});
test('own deposit alone does not silently repay a financing contract',()=>{
 const s=ledger([funded,own],[spent('279.32')]).find(r=>r.id==='sandra')!;assert.equal(s.mediaPosition,'100.00');assert.equal(s.outstandingDebt,'279.32');assert.equal(s.operationalCredit,'279.32');
});
test('external recovery reduces principal without creating Meta cash or new advertising credit',()=>{
 const recovery=settlement('50','SETTLEMENT_EXTERNAL'),rows=ledger([funded,recovery],[spent('100')]);
 const s=rows.find(r=>r.id==='sandra')!,c=rows.find(r=>r.id==='FLYIMOB')!;
 assert.equal(s.mediaPosition,'179.32');assert.equal(s.outstandingDebt,'229.32');assert.equal(s.operationalCredit,'229.32');assert.equal(c.receivable,'229.32');assert.equal(c.recoveredExternal,'50.00');assert.equal(c.mediaPosition,'0.00');
 assert.equal(physicalReconciliation(D(0),[funded,recovery],[spent('100')],date,date,D('179.32'),D('.02')).expected,'179.32');
});
test('institutional Flyimob funding and a nonrecoverable grant retain distinct economic treatment',()=>{
 const institutional=ledger([{...funded,beneficiaryPersonId:null,fundingNature:'STANDARD'}]);assert.equal(institutional.length,1);assert.equal(institutional[0].position,'279.32');assert.equal(institutional[0].receivable,'0.00');
 const grant=ledger([{...funded,fundingNature:'STANDARD'}]);assert.equal(grant.find(r=>r.id==='sandra')?.position,'279.32');assert.equal(grant.find(r=>r.id==='sandra')?.outstandingDebt,'0.00');assert.equal(grant.find(r=>r.id==='FLYIMOB')?.position,'0.00');
});
test('Laura historical own funding keeps original id, source, beneficiary fallback and exact position',()=>{
 const laura={...own,id:'historical-laura',personId:'laura',amount:D('1204.65')};
 const r=ledger([laura],[spent('100','laura')])[0];assert.equal(r.contributions,'1204.65');assert.equal(r.position,'1104.65');assert.equal(r.fundingReceived,'0.00');assert.equal(r.outstandingDebt,'0.00');assert.equal(laura.id,'historical-laura');assert.equal(laura.personId,'laura');
});
test('pending/cancelled funding and recoveries are excluded from all confirmed positions',()=>{
 for(const status of ['PENDING','CANCELLED'])assert.deepEqual(ledger([{...funded,status}]),[]);
 for(const status of ['PENDING','CANCELLED'])assert.equal(ledger([funded,{...settlement(),status}]).find(r=>r.id==='sandra')?.outstandingDebt,'279.32');
});
test('future settlements do not rewrite previous dates or make period totals cumulative',()=>{
 const later=day('2026-05-12'),rows=ledger([funded,settlement('50','SETTLEMENT_EXTERNAL',later)],[],date,date);assert.equal(rows.find(r=>r.id==='sandra')?.outstandingDebt,'279.32');
 const after=ledger([funded,settlement('50','SETTLEMENT_EXTERNAL',later)],[],later,later);assert.equal(after.find(r=>r.id==='FLYIMOB')?.periodContributions,'0.00');assert.equal(after.find(r=>r.id==='sandra')?.outstandingDebt,'229.32');
});
test('source identity can differ from beneficiary without inventing a second contribution',()=>{
 const rows=ledger([{...own,beneficiaryPersonId:'other'}]);assert.equal(rows.find(r=>r.id==='sandra')?.position,'0.00');assert.equal(rows.find(r=>r.id==='other')?.fundingReceived,'100.00');assert.equal(rows.find(r=>r.id==='other')?.contributions,'0.00');
});
test('currency and campaign historical assignments remain independent from funding beneficiary',()=>{
 const rows=ledger([funded,{...funded,id:'usd',currency:'USD'}],[spent('10','other'),spent('20','sandra','USD')]);
 assert.equal(rows.find(r=>r.id==='sandra'&&r.currency==='BRL')?.mediaPosition,'279.32');assert.equal(rows.find(r=>r.id==='sandra'&&r.currency==='USD')?.mediaPosition,'259.32');assert.equal(rows.find(r=>r.id==='other')?.position,'-10.00');
});
for(const origin of ['PERSON','FLYIMOB','OTHER'])test(`rendered beneficiary selector remains available for ${origin} and only includes eligible people`,()=>{
 const people=[{id:'sandra',name:'Sandra',operationalRole:'BROKER' as const,active:true,eligible:true},{id:'inactive',name:'Inactive',operationalRole:'DIRECTOR' as const,active:false,eligible:false}];
 const html=renderToStaticMarkup(createElement(FundingBeneficiaryFields,{people,origin,beneficiary:'',nature:'STANDARD',setBeneficiary:()=>{},setNature:()=>{}}));
 assert.match(html,/Responsável beneficiado/);assert.match(html,/Sandra/);assert.doesNotMatch(html,/Inactive/);assert.match(html,/Sem beneficiário individual/);
 if(origin==='FLYIMOB')assert.match(html,/Financiamento de mídia recuperável/);
});

const recovery=(nature='SETTLEMENT_EXTERNAL',amount='50')=>({...funding,origin:'PERSON',personId:'sandra',beneficiaryPersonId:'sandra',kind:'ADJUSTMENT',fundingNature:nature,fundingMovementId:'funding',adjustmentType:'COMPENSATION',affectsPhysicalBalance:false,reason:'Synthetic confirmed recovery',amount,idempotencyKey:'recovery'});
test('creation persists source and beneficiary once, audited and idempotent',async()=>{
 const f=dbFixture();assert.deepEqual(await createMoneyMovement(viewer,funding,f.db),{id:'funding'});assert.deepEqual(await createMoneyMovement(viewer,funding,f.db),{id:'funding'});assert.equal(f.records.length,1);assert.equal(f.records[0].personId,null);assert.equal(f.records[0].beneficiaryPersonId,'sandra');assert.equal(f.records[0].fundingNature,'RECOVERABLE');assert.equal(f.events.length,1);
 const metadata=f.events[0].metadata as {after:{beneficiaryPersonId:string;origin:string}};assert.equal(metadata.after.beneficiaryPersonId,'sandra');assert.equal(metadata.after.origin,'FLYIMOB');
 await assert.rejects(createMoneyMovement(viewer,{...funding,beneficiaryPersonId:'other'},f.db));
});
for(const role of ['BROKER','MANAGER','DIRECTOR','DIRECTION'])test(`eligible no-login ${role} can be funded without changing role`,async()=>{const f=dbFixture();f.setRole(role);await createMoneyMovement(viewer,funding,f.db);assert.equal(f.records[0].beneficiaryPersonId,'sandra');});
test('institutional company contribution accepts no beneficiary and has no recoverable debt',async()=>{const f=dbFixture();await createMoneyMovement(viewer,{...funding,beneficiaryPersonId:null,fundingNature:'STANDARD'},f.db);assert.equal(f.records[0].beneficiaryPersonId,null);});
test('inactive/ineligible or foreign beneficiary, account and currency are rejected',async()=>{
 const f=dbFixture();f.setActive(false);await assert.rejects(createMoneyMovement(viewer,funding,f.db));f.setActive(true);f.setRole('OTHER');await assert.rejects(createMoneyMovement(viewer,funding,f.db));f.setRole('BROKER');
 for(const change of [{beneficiaryPersonId:'foreign'},{accountId:'foreign'},{currency:'USD'}])await assert.rejects(createMoneyMovement(viewer,{...funding,...change},f.db));assert.equal(f.records.length,0);
});
test('recoverable classification requires corporate contribution and individual beneficiary; recoveries cannot alter physical cash',async()=>{
 const f=dbFixture();
 for(const change of [{beneficiaryPersonId:null},{origin:'PERSON',personId:'sandra'},{origin:'OTHER'},{fundingNature:'UNKNOWN'}])await assert.rejects(createMoneyMovement(viewer,{...funding,...change},f.db));
 await createMoneyMovement(viewer,funding,f.db);
 for(const change of [{affectsPhysicalBalance:true},{amount:'-1'},{fundingMovementId:null},{kind:'CONTRIBUTION'},{beneficiaryPersonId:'other'}])await assert.rejects(createMoneyMovement(viewer,{...recovery(),...change},f.db));
 assert.equal(f.records.length,1);
});
test('historical API payload and idempotency key remain compatible with Laura-like own contributions',async()=>{
 const f=dbFixture(),old={...funding,origin:'PERSON',personId:'sandra',beneficiaryPersonId:undefined,fundingNature:undefined,amount:'1204.65'};
 await createMoneyMovement(viewer,old,f.db);f.records[0].beneficiaryPersonId=null;assert.deepEqual(await createMoneyMovement(viewer,old,f.db),{id:'funding'});assert.equal(f.records.length,1);assert.equal(f.records[0].amount.toFixed(2),'1204.65');
});
test('recovery is a linked, positive, nonphysical adjustment and survives beneficiary inactivity',async()=>{
 const f=dbFixture();await createMoneyMovement(viewer,funding,f.db);f.setActive(false);await createMoneyMovement(viewer,recovery(),f.db);assert.equal(f.records.length,2);assert.equal(f.records[1].fundingMovementId,'funding');assert.equal(f.records[1].affectsPhysicalBalance,false);assert.equal(f.events.length,2);
});
test('recoveries reserve pending principal and reject excess, mismatched operation/person/account/date/currency',async()=>{
 const f=dbFixture();await createMoneyMovement(viewer,funding,f.db);await createMoneyMovement(viewer,{...recovery(),status:'PENDING',amount:'250'},f.db);
 for(const change of [{amount:'30'},{beneficiaryPersonId:'other',personId:'other'},{accountId:'foreign'},{currency:'USD'},{fundingMovementId:'foreign'},{effectiveDate:'2026-05-10'}])await assert.rejects(createMoneyMovement(viewer,{...recovery(),idempotencyKey:'different',...change},f.db));assert.equal(f.records.length,2);
});
test('Meta compensation reuses available economic credit and rejects insufficient credit after prior reservations',async()=>{
 const f=dbFixture();await createMoneyMovement(viewer,funding,f.db);await createMoneyMovement(viewer,{...recovery('SETTLEMENT_META','200'),status:'PENDING'},f.db);
 await assert.rejects(createMoneyMovement(viewer,{...recovery('SETTLEMENT_META','100'),idempotencyKey:'over'},f.db));
 await transitionMoneyMovement(viewer,'recovery',{version:0,status:'CONFIRMED',reason:'Confirmed'},f.db);assert.equal(f.records[1].status,'CONFIRMED');
});
test('Meta compensation cannot repay debt with credit already consumed even when principal is available',async()=>{
 const f=dbFixture();await createMoneyMovement(viewer,funding,f.db);
 Object.assign(f.db.marketingDailyMetric,{findMany:async()=>[spent('279.32')]});
 await createMoneyMovement(viewer,{...funding,origin:'PERSON',personId:'sandra',beneficiaryPersonId:'sandra',fundingNature:'STANDARD',amount:'50',idempotencyKey:'own'},f.db);
 await assert.rejects(createMoneyMovement(viewer,recovery('SETTLEMENT_META','60'),f.db),/Crédito econômico disponível/);
 assert.equal(f.records.length,2);
});
test('Meta settlement capacity applies historical audited effective-cost corrections, not just physical Meta spend',async()=>{
 const f=dbFixture();await createMoneyMovement(viewer,funding,f.db);
 Object.assign(f.db.marketingDailyMetric,{findMany:async()=>[spent('100')]});
 Object.assign(f.db.marketingAuditEvent,{findMany:async()=>[{metadata:{after:{affectedFrom:'2026-04-05',affectedTo:'2026-10-05'}}}]});
 Object.assign(f.db.marketingCostRule,{findMany:async()=>[{id:'r',percentage:D('12.15'),validFrom:day('2026-04-05'),validTo:null}]});
 await assert.rejects(createMoneyMovement(viewer,recovery('SETTLEMENT_META','170'),f.db),/Crédito econômico disponível/);
 assert.equal(f.records.length,1);
});
test('cannot cancel financed principal while linked confirmed or pending recoveries remain',async()=>{
 const f=dbFixture();await createMoneyMovement(viewer,funding,f.db);await createMoneyMovement(viewer,recovery(),f.db);
 await assert.rejects(transitionMoneyMovement(viewer,'funding',{version:0,status:'CANCELLED',reason:'Duplicate'},f.db));
 await transitionMoneyMovement(viewer,'recovery',{version:0,status:'CANCELLED',reason:'Wrong recovery'},f.db);await transitionMoneyMovement(viewer,'funding',{version:0,status:'CANCELLED',reason:'Duplicate'},f.db);assert.equal(f.records[0].status,'CANCELLED');
});
test('cancelled or pending financing cannot accept recovery; beneficiary payload cannot be edited',async()=>{
 for(const status of ['PENDING','CANCELLED']){const f=dbFixture();await createMoneyMovement(viewer,{...funding,status:status==='CANCELLED'?'CONFIRMED':status},f.db);f.records[0].status=status;await assert.rejects(createMoneyMovement(viewer,recovery(),f.db));}
 const f=dbFixture();await createMoneyMovement(viewer,funding,f.db);await assert.rejects(transitionMoneyMovement(viewer,'funding',{version:0,status:'CANCELLED',reason:'x',beneficiaryPersonId:'other'},f.db));
});
test('DIRECTOR cannot fund or recover and operational hierarchy never bypasses tenant authorization',async()=>{
 const f=dbFixture();for(const v of [{...viewer,user:{...viewer.user,role:'DIRECTOR' as const}},{...viewer,tenant:{id:'foreign',isPlatform:false}}])for(const input of [funding,recovery()])await assert.rejects(createMoneyMovement(v,input,f.db));assert.equal(f.records.length,0);
});
test('money listing beneficiary filter includes Flyimob funding without pretending it is a personal origin',async()=>{
 const f=dbFixture();const delegate=f.db.marketingMoneyMovement as unknown as {findMany:unknown;count:unknown};
 delegate.findMany=async({where,select}:{where:Prisma.MarketingMoneyMovementWhereInput;select:Record<string,unknown>})=>{assert.equal(where.tenantId,'tenant');assert.equal(where.origin,'FLYIMOB');assert.deepEqual(where.OR,[{beneficiaryPersonId:{in:['sandra']}},{beneficiaryPersonId:null,personId:{in:['sandra']},fundingNature:{notIn:['GLOBAL','RECOMPOSE_CASH']}}]);assert.ok(select.beneficiary);assert.ok(select.settlements);return [];};delegate.count=async()=>0;
 const list=await moneyMovementList(viewer,new URLSearchParams('period=custom&from=2026-05-11&to=2026-05-11&personId=sandra&origin=FLYIMOB'),f.db);assert.equal(list.total,0);
});
test('Pulmão totals include physical incoming once and explicit receivable without duplicating credit/exposure',async()=>{
 const f=dbFixture();await createMoneyMovement(viewer,funding,f.db);
 const tx={...f.db,metaAdAccount:{...f.db.metaAdAccount,findMany:async()=>[{id:'account',name:'Synthetic Goiás',currency:'BRL',timezone:'America/Sao_Paulo',status:'ACTIVE',sourceAccountStatus:1,lastSyncedAt:null}]},marketingDailyMetric:{count:async()=>0,findMany:async()=>[]},marketingCampaign:{findMany:async()=>[]},marketingReconciliationMark:{findMany:async()=>[]},marketingBalanceSnapshot:{findFirst:async()=>null},marketingSyncRun:{findMany:async()=>[]}};
 const db={...tx,$transaction:async(fn:(tx:unknown)=>unknown)=>fn(tx)} as unknown as typeof prisma;
 for(const personId of ['', 'sandra']){
  const result=await marketingLung(viewer,new URLSearchParams({period:'custom',from:'2026-05-11',to:'2026-05-11',personId}),db);
  assert.equal(result.totals[0].periodContributions,'279.32');assert.equal(result.totals[0].flyimobReceivable,'279.32');assert.equal(result.totals[0].flyimobPotentialExposure,'279.32');assert.equal(result.totals[0].operationalCredit,'279.32');
 }
 await createMoneyMovement(viewer,{...funding,beneficiaryPersonId:'other',amount:'100',idempotencyKey:'other'},f.db);
 const other=await marketingLung(viewer,new URLSearchParams('period=custom&from=2026-05-11&to=2026-05-11&personId=other'),db);
 assert.equal(other.totals[0].flyimobReceivable,'100.00');assert.equal(other.totals[0].flyimobPotentialExposure,'100.00');assert.equal(other.totals[0].periodContributions,'100.00');assert.equal(other.totals[0].operationalCredit,'100.00');
});
