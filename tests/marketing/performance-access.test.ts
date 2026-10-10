import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requestContext} from '../documentacoes/request-context';
import {prisma} from '../../src/lib/prisma';
import {createSessionToken} from '../../src/lib/auth.server';
import {GET} from '../../src/app/api/marketing/performance/route';
import {marketingPerformance} from '../../src/lib/marketing/performance.server';
process.env.SESSION_SECRET='synthetic-performance-access-test-only';
const viewer={user:{id:'owner',tenantId:'operation',role:'OWNER' as const},tenant:{id:'operation',isPlatform:false}};
test('endpoint recusa anônimo e corretor/gerente antes de consultar métricas',async t=>{
 const original=prisma.user.findFirst;t.after(()=>{prisma.user.findFirst=original;});
 const request=()=>new Request('https://flyimob.test/api/marketing/performance?tenantId=other&personId=other');
 assert.equal((await requestContext(undefined,()=>GET(request()))).status,401);
 for(const role of ['BROKER','MANAGER','DATA_ENTRY'] as const){
  prisma.user.findFirst=(async()=>({id:'owner',tenantId:'operation',role,isActive:true,sessionVersion:0,tenant:viewer.tenant})) as unknown as typeof original;
  const token=createSessionToken({uid:'owner',tid:'operation',role,sv:0});
  assert.equal((await requestContext(token,()=>GET(request()))).status,403);
 }
});
test('conta externa à operação é rejeitada antes da consulta de gastos',async()=>{
 const db={$transaction:async(fn:(tx:unknown)=>unknown)=>fn({metaAdAccount:{findMany:async({where}:{where:{tenantId:string;id:{in:string[]}}})=>{assert.equal(where.tenantId,'operation');assert.deepEqual(where.id,{in:['outside']});return [];}}})} as unknown as Parameters<typeof marketingPerformance>[2];
 await assert.rejects(()=>marketingPerformance(viewer,new URLSearchParams('accountId=outside&tenantId=another'),db),/Seleção não encontrada/);
});
test('pessoa externa à operação é rejeitada antes da consulta de gastos',async()=>{
 const db={$transaction:async(fn:(tx:unknown)=>unknown)=>fn({metaAdAccount:{findMany:async()=>[]},operationPerson:{findMany:async({where}:{where:{tenantId:string}})=>{assert.equal(where.tenantId,'operation');return [];}}})} as unknown as Parameters<typeof marketingPerformance>[2];
 await assert.rejects(()=>marketingPerformance(viewer,new URLSearchParams('personId=outside&tenantId=another'),db),/Responsável não encontrado/);
});
