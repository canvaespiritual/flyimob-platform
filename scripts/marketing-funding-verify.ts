import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PrismaClient,Prisma} from '@prisma/client';
import {loadDocumentationEnv} from './documentacoes-env.mjs';
import {createMoneyMovement,transitionMoneyMovement,createGlobalContribution} from '../src/lib/marketing/finance.server';
import {marketingLung,moneyMovementList} from '../src/lib/marketing/finance-queries.server';
import {day,type MarketingViewer} from '../src/lib/marketing/policy';
loadDocumentationEnv();
const schema=`marketing_funding_qa_${randomBytes(8).toString('hex')}`;
const url=new URL(process.env.DATABASE_URL!);url.searchParams.set('schema',schema);
const db=new PrismaClient({datasources:{db:{url:url.toString()}},log:[]});
let phase='setup';let checks=0;const rollback=new Error('EXPECTED_ISOLATED_ROLLBACK');
async function apply(tx:Prisma.TransactionClient,path:string){
 const sql=readFileSync(path,'utf8').replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,'');
 const blocks=sql.split('$$');let pending='';
 for(let i=0;i<blocks.length;i++){
  if(i%2){pending+='$$'+blocks[i]+'$$';continue;}
  const parts=blocks[i].split(';');for(let j=0;j<parts.length;j++){pending+=parts[j];if(j<parts.length-1){if(pending.trim())await tx.$executeRawUnsafe(pending);pending='';}}
 }
 if(pending.trim())await tx.$executeRawUnsafe(pending);
}
async function history(){
 const rows=await db.$queryRawUnsafe('SELECT * FROM public."MarketingMoneyMovement" ORDER BY id');
 return createHash('sha256').update(JSON.stringify(rows,(_,v)=>typeof v==='bigint'?v.toString():v)).digest('hex');
}
async function main(){
 const before=await history();
 try{await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}",public`);
  for(const table of ['Tenant','User','OperationPerson','MetaAdAccount','MarketingAuditEvent','MarketingCampaign','CampaignBrokerAssignment','MarketingDailyMetric','MarketingCostRule','MarketingSyncRun'])await tx.$executeRawUnsafe(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
  // Unrelated copied CHECKs/partial indexes embed public enum constants. Financial guards below
  // are installed from the real migrations; remove only these empty-clone dependencies.
  const copiedChecks=await tx.$queryRawUnsafe<{table:string;name:string}[]>(`SELECT c.relname AS "table",k.conname AS name FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND k.contype='c'`,schema);
  for(const check of copiedChecks)await tx.$executeRawUnsafe(`ALTER TABLE "${schema}"."${check.table}" DROP CONSTRAINT "${check.name}"`);
  const copiedPartialIndexes=await tx.$queryRawUnsafe<{name:string}[]>(`SELECT c.relname AS name FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND i.indpred IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conindid=i.indexrelid)`,schema);
  for(const index of copiedPartialIndexes)await tx.$executeRawUnsafe(`DROP INDEX "${schema}"."${index.name}"`);
  // Prisma qualifies enum casts using its datasource schema. Give the empty clones local enum types.
  const enumColumns=await tx.$queryRawUnsafe<{table:string;column:string;type:string;default:string|null;labels:string[]}[]>(`SELECT c.relname AS "table",a.attname AS "column",t.typname AS type,pg_get_expr(d.adbin,d.adrelid) AS "default",ARRAY(SELECT e.enumlabel FROM pg_enum e WHERE e.enumtypid=t.oid ORDER BY e.enumsortorder) AS labels FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped JOIN pg_type t ON t.oid=a.atttypid LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname=$1 AND c.relkind='r' AND t.typtype='e'`,schema);
  for(const type of new Set(enumColumns.map(c=>c.type))){const labels=enumColumns.find(c=>c.type===type)!.labels;await tx.$executeRawUnsafe(`CREATE TYPE "${schema}"."${type}" AS ENUM (${labels.map(l=>"'"+l.replaceAll("'","''")+"'").join(',')})`);}
  for(const column of enumColumns){const table=`"${schema}"."${column.table}"`,name=`"${column.column}"`;await tx.$executeRawUnsafe(`ALTER TABLE ${table} ALTER COLUMN ${name} DROP DEFAULT`);await tx.$executeRawUnsafe(`ALTER TABLE ${table} ALTER COLUMN ${name} TYPE "${schema}"."${column.type}" USING ${name}::text::"${schema}"."${column.type}"`);if(column.default)await tx.$executeRawUnsafe(`ALTER TABLE ${table} ALTER COLUMN ${name} SET DEFAULT ${column.default.replaceAll('public.','')}`);}
  await apply(tx,'prisma/migrations/20261005160000_marketing_finance/migration.sql');
  await tx.$executeRawUnsafe(`CREATE TRIGGER audit_preserve BEFORE UPDATE OR DELETE ON "MarketingAuditEvent" FOR EACH ROW EXECUTE FUNCTION public.marketing_audit_immutable()`);
  const tenant=await tx.tenant.create({data:{name:'Synthetic funding QA',slug:schema}});
  const owner=await tx.user.create({data:{tenantId:tenant.id,name:'Synthetic owner',email:`${schema}@example.test`,role:'OWNER'}});
  const sandra=await tx.operationPerson.create({data:{tenantId:tenant.id,name:'Synthetic Sandra',operationalRole:'BROKER'}});
  const laura=await tx.operationPerson.create({data:{tenantId:tenant.id,name:'Synthetic Laura',operationalRole:'BROKER'}});
  const foreignTenant=await tx.tenant.create({data:{name:'Synthetic foreign',slug:schema+'-foreign'}});
  const foreign=await tx.operationPerson.create({data:{tenantId:foreignTenant.id,name:'Foreign',operationalRole:'DIRECTOR'}});
  const account=await tx.metaAdAccount.create({data:{tenantId:tenant.id,name:'Synthetic Goiás',externalId:'synthetic',currency:'BRL',timezone:'America/Sao_Paulo'}});
  const viewer:MarketingViewer={user:{id:owner.id,tenantId:tenant.id,role:'OWNER'},tenant:{id:tenant.id,isPlatform:false}};
  const adapter=Object.assign(Object.create(tx),{$transaction:async<T>(fn:(client:Prisma.TransactionClient)=>Promise<T>)=>fn(tx)}) as typeof db;
  // Before the new migration, insert a historical own contribution using the original shape.
  await tx.$executeRawUnsafe(`INSERT INTO "MarketingMoneyMovement" (id,"tenantId","accountId","personId",kind,origin,status,"effectiveDate",amount,currency,"idempotencyKey","createdById","updatedAt") VALUES ('legacy',$1,$2,$3,'CONTRIBUTION','PERSON','CONFIRMED','2026-05-11',1204.65,'BRL','legacy',$4,now())`,tenant.id,account.id,laura.id,owner.id);
  const audit=async(entityId:string,eventType='MARKETING_MONEY_CREATED',metadata:Prisma.InputJsonObject={after:{synthetic:true}})=>tx.marketingAuditEvent.create({data:{tenantId:tenant.id,actorId:owner.id,entityId,eventType,metadata}});
  await audit('legacy');await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
  const legacyBefore=await tx.$queryRawUnsafe<Record<string,unknown>[]>('SELECT * FROM "MarketingMoneyMovement" WHERE id=\'legacy\'');
  await apply(tx,'prisma/migrations/20261008120000_marketing_funding_beneficiary/migration.sql');checks++;
  await apply(tx,'prisma/migrations/20261008160000_marketing_global_allocations/migration.sql');checks++;
  await tx.$executeRawUnsafe('SET CONSTRAINTS ALL DEFERRED');
  const legacy=await tx.marketingMoneyMovement.findUniqueOrThrow({where:{id:'legacy'}});
  for(const [key,value] of Object.entries(legacyBefore[0]))assert.deepEqual(JSON.parse(JSON.stringify(legacy[key as keyof typeof legacy])),JSON.parse(JSON.stringify(value)));
  assert.equal(legacy.beneficiaryPersonId,null);assert.equal(legacy.fundingNature,'STANDARD');checks++;
  const original={accountId:account.id,personId:laura.id,origin:'PERSON',kind:'CONTRIBUTION',status:'CONFIRMED',effectiveDate:'2026-05-11',currency:'BRL',amount:'1204.65',idempotencyKey:'legacy'};
  assert.equal((await createMoneyMovement(viewer,original,adapter)).id,'legacy');assert.equal(await tx.marketingMoneyMovement.count(),1);checks++;
  const values={...original,origin:'FLYIMOB',personId:null,beneficiaryPersonId:sandra.id,fundingNature:'RECOVERABLE',amount:'279.32',idempotencyKey:'funding'};
  const parent=await createMoneyMovement(viewer,values,adapter);assert.deepEqual(await createMoneyMovement(viewer,values,adapter),parent);checks++;
  const report=()=>marketingLung(viewer,new URLSearchParams('period=custom&from=2026-05-11&to=2026-05-11'),adapter,new Date('2026-10-08T12:00:00Z'));
  let r=await report();assert.equal(r.table.find(p=>p.id===sandra.id)?.outstandingDebt,'279.32');assert.equal(r.table.find(p=>p.id===sandra.id)?.contributions,'0.00');assert.equal(r.totals[0].periodContributions,'1483.97');assert.equal(r.totals[0].flyimobReceivable,'279.32');assert.equal(r.totals[0].flyimobPotentialExposure,'279.32');checks++;
  const lauraOnly=await marketingLung(viewer,new URLSearchParams({period:'custom',from:'2026-05-11',to:'2026-05-11',personId:laura.id}),adapter);
  assert.equal(lauraOnly.totals[0].flyimobReceivable,'0.00');assert.equal(lauraOnly.totals[0].flyimobPotentialExposure,'0.00');assert.equal(lauraOnly.totals[0].periodContributions,'1204.65');checks++;
  const campaign=await tx.marketingCampaign.create({data:{tenantId:tenant.id,accountId:account.id,name:'Synthetic assigned',externalId:'synthetic'}});
  await tx.campaignBrokerAssignment.create({data:{tenantId:tenant.id,campaignId:campaign.id,personId:sandra.id,validFrom:day('2026-01-01'),createdById:owner.id}});
  await tx.marketingDailyMetric.create({data:{tenantId:tenant.id,campaignId:campaign.id,date:day('2026-05-11'),currency:'BRL',state:'CONFIRMED',metaSpend:'279.32',effectiveSpend:'279.32',leads:1}});
  await assert.rejects(createMoneyMovement(viewer,{...original,personId:sandra.id,beneficiaryPersonId:sandra.id,origin:'PERSON',kind:'ADJUSTMENT',amount:'100',fundingNature:'SETTLEMENT_META',fundingMovementId:parent.id,adjustmentType:'COMPENSATION',affectsPhysicalBalance:false,reason:'Synthetic',idempotencyKey:'insufficient'},adapter));checks++;
  await createMoneyMovement(viewer,{...original,personId:sandra.id,amount:'100',idempotencyKey:'own'},adapter);
  const recovery={...values,origin:'PERSON',personId:sandra.id,beneficiaryPersonId:sandra.id,kind:'ADJUSTMENT',fundingNature:'SETTLEMENT_META',fundingMovementId:parent.id,adjustmentType:'COMPENSATION',affectsPhysicalBalance:false,reason:'Synthetic compensation',amount:'100',idempotencyKey:'recovery'};
  const recovered=await createMoneyMovement(viewer,recovery,adapter);checks++;
  r=await report();assert.equal(r.table.find(p=>p.id===sandra.id)?.outstandingDebt,'179.32');assert.equal(r.table.find(p=>p.id===sandra.id)?.mediaPosition,'0.00');assert.equal(r.table.find(p=>p.id==='FLYIMOB')?.mediaPosition,'100.00');assert.equal(r.totals[0].operationalCredit,'179.32');assert.equal(r.totals[0].flyimobPotentialExposure,'179.32');checks++;
  const external=await createMoneyMovement(viewer,{...recovery,amount:'50',fundingNature:'SETTLEMENT_EXTERNAL',idempotencyKey:'external'},adapter);checks++;
  await tx.operationPerson.update({where:{id:sandra.id},data:{active:false,operationalRole:'DIRECTOR'}});
  const pending=await createMoneyMovement(viewer,{...recovery,amount:'129.32',fundingNature:'SETTLEMENT_EXTERNAL',status:'PENDING',idempotencyKey:'pending'},adapter);
  await assert.rejects(createMoneyMovement(viewer,{...recovery,amount:'0.01',fundingNature:'SETTLEMENT_EXTERNAL',idempotencyKey:'excess'},adapter));checks++;
  await transitionMoneyMovement(viewer,pending.id,{version:0,status:'CONFIRMED',reason:'Synthetic recovery confirmed'},adapter);checks++;
  r=await report();assert.equal(r.table.find(p=>p.id===sandra.id)?.outstandingDebt,'0.00');assert.equal(r.totals[0].flyimobReceivable,'0.00');assert.equal(r.totals[0].flyimobRecoveredExternal,'179.32');assert.equal(r.table.find(p=>p.id===laura.id)?.position,'1204.65');checks++;
  const movements=await tx.marketingMoneyMovement.findMany({where:{tenantId:tenant.id,status:'CONFIRMED'}});assert.equal(movements.filter(m=>m.affectsPhysicalBalance).reduce((s,m)=>s.plus(m.amount),new Prisma.Decimal(0)).toFixed(2),'1583.97');checks++;
  await assert.rejects(transitionMoneyMovement(viewer,parent.id,{version:0,status:'CANCELLED',reason:'Synthetic'},adapter));checks++;
  const listing=await moneyMovementList(viewer,new URLSearchParams(`period=custom&from=2026-05-11&to=2026-05-11&personId=${sandra.id}&origin=FLYIMOB`),adapter);assert.equal(listing.total,1);assert.equal(listing.items[0].beneficiary?.id,sandra.id);assert.equal(listing.items[0].outstandingPrincipal,'0.00');checks++;
  let serial=0;
  await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
  const reject=async(fn:()=>Promise<unknown>,message?:RegExp)=>{const name=`reject_${++serial}`;await tx.$executeRawUnsafe(`SAVEPOINT ${name}`);if(message)await assert.rejects(fn,message);else await assert.rejects(fn);await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${name}`);await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`);checks++;};
  await reject(()=>tx.marketingMoneyMovement.update({where:{id:parent.id},data:{beneficiaryPersonId:laura.id}}));
  const insert=(id:string,beneficiary=sandra.id,parentId=parent.id,amount='1',currency='BRL',at='2026-05-11')=>tx.marketingMoneyMovement.create({data:{id,tenantId:tenant.id,accountId:account.id,personId:beneficiary,beneficiaryPersonId:beneficiary,kind:'ADJUSTMENT',origin:'PERSON',fundingNature:'SETTLEMENT_EXTERNAL',fundingMovementId:parentId,adjustmentType:'COMPENSATION',affectsPhysicalBalance:false,status:'CONFIRMED',amount,currency,effectiveDate:day(at),reason:'Synthetic',idempotencyKey:id,createdById:owner.id}});
  for(const id of ['foreign','over-principal','wrong-currency','before-parent','wrong-beneficiary'])await audit(id);
  await audit('foreign-beneficiary');
  await reject(()=>tx.marketingMoneyMovement.create({data:{id:'foreign-beneficiary',tenantId:tenant.id,accountId:account.id,personId:null,beneficiaryPersonId:foreign.id,fundingNature:'RECOVERABLE',kind:'CONTRIBUTION',origin:'FLYIMOB',status:'CONFIRMED',effectiveDate:day('2026-05-11'),amount:'1',currency:'BRL',idempotencyKey:'foreign-beneficiary',createdById:owner.id}}),/[Ff]oreign key/);
  await reject(()=>insert('foreign',foreign.id),/[Ff]oreign key|Settlement requires confirmed matching historical funding/);
  await reject(()=>insert('over-principal'),/Funding recovery exceeds original principal/);
  await reject(()=>insert('wrong-currency',sandra.id,parent.id,'1','USD'),/Account currency mismatch/);
  await reject(()=>insert('before-parent',sandra.id,parent.id,'1','BRL','2026-05-10'),/Settlement requires confirmed matching historical funding/);
  await reject(()=>insert('wrong-beneficiary',laura.id),/Settlement requires confirmed matching historical funding/);
  await audit(parent.id,'MARKETING_MONEY_STATUS_CHANGED',{before:{status:'CONFIRMED',version:0},after:{status:'CANCELLED',version:1,reason:'Synthetic'}});
  await reject(()=>tx.marketingMoneyMovement.update({where:{id:parent.id},data:{status:'CANCELLED',version:1}}),/Settlement requires confirmed matching historical funding/);
  await transitionMoneyMovement(viewer,recovered.id,{version:0,status:'CANCELLED',reason:'Synthetic duplicate correction'},adapter);checks++;
  r=await report();assert.equal(r.table.find(p=>p.id===sandra.id)?.outstandingDebt,'100.00');assert.equal(r.totals[0].flyimobReceivable,'100.00');checks++;
  assert.equal((await tx.marketingMoneyMovement.findUniqueOrThrow({where:{id:external.id}})).status,'CONFIRMED');
  await tx.$executeRawUnsafe('SET CONSTRAINTS ALL DEFERRED');
  await createMoneyMovement(viewer,{...original,kind:'ADJUSTMENT',amount:'-5',adjustmentType:'CORRECTION',affectsPhysicalBalance:false,reason:'Synthetic standard adjustment',idempotencyKey:'negative'},adapter);checks++;
  await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');checks++;
  await tx.$executeRawUnsafe('SET CONSTRAINTS ALL DEFERRED');
  phase='global-cases';
  const globalAccount=await tx.metaAdAccount.create({data:{tenantId:tenant.id,name:'Synthetic global account',externalId:'synthetic-global',currency:'BRL',timezone:'America/Sao_Paulo'}});
  const gilberto=await tx.operationPerson.create({data:{tenantId:tenant.id,name:'Synthetic Gilberto',operationalRole:'MANAGER'}});
  const globalValues={...original,accountId:globalAccount.id,personId:null,origin:'FLYIMOB',fundingNature:'GLOBAL',amount:'2000',idempotencyKey:'global'};
  const distributions=[{beneficiaryPersonId:gilberto.id,fundingNature:'ALLOCATION_LOAN',amount:'500',reason:'Synthetic loan'},{beneficiaryPersonId:laura.id,fundingNature:'ALLOCATION_BONUS',amount:'300',reason:'Synthetic grant'},{beneficiaryPersonId:null,fundingNature:'ALLOCATION',amount:'700',reason:'Synthetic institutional reserve'}];
  const global=await createGlobalContribution(viewer,{movement:globalValues,distributions},adapter);checks++;
  assert.deepEqual(await createGlobalContribution(viewer,{movement:globalValues,distributions},adapter),global);checks++;
  const globalReport=()=>marketingLung(viewer,new URLSearchParams({period:'custom',from:'2026-05-11',to:'2026-05-11',accountId:globalAccount.id}),adapter);
  let g=await globalReport();assert.equal(g.accounts[0].economic.balanced,true);assert.equal(g.accounts[0].economic.contributions,'2000.00');assert.equal(g.table.find(r=>r.id===gilberto.id)?.outstandingDebt,'500.00');assert.equal(g.table.find(r=>r.id===laura.id)?.bonuses,'300.00');checks++;
  const globalList=await moneyMovementList(viewer,new URLSearchParams({period:'custom',from:'2026-05-11',to:'2026-05-11',accountId:globalAccount.id}),adapter);assert.equal(globalList.items.find(r=>r.id===global.id)?.availableToDistribute,'500.00');checks++;
  const allocated={...globalValues,kind:'ADJUSTMENT',adjustmentType:'COMPENSATION',affectsPhysicalBalance:false,beneficiaryPersonId:laura.id,fundingNature:'ALLOCATION_BONUS',amount:'500',distributionMovementId:global.id,reason:'Synthetic later grant',idempotencyKey:'later-allocation'};
  await createMoneyMovement(viewer,allocated,adapter);checks++;
  await assert.rejects(createMoneyMovement(viewer,{...allocated,amount:'0.01',idempotencyKey:'too-much-distribution'},adapter),/excedem/);checks++;
  await assert.rejects(transitionMoneyMovement(viewer,global.id,{version:0,status:'CANCELLED',reason:'Synthetic'},adapter),/distribuições/);checks++;
  const linked={...recovery,accountId:globalAccount.id,personId:gilberto.id,beneficiaryPersonId:gilberto.id,fundingMovementId:global.distributionIds[0],fundingNature:'SETTLEMENT_EXTERNAL',recoveryMethod:'COMMISSION',externalReference:'financeiro:synthetic-existing-commission',amount:'300',idempotencyKey:'historical-commission'};
  await createMoneyMovement(viewer,linked,adapter);checks++;
  await createMoneyMovement(viewer,{...linked,recoveryMethod:null,externalReference:null,fundingNature:'SETTLEMENT_BONUS',amount:'100',idempotencyKey:'post-bonus'},adapter);checks++;
  await createMoneyMovement(viewer,{...linked,recoveryMethod:null,externalReference:null,fundingNature:'SETTLEMENT_LOSS',amount:'100',idempotencyKey:'loss'},adapter);checks++;
  g=await globalReport();assert.equal(g.table.find(r=>r.id===gilberto.id)?.outstandingDebt,'0.00');assert.equal(g.accounts[0].economic.receivable,'0.00');assert.equal(g.accounts[0].economic.recoveredExternal,'300.00');assert.equal(g.accounts[0].economic.forgiven,'100.00');assert.equal(g.accounts[0].economic.losses,'100.00');assert.equal(g.accounts[0].economic.balanced,true);checks++;
  await assert.rejects(createMoneyMovement(viewer,{...linked,amount:'0.01',idempotencyKey:'over-recovered'},adapter),/excedem/);checks++;
  phase='cross-consumption';
  const crossAccount=await tx.metaAdAccount.create({data:{tenantId:tenant.id,name:'Synthetic crossed account',externalId:'synthetic-crossed',currency:'BRL',timezone:'America/Sao_Paulo'}});
  const crossCampaign=await tx.marketingCampaign.create({data:{tenantId:tenant.id,accountId:crossAccount.id,name:'Synthetic Gilberto spend',externalId:'synthetic-cross-spend'}});
  await tx.campaignBrokerAssignment.create({data:{tenantId:tenant.id,campaignId:crossCampaign.id,personId:gilberto.id,validFrom:day('2026-01-01'),createdById:owner.id}});
  await tx.marketingDailyMetric.create({data:{tenantId:tenant.id,campaignId:crossCampaign.id,date:day('2026-05-11'),currency:'BRL',state:'CONFIRMED',metaSpend:'500',effectiveSpend:'500',leads:0}});
  await createMoneyMovement(viewer,{...original,accountId:crossAccount.id,amount:'500',idempotencyKey:'laura-crossed'},adapter);checks++;
  const crossReport=()=>marketingLung(viewer,new URLSearchParams({period:'custom',from:'2026-05-11',to:'2026-05-11',accountId:crossAccount.id}),adapter);
  let cross=await crossReport();assert.equal(cross.table.find(r=>r.id===laura.id)?.mediaPosition,'500.00');assert.equal(cross.table.find(r=>r.id===gilberto.id)?.unfundedCredit,'500.00');assert.equal(cross.totals[0].flyimobReceivable,'0.00');checks++;
  const physicalOnly=await createGlobalContribution(viewer,{movement:{...globalValues,accountId:crossAccount.id,amount:'500',fundingNature:'RECOMPOSE_CASH',externalReference:`campaign:${crossCampaign.id}`,idempotencyKey:'physical-only'},distributions:[]},adapter);checks++;
  cross=await crossReport();assert.equal(cross.accounts[0].economic.pendingPhysicalRecomposition,'500.00');assert.equal(cross.table.find(r=>r.id===laura.id)?.mediaPosition,'500.00');assert.equal(cross.table.find(r=>r.id===gilberto.id)?.outstandingDebt,'0.00');checks++;
  const assume={...allocated,accountId:crossAccount.id,distributionMovementId:physicalOnly.id,beneficiaryPersonId:gilberto.id,fundingNature:'RECOMPOSE_LOAN',externalReference:`campaign:${crossCampaign.id}`,amount:'500',idempotencyKey:'assumed-crossed'};
  await createMoneyMovement(viewer,assume,adapter);checks++;
  cross=await crossReport();assert.equal(cross.accounts[0].economic.pendingPhysicalRecomposition,'0.00');assert.equal(cross.table.find(r=>r.id===laura.id)?.mediaPosition,'500.00');assert.equal(cross.table.find(r=>r.id===gilberto.id)?.mediaPosition,'0.00');assert.equal(cross.table.find(r=>r.id===gilberto.id)?.outstandingDebt,'500.00');assert.equal(cross.accounts[0].economic.balanced,true);checks++;
  await assert.rejects(createMoneyMovement(viewer,{...assume,amount:'0.01',idempotencyKey:'duplicate-crossed'},adapter));checks++;
  await assert.rejects(createMoneyMovement(viewer,{...assume,distributionMovementId:global.id,idempotencyKey:'foreign-account'},adapter));checks++;
  phase='global-constraint-flush';
  await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');checks++;
  phase='raw-distribution-guards';
  // Raw SQL bypasses API: database guards still reserve pending distributions and reject excess.
  await audit('sql-distribution-excess');
  await reject(()=>tx.marketingMoneyMovement.create({data:{...allocated,id:'sql-distribution-excess',tenantId:tenant.id,accountId:globalAccount.id,effectiveDate:day('2026-05-11'),amount:'0.01',idempotencyKey:'sql-distribution-excess',createdById:owner.id}}),/Distributions exceed physical contribution/);
  await audit('sql-distribution-foreign');
  await reject(()=>tx.marketingMoneyMovement.create({data:{...allocated,id:'sql-distribution-foreign',tenantId:tenant.id,accountId:crossAccount.id,effectiveDate:day('2026-05-11'),amount:'0.01',idempotencyKey:'sql-distribution-foreign',createdById:owner.id}}),/Distribution requires confirmed matching/);
  // Historical amounts and payload remain untouched even after all second-round cases.
  assert.equal((await tx.marketingMoneyMovement.findUniqueOrThrow({where:{id:'legacy'}})).amount.toFixed(2),'1204.65');checks++;
  throw rollback;
 },{timeout:300000,maxWait:10000});}catch(error){if(error!==rollback)throw error;}
 const remaining=await db.$queryRaw<{count:bigint}[]>`SELECT count(*)::bigint AS count FROM information_schema.schemata WHERE schema_name=${schema}`;
 assert.equal(remaining[0].count,0n);checks++;assert.equal(await history(),before);checks++;
 console.log(JSON.stringify({checks,isolatedSchemaRolledBack:true,realMoneyHistoryUnchanged:true,productionMigrationApplied:false,externalCalls:0,realTestMovementsCreated:0}));
}
main().catch(e=>{console.error('Isolated funding verification failed',phase,e.code??e.name,String(e.meta?.message??e.message).slice(-1200));process.exitCode=1;}).finally(()=>db.$disconnect());
