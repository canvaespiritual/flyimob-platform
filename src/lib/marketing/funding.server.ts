import { Prisma } from "@prisma/client";
import { MarketingError } from "./policy";
import { economicLedger, resolveOperationalIdentity } from "./finance-calculations";
import { applyCostCorrections, costCorrectionEvent } from "./cost-corrections.server";

import { isFundingAllocation, isFundingSettlement } from "./funding-policy";

/** Reuse the economic ledger and historical cost overlay; pending recoveries reserve credit. */
export async function creditAt(tx:Prisma.TransactionClient,tenantId:string,accountId:string,personId:string,currency:string,effectiveDate:Date,_amount:Prisma.Decimal,excludeId?:string,reserveCoverage=false,permittedCashParent?:string){
 const [movements,metrics,people,events]=await Promise.all([
  tx.marketingMoneyMovement.findMany({where:{tenantId,accountId,status:{not:'CANCELLED'},effectiveDate:{lte:effectiveDate},...(excludeId?{id:{not:excludeId}}:{})}}),
  tx.marketingDailyMetric.findMany({where:{tenantId,date:{lte:effectiveDate},campaign:{tenantId,accountId}},select:{date:true,currency:true,state:true,metaSpend:true,effectiveSpend:true,leads:true,campaign:{select:{id:true,name:true,purpose:true,assignments:{where:{tenantId,cancelledAt:null},select:{personId:true,brokerId:true,validFrom:true,validTo:true,broker:{select:{name:true,personId:true}}}}}}}}),
  tx.operationPerson.findMany({where:{tenantId},select:{id:true,mergedIntoId:true}}),
  tx.marketingAuditEvent.findMany({where:{tenantId,eventType:costCorrectionEvent},select:{metadata:true}})
 ]);
 if(metrics.some(m=>m.state!=='CONFIRMED'||m.effectiveSpend===null))throw new MarketingError(409,'Há métricas indisponíveis. Atualize os dados antes de compensar crédito na Meta.');
 const rules=events.length?await tx.marketingCostRule.findMany({where:{tenantId},select:{id:true,percentage:true,validFrom:true,validTo:true}}):[];
 const rows=applyCostCorrections(metrics.map(m=>({...m,campaign:{...m.campaign,assignments:m.campaign.assignments.map(a=>({...a,personId:a.personId??a.broker?.personId??null,broker:a.broker??{name:'Legado'}}))}})),rules,events);
 const resolve=(id:string)=>resolveOperationalIdentity(people,id);
 const reserved=movements.filter(m=>m.status==='CONFIRMED'||isFundingSettlement(m.fundingNature)||isFundingAllocation(m.fundingNature)).map(m=>({...m,status:'CONFIRMED'}));
 const position=(items:typeof reserved)=>new Prisma.Decimal(economicLedger(items,rows,new Date('0001-01-01T00:00:00Z'),effectiveDate,resolve).find(r=>r.id===resolve(personId)&&r.currency===currency)?.mediaPosition??0);
 const confirmed=position(movements.filter(m=>m.status==='CONFIRMED')),projected=position(reserved);
 // Pending credits never become available to spend; pending debits reserve availability.
 // For recomposition, pending coverage does reserve the uncovered consumption.
 const cashReserved=personId==='FLYIMOB'&&!reserveCoverage?movements.filter(m=>m.status==='CONFIRMED'&&m.fundingNature==='RECOMPOSE_CASH'&&m.id!==permittedCashParent).reduce((sum,parent)=>sum.plus(Prisma.Decimal.max(parent.amount.minus(reserved.filter(m=>m.distributionMovementId===parent.id).reduce((s,m)=>s.plus(m.amount),new Prisma.Decimal(0))),0)),new Prisma.Decimal(0)):new Prisma.Decimal(0);
 return (reserveCoverage?Prisma.Decimal.max(confirmed,projected):Prisma.Decimal.min(confirmed,projected)).minus(cashReserved);
}

export async function assertMetaSettlementCapacity(tx:Prisma.TransactionClient,tenantId:string,accountId:string,personId:string,currency:string,effectiveDate:Date,amount:Prisma.Decimal,excludeId?:string){
 if((await creditAt(tx,tenantId,accountId,personId,currency,effectiveDate,amount,excludeId)).lt(amount))throw new MarketingError(409,'Crédito econômico disponível para mídia insuficiente nesta conta/data. Registre o aporte próprio antes da compensação ou escolha recuperação fora da Meta.');
}

/** Structured campaign reference plus actual effective spend; a free-text note cannot assume a creditor. */
export async function assertConsumptionReference(tx:Prisma.TransactionClient,tenantId:string,accountId:string,currency:string,date:Date,reference:string,beneficiary:string|null,amount:Prisma.Decimal){
 const match=/^campaign:([^\s:]+)$/.exec(reference);
 if(!match)throw new MarketingError(400,'Informe a referência do consumo no formato campaign:ID da campanha.');
 const metrics=await tx.marketingDailyMetric.findMany({where:{tenantId,currency,date:{lte:date},campaign:{tenantId,accountId,id:match[1]}},select:{date:true,currency:true,state:true,metaSpend:true,leads:true,effectiveSpend:true,campaign:{select:{id:true,name:true,purpose:true,assignments:{where:{tenantId,cancelledAt:null},select:{personId:true,brokerId:true,broker:{select:{personId:true,name:true}},validFrom:true,validTo:true}}}}}});
 const people=await tx.operationPerson.findMany({where:{tenantId},select:{id:true,mergedIntoId:true}});
 const target=beneficiary?resolveOperationalIdentity(people,beneficiary):null;
 const events=await tx.marketingAuditEvent.findMany({where:{tenantId,eventType:costCorrectionEvent},select:{metadata:true}});
 const rules=events.length?await tx.marketingCostRule.findMany({where:{tenantId},select:{id:true,percentage:true,validFrom:true,validTo:true}}):[];
 const corrected=applyCostCorrections(metrics.map(m=>({...m,campaign:{...m.campaign,assignments:m.campaign.assignments.map(a=>({...a,personId:a.personId??a.broker?.personId??null,broker:a.broker??{name:'Legado'}}))}})),rules,events);
 const total=corrected.filter(m=>m.state==='CONFIRMED'&&m.effectiveSpend!==null&&(!target||m.campaign.assignments.some(a=>a.validFrom<=m.date&&(!a.validTo||m.date<a.validTo)&&resolveOperationalIdentity(people,a.personId??'UNASSIGNED')===target))).reduce((sum,m)=>sum.plus(m.effectiveSpend??0),new Prisma.Decimal(0));
 if(total.lt(amount))throw new MarketingError(409,'Referência não cobre esse consumo efetivo, responsável, conta ou data. Importe e concilie o histórico antes de recompor.');
}
