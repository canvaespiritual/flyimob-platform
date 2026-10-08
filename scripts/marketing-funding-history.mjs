import {PrismaClient} from '@prisma/client';
import {createHash} from 'node:crypto';
async function main(){
 const {loadDocumentationEnv}=await import('./documentacoes-env.mjs');loadDocumentationEnv();
 const db=new PrismaClient({log:[]});
 try{await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  const rows=await tx.$queryRawUnsafe(`SELECT m.* FROM "MarketingMoneyMovement" m ORDER BY m.id`);
  const hash=createHash('sha256').update(JSON.stringify(rows,(_,v)=>typeof v==='bigint'?v.toString():v)).digest('hex');
  const laura=await tx.$queryRawUnsafe(`SELECT m.id,m.origin,m.kind,m.status,m.amount::text,m.currency,m."effectiveDate",p.id AS "personId" FROM "MarketingMoneyMovement" m JOIN "OperationPerson" p ON p.id=m."personId" AND p."tenantId"=m."tenantId" WHERE p.name ILIKE 'Laura Moura' ORDER BY m."effectiveDate",m.id`);
  console.log(JSON.stringify({count:rows.length,sha256:hash,laura},null,2));
 },{timeout:60000});}finally{await db.$disconnect();}
}
main().catch(e=>{console.error('Read-only history check failed',e.code??e.name);process.exitCode=1;});
