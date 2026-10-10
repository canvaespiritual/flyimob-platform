import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma } from '@prisma/client';
import { selectionIds, assertSelection } from '../../src/lib/marketing/filter-selection';
import { marketingPerformance } from '../../src/lib/marketing/performance.server';
import { overview, campaignList } from '../../src/lib/marketing/queries.server';
import { moneyMovementList, marketingLung } from '../../src/lib/marketing/finance-queries.server';
import { day } from '../../src/lib/marketing/policy';
import { prisma } from '../../src/lib/prisma';

const viewer={user:{id:'owner',tenantId:'operation',role:'OWNER' as const},tenant:{id:'operation',isPlatform:false}};
const accounts=[1,2,3,4].map(n=>({id:`a${n}`,name:`Conta ${n}`,currency:n===4?'USD':'BRL',timezone:'America/Sao_Paulo',lastSyncedAt:null,status:'ACTIVE',sourceAccountStatus:1}));
const people=[1,2,3,4].map(n=>({id:`p${n}`,name:`Pessoa ${n}`,mergedIntoId:null,active:true,operationalRole:'DIRECTOR' as const}));
const rows=accounts.map((a,i)=>({date:day('2026-05-11'),currency:a.currency,state:'CONFIRMED',metaSpend:new Prisma.Decimal((i+1)*10),effectiveSpend:new Prisma.Decimal((i+1)*12),leads:i+1,campaign:{id:`c${i}`,name:`Campanha ${i}`,purpose:'CLIENTES',accountId:a.id,account:a,assignments:[{personId:`p${i+1}`,person:{name:`Pessoa ${i+1}`},brokerId:null,broker:null,validFrom:day('2026-01-01'),validTo:null,cancelledAt:null}]}}));
function fixture(){
 const scoped=(where:{tenantId:string})=>assert.equal(where.tenantId,'operation');
 const tx={
  metaAdAccount:{findMany:async({where}:{where:{tenantId:string;id?:{in:string[]}}})=>{scoped(where);return accounts.filter(a=>!where.id||where.id.in.includes(a.id));},aggregate:async()=>({_max:{lastSyncedAt:null}})},
  operationPerson:{findMany:async({where}:{where:{tenantId:string}})=>{scoped(where);return people;}},
  marketingDailyMetric:{count:async()=>rows.length,findMany:async({where}:{where:{tenantId:string;campaign:{accountId?:{in:string[]}};currency?:string}})=>{scoped(where);return rows.filter(r=>(!where.campaign.accountId||where.campaign.accountId.in.includes(r.campaign.accountId))&&(!where.currency||r.currency===where.currency));}},
  marketingSyncRun:{findMany:async()=>[]},marketingAuditEvent:{findMany:async()=>[]},marketingCostRule:{findMany:async()=>[]},
  marketingMoneyMovement:{count:async()=>0,findMany:async()=>[]},marketingCampaign:{findMany:async()=>[],count:async()=>0},marketingReconciliationMark:{findMany:async()=>[]},marketingBalanceSnapshot:{findFirst:async()=>null},
 };
 return {...tx,$transaction:async(fn:(db:typeof tx)=>unknown)=>fn(tx)} as unknown as typeof prisma;
}
function params(accountIds:string[]=[],personIds:string[]=[],key='personId'){
 const p=new URLSearchParams('period=custom&from=2026-05-11&to=2026-05-11&compare=true');
 accountIds.forEach(id=>p.append('accountId',id));personIds.forEach(id=>p.append(key,id));return p;
}
test('IDs repetidos são únicos; Todas não restringe; inválidos e externos são recusados',()=>{
 assert.deepEqual(selectionIds(new URLSearchParams('accountId=&accountId=a1&accountId=a1&accountId=a2'),'accountId'),['a1','a2']);
 assert.deepEqual(selectionIds(new URLSearchParams(),'accountId'),[]);
 assert.throws(()=>selectionIds(new URLSearchParams('accountId=a,b'),'accountId'),/inválida/);
 assert.throws(()=>assertSelection(['a1','foreign'],accounts),/operação/);
});
for(const [accountIds,personIds,expected] of [
 [['a1'],['p1'],10],[['a1','a2','a3'],['p1','p2','p3'],60],[[],[],60],
 [['a1','a2','a3'],['p2'],20],[['a1'],['p2','p3'],0],[['a4'],[],0],
] as [string[],string[],number][])test(`Desempenho OR/AND ${accountIds}/${personIds}`,async()=>{
 const result=await marketingPerformance(viewer,params(accountIds,personIds),fixture());
 assert.equal(result.current.totals.metaSpend,expected.toFixed(2));
 assert.equal(result.current.series[0].metaSpend,expected.toFixed(2));
 assert.equal(result.current.brokers.reduce((sum,b)=>sum+Number(b.metaSpend),0),expected);
 assert.equal(result.comparison?.totals.metaSpend,'0.00');
});
test('Visão geral usa o mesmo conjunto sem misturar BRL e USD',async()=>{
 const r=await overview(viewer,params(['a1','a2','a3'],['p1','p3'],'brokerId'),fixture());
 assert.equal(r.totals[0].metaSpend,'40.00');assert.equal(r.totals[0].leads,4);
 const empty=await overview(viewer,params(['a1'],['p2'],'brokerId'),fixture());assert.equal(empty.hasAnyMetrics,false);assert.deepEqual(empty.totals,[]);
 const all=await overview(viewer,params(),fixture());assert.equal(all.totals.length,2);
});
test('Pulmão preserva caixa, consumo físico e razão completo ao selecionar responsáveis',async()=>{
 const all=await marketingLung(viewer,params(['a1','a2','a3']),fixture());
 const selected=await marketingLung(viewer,params(['a1','a2','a3'],['p1','p3']),fixture());
 assert.deepEqual(selected.accounts,all.accounts);
 for(const key of ['availableBalance','dailyMetaSpend','globalPeriodContributions','flyimobPosition'] as const)assert.equal(selected.totals[0][key],all.totals[0][key]);
 assert.deepEqual(selected.table.map(r=>r.id).sort(),['p1','p3']);
 assert.equal(selected.table.reduce((sum,r)=>sum+Number(r.periodConsumption),0),48);
});
test('Todas as consultas recusam seleção parcialmente externa e operação indevida',async()=>{
 for(const query of [marketingPerformance,overview,campaignList,moneyMovementList,marketingLung]){
  await assert.rejects(()=>query(viewer,params(['a1','outside']),fixture()),/operação/);
  await assert.rejects(()=>query({...viewer,user:{...viewer.user,tenantId:'outside'}},params(),fixture()));
 }
 for(const query of [marketingPerformance,moneyMovementList,marketingLung])await assert.rejects(()=>query(viewer,params([],['p1','outside']),fixture()),/operação/);
 for(const query of [overview,campaignList])await assert.rejects(()=>query(viewer,params([],['p1','outside'],'brokerId'),fixture()),/operação/);
});
test('Campanhas combinam contas AND (responsáveis OR não atribuídas), preservando vigências',async()=>{
 const db=fixture();
 db.marketingCampaign.count=(async({where}:{where:{AND:Prisma.MarketingCampaignWhereInput[]}})=>{
  const scope=where.AND[0];assert.equal(scope.tenantId,'operation');assert.deepEqual(scope.accountId,{in:['a1','a2','a3']});
  const clauses=scope.OR as Prisma.MarketingCampaignWhereInput[];
  assert.ok(clauses[0].assignments?.none);assert.deepEqual(clauses[1].assignments?.some?.personId,{in:['p1','p3']});
  assert.equal(clauses[1].assignments?.some?.cancelledAt,null);return 0;
 }) as unknown as typeof db.marketingCampaign.count;
 await campaignList(viewer,params(['a1','a2','a3'],['p1','p3','unassigned'],'brokerId'),db);
});
test('Aportes combinam contas e beneficiários sem incluir aportes globais pelo financiador',async()=>{
 const db=fixture();
 db.marketingMoneyMovement.count=(async({where}:{where:Prisma.MarketingMoneyMovementWhereInput})=>{
  assert.equal(where.tenantId,'operation');assert.deepEqual(where.accountId,{in:['a1','a2','a3']});
  assert.deepEqual(where.OR,[{beneficiaryPersonId:{in:['p1','p2','p3']}},{beneficiaryPersonId:null,personId:{in:['p1','p2','p3']},fundingNature:{notIn:['GLOBAL','RECOMPOSE_CASH']}}]);return 0;
 }) as unknown as typeof db.marketingMoneyMovement.count;
 const result=await moneyMovementList(viewer,params(['a1','a2','a3'],['p1','p2','p3']),db);assert.equal(result.total,0);assert.deepEqual(result.items,[]);
});
