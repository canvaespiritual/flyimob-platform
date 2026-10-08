import {requestContext} from '../documentacoes/request-context';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Prisma} from '@prisma/client';
import {createMoneyMovement,createGlobalContribution,transitionMoneyMovement} from '../../src/lib/marketing/finance.server';
import {economicLedger,physicalReconciliation,type EconomicMovement} from '../../src/lib/marketing/finance-calculations';
import {day,type MarketingViewer} from '../../src/lib/marketing/policy';
import {dbFixture} from './funding-fixture';
import {draftTotal} from '../../src/app/admin/marketing/finance-global-form';
import {POST} from '../../src/app/api/marketing/finance/global/route';
const D=(value:string|number)=>new Prisma.Decimal(value),at=day('2026-05-11');
const viewer:MarketingViewer={user:{id:'owner',tenantId:'tenant',role:'OWNER'},tenant:{id:'tenant',isPlatform:false}};
const movement={accountId:'account',personId:null,origin:'FLYIMOB',kind:'CONTRIBUTION',status:'CONFIRMED',effectiveDate:'2026-05-11',currency:'BRL',fundingNature:'GLOBAL',amount:'2000',idempotencyKey:'global'};
const parent:EconomicMovement={...movement,id:'global',amount:D(2000),effectiveDate:at};
const line=(amount='500',beneficiary='sandra',nature='ALLOCATION_LOAN',id='line'):EconomicMovement=>({...parent,id,kind:'ADJUSTMENT',affectsPhysicalBalance:false,distributionMovementId:'global',beneficiaryPersonId:beneficiary,fundingNature:nature,amount:D(amount)});
const spent=(value='500',personId='gilberto')=>({date:at,state:'CONFIRMED',currency:'BRL',metaSpend:D(value),effectiveSpend:D(value),leads:0,campaign:{id:'campaign',assignments:[{personId,validFrom:day('2026-01-01'),validTo:null}]}});
const rows=(movements:EconomicMovement[],metrics:ReturnType<typeof spent>[]=[])=>economicLedger(movements,metrics,at,at);
const recovery=(nature:string,amount='200'):EconomicMovement=>({...line(amount,'sandra',nature,'settlement'),distributionMovementId:null,fundingMovementId:'line',origin:'PERSON',personId:'sandra'});
const draftLine=(amount='500',beneficiaryPersonId:string|null='sandra',fundingNature='ALLOCATION_LOAN')=>({amount,beneficiaryPersonId,fundingNature,reason:'Synthetic explicit decision'});
test('one global deposit distributes loans, grants and institutional reserve without multiplying physical cash',()=>{
 const movements=[parent,line(),line('300','other','ALLOCATION_BONUS','bonus'),line('700','','ALLOCATION','reserve')];const ledger=rows(movements),company=ledger.find(r=>r.id==='FLYIMOB')!;
 assert.equal(company.contributions,'2000.00');assert.equal(company.mediaPosition,'1200.00');assert.equal(company.receivable,'500.00');assert.equal(company.bonuses,'300.00');assert.equal(ledger.find(r=>r.id==='sandra')?.outstandingDebt,'500.00');assert.equal(ledger.find(r=>r.id==='other')?.outstandingDebt,'0.00');
 assert.equal(ledger.reduce((sum,r)=>sum.plus(r.position),D(0)).toFixed(2),'2000.00');assert.equal(physicalReconciliation(D(0),movements,[],at,at,D(2000),D('.02')).expected,'2000.00');
});
test('partial distribution retains remaining source media rights, not a second deposit',()=>{const r=rows([parent,line()]);assert.equal(r.find(r=>r.id==='FLYIMOB')?.mediaPosition,'1500.00');assert.equal(r.find(r=>r.id==='sandra')?.contributions,'0.00');});
test('advance bonus transfers media rights without debt or own contribution',()=>{const r=rows([{...parent,fundingNature:'BONUS',beneficiaryPersonId:'laura',amount:D(300)}]);const laura=r.find(r=>r.id==='laura')!;assert.equal(laura.mediaPosition,'300.00');assert.equal(laura.outstandingDebt,'0.00');assert.equal(laura.contributions,'0.00');assert.equal(laura.bonuses,'300.00');});
for(const [nature,field] of [['SETTLEMENT_BONUS','forgiven'],['SETTLEMENT_LOSS','losses']] as const)test(`${nature} reduces principal and preserves media/consumption without fake recovery`,()=>{const movements=[parent,line(),recovery(nature)];const r=rows(movements,[spent('500','sandra')]),s=r.find(r=>r.id==='sandra')!,c=r.find(r=>r.id==='FLYIMOB')!;assert.equal(s.outstandingDebt,'300.00');assert.equal(s.mediaPosition,'0.00');assert.equal(s.consumption,'500.00');assert.equal(c.receivable,'300.00');assert.equal(c.recoveredExternal,'0.00');assert.equal(c[field],'200.00');assert.equal(physicalReconciliation(D(0),movements,[spent('500','sandra')],at,at,D(1500),D('.02')).expected,'1500.00');});
test('Laura rights survive Gilberto cross-consumption and zero physical cash, without fictional Flyimob debt',()=>{
 const laura={...parent,id:'laura-own',origin:'PERSON',personId:'laura',fundingNature:'STANDARD',amount:D(500)};const r=rows([laura],[spent()]);assert.equal(r.find(r=>r.id==='laura')?.mediaPosition,'500.00');assert.equal(r.find(r=>r.id==='gilberto')?.unfundedCredit,'500.00');assert.equal(r.find(r=>r.id==='gilberto')?.outstandingDebt,'0.00');assert.equal(r.some(r=>r.id==='FLYIMOB'),false);assert.equal(physicalReconciliation(D(0),[laura],[spent()],at,at,D(0),D('.02')).expected,'0.00');
});
for(const nature of ['RECOMPOSE_LOAN','RECOMPOSE_BONUS'])test(`explicit ${nature} covers previous consumption once and preserves Laura rights`,()=>{
 const laura={...parent,id:'laura-own',origin:'PERSON',personId:'laura',fundingNature:'STANDARD',amount:D(500)},cash={...parent,amount:D(500)},allocation=line('500','gilberto',nature);const r=rows([laura,cash,allocation],[spent()]);assert.equal(r.find(r=>r.id==='laura')?.mediaPosition,'500.00');assert.equal(r.find(r=>r.id==='gilberto')?.mediaPosition,'0.00');assert.equal(r.find(r=>r.id==='gilberto')?.outstandingDebt,nature==='RECOMPOSE_LOAN'?'500.00':'0.00');assert.equal(r.find(r=>r.id==='FLYIMOB')?.mediaPosition,'0.00');assert.equal(physicalReconciliation(D(0),[laura,cash,allocation],[spent()],at,at,D(500),D('.02')).expected,'500.00');
});
test('physical-only recomposition never assigns a creditor or creates a second Laura credit',()=>{const laura={...parent,origin:'PERSON',personId:'laura',fundingNature:'STANDARD',amount:D(500)},cash={...parent,id:'cash',fundingNature:'RECOMPOSE_CASH',amount:D(500)};const r=rows([laura,cash],[spent()]);assert.equal(r.find(r=>r.id==='laura')?.mediaPosition,'500.00');assert.equal(r.find(r=>r.id==='gilberto')?.unfundedCredit,'500.00');assert.equal(r.find(r=>r.id==='FLYIMOB')?.receivable,'0.00');});
test('Vitor historical commission recovery reduces 600 to 200 with no new Meta cash',()=>{const fund=line('600','vitor'),recover={...recovery('SETTLEMENT_EXTERNAL','400'),beneficiaryPersonId:'vitor',personId:'vitor'};const r=rows([parent,fund,recover],[spent('600','vitor')]);assert.equal(r.find(r=>r.id==='vitor')?.outstandingDebt,'200.00');assert.equal(r.find(r=>r.id==='FLYIMOB')?.recoveredExternal,'400.00');assert.equal(physicalReconciliation(D(0),[parent,fund,recover],[spent('600','vitor')],at,at,null,D('.02')).expected,'1400.00');});
test('partial recovery plus forgiveness closes loan without classifying forgiveness as money received',()=>{const r=rows([parent,line(),recovery('SETTLEMENT_EXTERNAL','300'),{...recovery('SETTLEMENT_BONUS','200'),id:'forgiven'}]);assert.equal(r.find(r=>r.id==='sandra')?.outstandingDebt,'0.00');assert.equal(r.find(r=>r.id==='FLYIMOB')?.recoveredExternal,'300.00');assert.equal(r.find(r=>r.id==='FLYIMOB')?.forgiven,'200.00');});
test('period fields exclude later allocations and writeoffs without rewriting old cutoff',()=>{const later=day('2026-05-12'),allocation={...line(),effectiveDate:later};assert.equal(economicLedger([parent,allocation],[],at,at)[0].mediaPosition,'2000.00');const r=economicLedger([parent,allocation],[],later,later);assert.equal(r.find(r=>r.id==='sandra')?.periodDistributions,'500.00');assert.equal(r.find(r=>r.id==='FLYIMOB')?.periodContributions,'0.00');});
test('global service is atomic, audited and idempotent with immutable draft manifest',async()=>{const f=dbFixture(),value={movement,distributions:[draftLine(),draftLine('300','other','ALLOCATION_BONUS')]};const result=await createGlobalContribution(viewer,value,f.db);assert.equal(f.records.length,3);assert.deepEqual(await createGlobalContribution(viewer,value,f.db),result);assert.equal(f.records.length,3);assert.equal(f.records.filter(r=>r.affectsPhysicalBalance).length,1);await assert.rejects(createGlobalContribution(viewer,{...value,distributions:[]},f.db),/Chave global/);assert.equal(f.records.length,3);});
test('global excess and invalid beneficiary roll back entire physical entry',async()=>{const f=dbFixture();await assert.rejects(createGlobalContribution(viewer,{movement,distributions:[draftLine('2001')]},f.db));assert.equal(f.records.length,0);await assert.rejects(createGlobalContribution(viewer,{movement,distributions:[draftLine('100','foreign')]},f.db));assert.equal(f.records.length,0);assert.equal(f.events.length,0);});
test('later allocation cannot exceed remaining confirmed plus pending parent principal',async()=>{const f=dbFixture();const parent=await createGlobalContribution(viewer,{movement:{...movement,amount:'500'},distributions:[draftLine('400')]},f.db);await assert.rejects(createMoneyMovement(viewer,{...movement,kind:'ADJUSTMENT',fundingNature:'ALLOCATION_LOAN',amount:'101',beneficiaryPersonId:'other',adjustmentType:'COMPENSATION',affectsPhysicalBalance:false,distributionMovementId:parent.id,reason:'Synthetic',idempotencyKey:'extra'},f.db),/excedem/);assert.equal(f.records.length,2);});
test('global parent cannot be cancelled while active distributions remain',async()=>{const f=dbFixture();const parent=await createGlobalContribution(viewer,{movement,distributions:[draftLine()]},f.db);await assert.rejects(transitionMoneyMovement(viewer,parent.id,{version:0,status:'CANCELLED',reason:'Synthetic'},f.db),/distribuições/);});
test('bonus and loss remain owner-only and loan principal limits include all writeoffs',async()=>{const f=dbFixture();await createGlobalContribution(viewer,{movement,distributions:[draftLine()]},f.db);const value={...movement,kind:'ADJUSTMENT',origin:'PERSON',personId:'sandra',beneficiaryPersonId:'sandra',fundingMovementId:'global:0',fundingNature:'SETTLEMENT_LOSS',adjustmentType:'COMPENSATION',affectsPhysicalBalance:false,amount:'300',reason:'Synthetic loss',idempotencyKey:'loss'};await assert.rejects(createMoneyMovement({...viewer,user:{...viewer.user,role:'DIRECTOR'}},value,f.db));await createMoneyMovement(viewer,value,f.db);await assert.rejects(createMoneyMovement(viewer,{...value,fundingNature:'SETTLEMENT_BONUS',amount:'201',idempotencyKey:'bonus'},f.db),/excedem/);});
test('global tenant, account, currency and beneficiary isolation stays mandatory',async()=>{for(const change of [{accountId:'foreign'},{currency:'USD'}]){const f=dbFixture();await assert.rejects(createGlobalContribution(viewer,{movement:{...movement,...change},distributions:[]},f.db));assert.equal(f.records.length,0);}const f=dbFixture();await assert.rejects(createGlobalContribution({...viewer,tenant:{id:'foreign',isPlatform:false}},{movement,distributions:[]},f.db));});
test('commission reference is validated and never creates another general Financeiro entry',async()=>{const f=dbFixture();await createGlobalContribution(viewer,{movement,distributions:[draftLine()]},f.db);const value={...movement,kind:'ADJUSTMENT',origin:'PERSON',personId:'sandra',beneficiaryPersonId:'sandra',fundingMovementId:'global:0',fundingNature:'SETTLEMENT_EXTERNAL',adjustmentType:'COMPENSATION',affectsPhysicalBalance:false,amount:'400',reason:'Previously deducted commission',recoveryMethod:'COMMISSION',externalReference:'financeiro:existing-settlement-123',idempotencyKey:'commission'};await createMoneyMovement(viewer,value,f.db);assert.equal(f.records.length,3);assert.equal(f.records[2].externalReference,value.externalReference);await assert.rejects(createMoneyMovement(viewer,{...value,externalReference:null,idempotencyKey:'bad'},f.db));});
test('draft totals keep exact cents without floating point accumulation',()=>{assert.equal(draftTotal([{amount:'0.10'},{amount:'0.20'},{amount:'1204.65'}]),120495n);});
test('global endpoint denies anonymous requests before reading payload',async()=>{assert.equal((await requestContext(undefined,()=>POST(new Request('https://flyimob.test/api/marketing/finance/global',{method:'POST',body:'bad'})))).status,401);});

