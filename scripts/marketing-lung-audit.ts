// Read-only investigation: never imports workers, provider clients or mutation services.
import { loadDocumentationEnv } from "./documentacoes-env.mjs";
import { PrismaClient } from "@prisma/client";
import { marketingLung } from "../src/lib/marketing/finance-queries.server";
async function main(){
loadDocumentationEnv();
const db = new PrismaClient();
try {
 await db.$transaction(async tx => {
  await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
  const people = await tx.operationPerson.findMany({where:{name:{equals:"Gustavo Prado",mode:"insensitive"}},select:{id:true,tenantId:true,name:true,operationalRole:true,active:true,mergedIntoId:true}});
  for (const person of people) {
   const tenantId=person.tenantId;
   const viewer={user:{id:"read-only-audit",tenantId,role:"OWNER" as const},tenant:{id:tenantId,isPlatform:false}};
   const scoped={...tx,$transaction:async(fn:(client:typeof tx)=>unknown)=>fn(tx)} as unknown as typeof db;
   const periods=[["2026-04-01","2026-04-20"],["2026-04-20","2026-05-05"],["2026-05-11","2026-05-11"]];
   const reports=[];
   for(const [from,to] of periods){const report=await marketingLung(viewer,new URLSearchParams({period:"custom",from,to}),scoped);reports.push({from:report.from,to:report.to,table:report.table.filter(r=>r.id===person.id || r.consumption!=="0.00" || r.position!=="0.00").map(r=>({id:r.id,name:r.name,currency:r.currency,periodConsumption:r.periodConsumption,consumption:r.consumption,position:r.position,periodContributions:r.periodContributions,contributions:r.contributions,adjustments:r.adjustments,missing:r.missing}))});}
   const metrics=await tx.marketingDailyMetric.findMany({where:{tenantId,date:{lte:new Date("2026-05-11T00:00:00Z")}},select:{id:true,campaignId:true,date:true,currency:true,state:true,metaSpend:true,effectiveSpend:true,costPercentage:true,costRuleId:true,sourceObservedAt:true,syncRunId:true,campaign:{select:{id:true,name:true,externalId:true,accountId:true,account:{select:{name:true,currency:true,timezone:true}},assignments:{select:{id:true,personId:true,brokerId:true,validFrom:true,validTo:true,cancelledAt:true,broker:{select:{personId:true}}}}}}},orderBy:{date:"asc"}});
   const rules=await tx.marketingCostRule.findMany({where:{tenantId},select:{id:true,percentage:true,validFrom:true,validTo:true}});
   const events=await tx.marketingAuditEvent.findMany({where:{tenantId,eventType:"COST_RULE_VALIDITY_CORRECTED"},select:{id:true,entityId:true,metadata:true}});
   const assignments=await tx.campaignBrokerAssignment.findMany({where:{tenantId,personId:person.id},select:{id:true,campaignId:true,validFrom:true,validTo:true,cancelledAt:true,createdAt:true}});
   const imports=await tx.marketingSyncRun.findMany({where:{tenantId,id:{in:[...new Set(metrics.map(m=>m.syncRunId).filter((id):id is string=>!!id))]}},select:{id:true,accountId:true,periodFrom:true,periodTo:true,status:true,finishedAt:true}});
   const assignmentEvents=await tx.marketingAuditEvent.findMany({where:{tenantId,entityId:{in:[...new Set(metrics.map(m=>m.campaignId))]},eventType:{contains:"ASSIGN"}},select:{id:true,eventType:true,entityId:true,createdAt:true,metadata:true}});
   console.log(JSON.stringify({person,reports,rules,events,metrics,assignments,imports,assignmentEvents},null,2));
  }
 },{isolationLevel:"RepeatableRead",timeout:120000});
} catch(error){console.error("Read-only audit failed",error instanceof Error?error.name:"unknown",(error as {code?:string}).code??"");process.exitCode=1;} finally {await db.$disconnect();}
}
void main();