test('pending allocation cannot fund an actual Meta compensation before confirmation',async()=>{
 const f=dbFixture();await createGlobalContribution(viewer,{movement,distributions:[draftLine('500')]},f.db);
 const allocate={...movement,kind:'ADJUSTMENT',fundingNature:'ALLOCATION_BONUS',amount:'100',status:'PENDING',beneficiaryPersonId:'sandra',adjustmentType:'COMPENSATION',affectsPhysicalBalance:false,distributionMovementId:'global',reason:'Synthetic pending grant',idempotencyKey:'pending-grant'};
 await createMoneyMovement(viewer,allocate,f.db);
 // Consume all confirmed credit. Pending 100 cannot become money available to compensate.
 f.db.marketingDailyMetric.findMany=(async()=>[spent('500','sandra')]) as never;
 await assert.rejects(createMoneyMovement(viewer,{...allocate,status:'CONFIRMED',origin:'PERSON',personId:'sandra',fundingNature:'SETTLEMENT_META',distributionMovementId:null,fundingMovementId:'global:0',amount:'100',idempotencyKey:'premature-compensation'},f.db),/insuficiente/);
});
test('recomposition requires a real tenant-scoped campaign reference and uncovered amount',async()=>{
 const f=dbFixture();await createGlobalContribution(viewer,{movement:{...movement,amount:'500'},distributions:[]},f.db);
 const value={...movement,kind:'ADJUSTMENT',fundingNature:'RECOMPOSE_LOAN',amount:'500',beneficiaryPersonId:'sandra',adjustmentType:'COMPENSATION',affectsPhysicalBalance:false,distributionMovementId:'global',reason:'Assume existing consumption explicitly',externalReference:'campaign:campaign',idempotencyKey:'assumption'};
 f.db.marketingDailyMetric.findMany=(async()=>[spent('500','sandra')]) as never;
 await createMoneyMovement(viewer,value,f.db);
 await assert.rejects(createMoneyMovement(viewer,{...value,idempotencyKey:'duplicate-assumption'},f.db),/excedem|cobertura/);
 await assert.rejects(createMoneyMovement(viewer,{...value,externalReference:'free text',idempotencyKey:'untraceable'},f.db),/formato/);
});

for(const code of ['P2034','P2002'])test(`global transaction retries ${code} without retaining partial deposits or distributions`,async()=>{
 const f=dbFixture();let attempt=0;
 const transaction=f.db.$transaction.bind(f.db) as unknown as (run:(tx:Prisma.TransactionClient)=>Promise<unknown>,options?:unknown)=>Promise<unknown>;
 f.db.$transaction=(async(run:(tx:Prisma.TransactionClient)=>Promise<unknown>,options?:unknown)=>transaction(async tx=>{const result=await run(tx);if(++attempt===1)throw new Prisma.PrismaClientKnownRequestError('Synthetic concurrent conflict',{code,clientVersion:'6.19.3'});return result;},options)) as typeof f.db.$transaction;
 await createGlobalContribution(viewer,{movement,distributions:[draftLine()]},f.db);
 assert.equal(attempt,2);assert.equal(f.records.length,2);assert.equal(f.records.filter(r=>r.affectsPhysicalBalance).length,1);assert.equal(f.events.length,3);
});

test('physical recomposition awaiting decision cannot fund an unrelated institutional allocation',async()=>{
 const f=dbFixture();f.db.marketingDailyMetric.findMany=(async()=>[spent('500','sandra')]) as never;
 await createMoneyMovement(viewer,{...movement,fundingNature:'STANDARD',amount:'500',idempotencyKey:'old-institutional'},f.db);
 await createMoneyMovement(viewer,{...movement,fundingNature:'STANDARD',kind:'ADJUSTMENT',adjustmentType:'CORRECTION',affectsPhysicalBalance:false,amount:'-500',reason:'Synthetic previous institutional charge',idempotencyKey:'old-charge'},f.db);
 await createGlobalContribution(viewer,{movement:{...movement,fundingNature:'RECOMPOSE_CASH',amount:'500',externalReference:'campaign:campaign'},distributions:[]},f.db);
 await assert.rejects(createMoneyMovement(viewer,{...movement,kind:'ADJUSTMENT',fundingNature:'ALLOCATION_BONUS',amount:'100',beneficiaryPersonId:'other',adjustmentType:'COMPENSATION',affectsPhysicalBalance:false,distributionMovementId:'old-institutional',reason:'Cannot spend undecided recomposition',idempotencyKey:'wrong-reserve'},f.db),/consumido ou reservado/);
});
test('monthly monetary components reconcile period position change without counting bonuses twice',()=>{
 const ledger=rows([parent,line(),line('300','other','ALLOCATION_BONUS','grant'),recovery('SETTLEMENT_BONUS','100')],[spent('100','sandra')]);
 for(const r of ledger){const change=D(r.periodContributions).plus(r.periodAdjustments).minus(r.periodFundingProvided).plus(r.periodFundingReceived).plus(r.periodMediaTransfers).minus(r.periodConsumption).plus(r.periodReceivableCreated).minus(r.periodReceivableReleased).minus(r.periodDebtCreated).plus(r.periodDebtReleased);assert.equal(change.toFixed(2),r.position);}
});

test('global retry accepts equivalent cents and JSON field ordering, but never a different beneficiary',async()=>{
 const f=dbFixture();const result=await createGlobalContribution(viewer,{movement,distributions:[draftLine()]},f.db);
 assert.deepEqual(await createGlobalContribution(viewer,{movement,distributions:[{reason:'Synthetic explicit decision',amount:'500.00',fundingNature:'ALLOCATION_LOAN',beneficiaryPersonId:'sandra',externalReference:null}]},f.db),result);
 await assert.rejects(createGlobalContribution(viewer,{movement,distributions:[draftLine('500','other')]},f.db),/Chave global/);assert.equal(f.records.length,2);
});
