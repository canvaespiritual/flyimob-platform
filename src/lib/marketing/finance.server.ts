import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize, bodyObject, civilToday, day, MarketingError, text, type MarketingViewer } from "./policy";
import { audit, marketingTransaction } from "./admin.server";
import { canActAsSalesResponsible } from "@/lib/team/policy";
import { movementMoney, localDayBoundary } from "./finance-calculations";
import { fundingNatures, isFundingSettlement, isFundingAllocation, isRecoverableFunding, isRecomposition, recoveryMethods } from "./funding-policy";
import { assertMetaSettlementCapacity, creditAt, assertConsumptionReference } from "./funding.server";

export async function createMoneyMovement(viewer: MarketingViewer, value: unknown, db = prisma) {
  authorize(viewer, true);
  const b = bodyObject(value, ["accountId", "personId", "beneficiaryPersonId", "fundingNature", "fundingMovementId", "distributionMovementId", "externalReference", "recoveryMethod", "kind", "origin", "adjustmentType", "affectsPhysicalBalance", "status", "effectiveDate", "amount", "currency", "note", "reason", "idempotencyKey"]);
  const accountId = text(b.accountId, "Conta"), kind = text(b.kind, "Tipo"), origin = text(b.origin, "Origem"), status = text(b.status, "Status"), currency = text(b.currency, "Moeda", 3);
  if (!["CONTRIBUTION", "ADJUSTMENT"].includes(kind) || !["PERSON", "FLYIMOB", "OTHER"].includes(origin) || !["PENDING", "CONFIRMED"].includes(status)) throw new MarketingError(400, "Classificação financeira inválida.");
  const amount = movementMoney(b.amount, kind === "ADJUSTMENT"), effectiveDate = day(b.effectiveDate);
  const personId = origin === "PERSON" ? text(b.personId, "Pessoa") : null;
  if (origin !== "PERSON" && b.personId) throw new MarketingError(400, "Pessoa somente para origem Pessoa operacional.");
  const beneficiaryPersonId=b.beneficiaryPersonId?text(b.beneficiaryPersonId,'Responsável beneficiado'):kind==='CONTRIBUTION'&&!['GLOBAL','RECOMPOSE_CASH'].includes(String(b.fundingNature))?personId:null;
  const fundingNature=b.fundingNature===undefined?'STANDARD':text(b.fundingNature,'Natureza',30);
  if(!Object.hasOwn(fundingNatures,fundingNature))throw new MarketingError(400,'Natureza financeira inválida.');
  const settlement=isFundingSettlement(fundingNature),fundingMovementId=b.fundingMovementId?text(b.fundingMovementId,'Financiamento'):null;
  const allocation=isFundingAllocation(fundingNature),distributionMovementId=b.distributionMovementId?text(b.distributionMovementId,'Entrada física'):null;
  const externalReference=b.externalReference?text(b.externalReference,'Referência do fato / acerto',200):null,recoveryMethod=b.recoveryMethod?text(b.recoveryMethod,'Forma de recuperação',30):null;
  if(recoveryMethod&&(!Object.hasOwn(recoveryMethods,recoveryMethod)||fundingNature!=='SETTLEMENT_EXTERNAL'||!externalReference))throw new MarketingError(400,'Forma de recuperação exige recebimento externo e referência.');
  if(fundingNature==='RECOMPOSE_CASH'&&(!externalReference||origin!=='FLYIMOB'))throw new MarketingError(400,'Recomposição física exige origem Flyimob e referência do consumo pendente.');
  if(['GLOBAL','RECOMPOSE_CASH'].includes(fundingNature)&&(kind!=='CONTRIBUTION'||beneficiaryPersonId))throw new MarketingError(400,'Aporte global não define beneficiário no depósito. Use distribuições vinculadas.');
  if(fundingNature==='BONUS'&&(kind!=='CONTRIBUTION'||origin!=='FLYIMOB'||!beneficiaryPersonId))throw new MarketingError(400,'Bonificação antecipada exige origem Flyimob e beneficiário.');
  if(allocation!==!!distributionMovementId||distributionMovementId&&settlement)throw new MarketingError(400,'Distribuição exige vínculo exclusivo com a entrada física.');
  if(fundingNature==='RECOVERABLE'&&(kind!=='CONTRIBUTION'||origin!=='FLYIMOB'||!beneficiaryPersonId)||!settlement&&fundingMovementId)throw new MarketingError(400,'Financiamento recuperável exige aporte Flyimob e beneficiário.');
  if(kind==='ADJUSTMENT'&&!settlement&&!allocation&&beneficiaryPersonId&&beneficiaryPersonId!==personId)throw new MarketingError(400,'Ajuste comum não transfere crédito entre pessoas.');
  const adjustmentType = kind === "ADJUSTMENT" ? text(b.adjustmentType, "Tipo de ajuste", 30) : null;
  if (adjustmentType && !["REFUND", "PROMOTIONAL_CREDIT", "CORRECTION", "COMPENSATION", "OTHER"].includes(adjustmentType)) throw new MarketingError(400, "Tipo de ajuste inválido.");
  const affectsPhysicalBalance = kind === "CONTRIBUTION" ? true : b.affectsPhysicalBalance;
  if (typeof affectsPhysicalBalance !== "boolean") throw new MarketingError(400, "Informe se o ajuste altera o caixa físico Meta.");
  const reason = kind === "ADJUSTMENT" ? text(b.reason, "Motivo", 1000) : null;
  if(settlement&&(kind!=='ADJUSTMENT'||origin!=='PERSON'||adjustmentType!=='COMPENSATION'||affectsPhysicalBalance!==false||!amount.gt(0)||!fundingMovementId||!beneficiaryPersonId||beneficiaryPersonId!==personId))throw new MarketingError(400,'Liquidação exige ajuste de compensação positivo, sem alterar caixa Meta, vinculado ao financiamento e beneficiário.');
  if(allocation&&(kind!=='ADJUSTMENT'||adjustmentType!=='COMPENSATION'||affectsPhysicalBalance!==false||!amount.gt(0)||!reason||fundingNature!=='ALLOCATION'&&(origin!=='FLYIMOB'||!beneficiaryPersonId)||isRecomposition(fundingNature)&&!externalReference))throw new MarketingError(400,'Distribuição econômica inválida. Recomposição exige referência ao consumo existente.');
  const note = b.note ? text(b.note, "Observação", 1000) : null, idempotencyKey = text(b.idempotencyKey, "Chave", 80);
  const payload = { accountId, personId, beneficiaryPersonId, fundingNature, fundingMovementId, distributionMovementId, externalReference, recoveryMethod, kind, origin, adjustmentType, affectsPhysicalBalance, status, effectiveDate, amount, currency, note, reason };
  return moneyTransaction(db, async tx => {
    const tenantId = viewer.tenant.id;
    const existing = await tx.marketingMoneyMovement.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } } });
    if (existing) {
      if (existing.createdById !== viewer.user.id || Object.entries(payload).some(([k,v]) => {
        const historical=k==='fundingNature'?(existing.fundingNature??'STANDARD'):k==='beneficiaryPersonId'?(existing.beneficiaryPersonId??(existing.kind==='CONTRIBUTION'&&existing.origin==='PERSON'?existing.personId:null)):existing[k as keyof typeof existing];
        return String(historical??'')!==String(v??'');
      })) throw new MarketingError(409, "Chave já usada para outro movimento.");
      return { id: existing.id };
    }
    const account = await tx.metaAdAccount.findFirst({ where: { tenantId, id: accountId }, select: { currency: true, timezone: true } });
    if (!account || account.currency !== currency) throw new MarketingError(400, "Conta ou moeda inválida nesta operação.");
    const minorUnits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
    if (minorUnits > 2 || amount.decimalPlaces() > minorUnits) throw new MarketingError(400, "Precisão monetária incompatível com a moeda da conta.");
    if (effectiveDate > day(civilToday(account.timezone))) throw new MarketingError(400, "A data efetiva não pode estar no futuro.");
    if(fundingNature==='RECOMPOSE_CASH'||isRecomposition(fundingNature))await assertConsumptionReference(tx,tenantId,accountId,currency,effectiveDate,externalReference!,beneficiaryPersonId,amount);
    if(settlement){
      await assertFundingRecovery(tx,tenantId,{fundingMovementId:fundingMovementId!,beneficiaryPersonId:beneficiaryPersonId!,accountId,currency,effectiveDate,amount});
      if(fundingNature==='SETTLEMENT_META')await assertMetaSettlementCapacity(tx,tenantId,accountId,beneficiaryPersonId!,currency,effectiveDate,amount);
    }else {
      if(allocation)await assertDistribution(tx,tenantId,{...payload,distributionMovementId:distributionMovementId!});
      for(const id of new Set([personId,beneficiaryPersonId].filter((id):id is string=>!!id))){const person=await tx.operationPerson.findFirst({where:{tenantId,id}});if(!person||!canActAsSalesResponsible(person))throw new MarketingError(400,'Pessoa inválida ou inativa nesta operação.');}
    }
    const result = await tx.marketingMoneyMovement.create({ data: { tenantId, ...payload, idempotencyKey, createdById: viewer.user.id }, select: { id: true } });
    await audit(tx, viewer, "MARKETING_MONEY_CREATED", result.id, { after: { ...payload, amount: amount.toFixed(2), effectiveDate: effectiveDate.toISOString().slice(0,10) } });
    return result;
  });
}
export async function transitionMoneyMovement(viewer: MarketingViewer, id: string, value: unknown, db = prisma) {
  authorize(viewer, true); const b = bodyObject(value, ["version", "status", "reason"]);
  if (!Number.isSafeInteger(b.version) || Number(b.version) < 0 || !["CONFIRMED", "CANCELLED"].includes(String(b.status))) throw new MarketingError(400, "Transição inválida.");
  const reason = text(b.reason, "Motivo", 1000);
  return marketingTransaction(db, async tx => {
    const tenantId = viewer.tenant.id;
    const current = await tx.marketingMoneyMovement.findFirst({ where: { tenantId, id } });
    if (!current) throw new MarketingError(404, "Movimento não encontrado.");
    if (current.version !== b.version || current.status === "CANCELLED" || (b.status === "CONFIRMED" && current.status !== "PENDING")) throw new MarketingError(409, "Movimento atualizado ou transição inválida.");
    if(isRecoverableFunding(current.fundingNature)&&b.status==='CANCELLED'&&await tx.marketingMoneyMovement.count({where:{tenantId,fundingMovementId:id,status:{not:'CANCELLED'}}}))throw new MarketingError(409,'Cancele primeiro as liquidações vinculadas; o histórico do financiamento será preservado.');
    if(b.status==='CANCELLED'&&current.kind==='CONTRIBUTION'&&!current.beneficiaryPersonId&&(['GLOBAL','RECOMPOSE_CASH'].includes(current.fundingNature)||current.fundingNature==='STANDARD'&&current.origin==='FLYIMOB')&&await tx.marketingMoneyMovement.count({where:{tenantId,distributionMovementId:id,status:{not:'CANCELLED'}}}))throw new MarketingError(409,'Cancele primeiro as distribuições vinculadas.');
    if(isFundingAllocation(current.fundingNature)&&b.status==='CONFIRMED'){if(isRecomposition(current.fundingNature))await assertConsumptionReference(tx,tenantId,current.accountId,current.currency,current.effectiveDate,current.externalReference!,current.beneficiaryPersonId,current.amount);await assertDistribution(tx,tenantId,{...current,distributionMovementId:current.distributionMovementId!},id);}
    if(isFundingSettlement(current.fundingNature??'STANDARD')&&b.status==='CONFIRMED'){
      await assertFundingRecovery(tx,tenantId,{...current,fundingMovementId:current.fundingMovementId!,beneficiaryPersonId:current.beneficiaryPersonId!},id);
      if(current.fundingNature==='SETTLEMENT_META')await assertMetaSettlementCapacity(tx,tenantId,current.accountId,current.beneficiaryPersonId!,current.currency,current.effectiveDate,current.amount,id);
    }
    await audit(tx, viewer, "MARKETING_MONEY_STATUS_CHANGED", id, { before: { status: current.status, version: current.version }, after: { status: String(b.status), version: current.version + 1, reason } });
    const result = await tx.marketingMoneyMovement.updateMany({ where: { tenantId, id, version: current.version, status: current.status }, data: { status: String(b.status), version: { increment: 1 } } });
    if (!result.count) throw new MarketingError(409, "Movimento atualizado. Recarregue.");
    return { id };
  });
}
async function assertFundingRecovery(tx:Prisma.TransactionClient,tenantId:string,value:{fundingMovementId:string;beneficiaryPersonId:string;accountId:string;currency:string;effectiveDate:Date;amount:Prisma.Decimal},excludeId?:string){
 const parent=await tx.marketingMoneyMovement.findFirst({where:{tenantId,id:value.fundingMovementId}});
 if(!parent||!isRecoverableFunding(parent.fundingNature)||parent.status!=='CONFIRMED'||parent.beneficiaryPersonId!==value.beneficiaryPersonId||parent.accountId!==value.accountId||parent.currency!==value.currency||parent.effectiveDate>value.effectiveDate)throw new MarketingError(400,'Financiamento confirmado, beneficiário, conta, moeda ou data incompatível nesta operação.');
 const reserved=await tx.marketingMoneyMovement.aggregate({where:{tenantId,fundingMovementId:parent.id,status:{not:'CANCELLED'},...(excludeId?{id:{not:excludeId}}:{})},_sum:{amount:true}});
 if(new Prisma.Decimal(reserved._sum.amount??0).plus(value.amount).gt(parent.amount))throw new MarketingError(409,'Liquidações confirmadas e pendentes excedem o principal do financiamento.');
}
export async function createReconciliationMark(viewer: MarketingViewer, value: unknown, db = prisma) {
  authorize(viewer, true); const b = bodyObject(value, ["accountId", "effectiveDate", "effectiveTime", "openingBalance", "note", "idempotencyKey"]);
  const accountId = text(b.accountId, "Conta"), date = day(b.effectiveDate), note = text(b.note, "Observação", 1000), idempotencyKey = text(b.idempotencyKey, "Chave", 80);
  if (typeof b.openingBalance !== "string" || !/^\d{1,12}(\.\d{1,2})?$/.test(b.openingBalance)) throw new MarketingError(400, "Saldo inicial inválido.");
  return marketingTransaction(db, async tx => {
    const tenantId = viewer.tenant.id;
    const account = await tx.metaAdAccount.findFirst({ where: { tenantId, id: accountId } });
    if (!account || date > day(civilToday(account.timezone))) throw new MarketingError(400, "Conta ou data inválida.");
    const actual = new Prisma.Decimal(String(b.openingBalance));
    const effectiveAt = localDayBoundary(String(b.effectiveDate), account.timezone, b.effectiveTime === undefined ? "00:00" : String(b.effectiveTime));
    if (effectiveAt > new Date()) throw new MarketingError(400, "O marco não pode estar no futuro.");
    const existing = await tx.marketingReconciliationMark.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } } });
    if (existing) { if (existing.accountId !== accountId || existing.effectiveDate.getTime() !== date.getTime() || existing.effectiveAt.getTime() !== effectiveAt.getTime() || !existing.openingBalance.eq(actual) || existing.note !== note || existing.createdById !== viewer.user.id) throw new MarketingError(409, "Chave já utilizada."); return { id: existing.id }; }
    const mark = await tx.marketingReconciliationMark.create({ data: { tenantId, accountId, effectiveDate: date, effectiveAt, openingBalance: actual, currency: account.currency, note, idempotencyKey, createdById: viewer.user.id } });
    await audit(tx, viewer, "MARKETING_RECONCILIATION_MARK_CREATED", mark.id, { after: { accountId, effectiveDate: String(b.effectiveDate), effectiveAt: effectiveAt.toISOString(), openingBalance: actual.toFixed(2), note } });
    return { id: mark.id };
  });
}

async function assertDistribution(tx:Prisma.TransactionClient,tenantId:string,value:{distributionMovementId:string;accountId:string;origin:string;personId:string|null;beneficiaryPersonId:string|null;currency:string;effectiveDate:Date;amount:Prisma.Decimal;fundingNature:string},excludeId?:string){
 const parent=await tx.marketingMoneyMovement.findFirst({where:{tenantId,id:value.distributionMovementId}});
 if(!parent||parent.status!=='CONFIRMED'||parent.kind!=='CONTRIBUTION'||parent.beneficiaryPersonId||!(['GLOBAL','RECOMPOSE_CASH'].includes(parent.fundingNature)||parent.fundingNature==='STANDARD'&&parent.origin==='FLYIMOB')||parent.accountId!==value.accountId||parent.currency!==value.currency||parent.origin!==value.origin||parent.personId!==value.personId||parent.effectiveDate>value.effectiveDate||parent.fundingNature==='RECOMPOSE_CASH'&&!isRecomposition(value.fundingNature))throw new MarketingError(400,'Entrada confirmada, origem, conta, moeda ou data incompatível para distribuição.');
 const reserved=await tx.marketingMoneyMovement.aggregate({where:{tenantId,distributionMovementId:parent.id,status:{not:'CANCELLED'},...(excludeId?{id:{not:excludeId}}:{})},_sum:{amount:true}});
 if(new Prisma.Decimal(reserved._sum.amount??0).plus(value.amount).gt(parent.amount))throw new MarketingError(409,'Distribuições confirmadas e pendentes excedem a entrada física.');
 // An institutional allocation retains the same owner, but reserves its parent principal.
 const source=parent.origin==='PERSON'?parent.personId!:parent.origin;
 if(value.beneficiaryPersonId&&value.beneficiaryPersonId!==source){
  const available=await creditAt(tx,tenantId,value.accountId,source,value.currency,value.effectiveDate,value.amount,excludeId,false,isRecomposition(value.fundingNature)?parent.id:undefined);
  if(available.lt(value.amount))throw new MarketingError(409,'Crédito da origem já consumido ou reservado. Não é possível distribuí-lo novamente.');
 }
 if(isRecomposition(value.fundingNature)){
  const credit=await creditAt(tx,tenantId,value.accountId,value.beneficiaryPersonId!,value.currency,value.effectiveDate,value.amount,excludeId,true);
  if(credit.negated().lt(value.amount))throw new MarketingError(409,'Recomposição excede o consumo efetivo ainda sem cobertura. Não crie outro crédito ou financiamento para o mesmo consumo.');
 }
}
/** One physical deposit and its draft lines are committed or rolled back together. */
export async function createGlobalContribution(viewer:MarketingViewer,value:unknown,db=prisma){
 authorize(viewer,true);
 const body=bodyObject(value,['movement','distributions']);
 const movement=bodyObject(body.movement,['accountId','personId','kind','origin','status','effectiveDate','amount','currency','note','idempotencyKey','fundingNature','externalReference']);
 text(movement.idempotencyKey,'Chave global',70);
 if(!['GLOBAL','RECOMPOSE_CASH'].includes(String(movement.fundingNature))||movement.kind!=='CONTRIBUTION'||movement.status!=='CONFIRMED')throw new MarketingError(400,'Aporte global distribuído exige entrada física confirmada.');
 if(!Array.isArray(body.distributions)||body.distributions.length>100)throw new MarketingError(400,'Informe até 100 distribuições.');
 const lines=body.distributions.map(line=>{const draft=bodyObject(line,['beneficiaryPersonId','fundingNature','amount','reason','externalReference']);return {beneficiaryPersonId:draft.beneficiaryPersonId?text(draft.beneficiaryPersonId,'Beneficiário'):null,fundingNature:text(draft.fundingNature,'Natureza',30),amount:movementMoney(draft.amount).toFixed(2),reason:text(draft.reason,'Motivo',1000),externalReference:draft.externalReference?text(draft.externalReference,'Referência',200):null};});
 const total=lines.reduce((sum,line)=>sum.plus(movementMoney(line.amount)),new Prisma.Decimal(0));
 if(total.gt(movementMoney(movement.amount)))throw new MarketingError(400,'Distribuições excedem o aporte físico.');
 return moneyTransaction(db,async tx=>{
  const adapter=Object.assign(Object.create(tx),{[nestedMoneyTransaction]:true,$transaction:async<T>(run:(tx:Prisma.TransactionClient)=>Promise<T>)=>run(tx)}) as typeof prisma;
  const parent=await createMoneyMovement(viewer,movement,adapter);
  const planHash=createHash('sha256').update(JSON.stringify(lines)).digest('hex');
  const plans=await tx.marketingAuditEvent.findMany({where:{tenantId:viewer.tenant.id,entityId:parent.id,eventType:'MARKETING_GLOBAL_PLAN'},select:{metadata:true}});
  if(plans.length&&JSON.stringify(plans[0].metadata)!==JSON.stringify({planHash}))throw new MarketingError(409,'Chave global já utilizada com distribuições diferentes.');
  if(!plans.length)await audit(tx,viewer,'MARKETING_GLOBAL_PLAN',parent.id,{planHash});
  const ids=[];
  for(const [index,line] of lines.entries())ids.push((await createMoneyMovement(viewer,{...line,accountId:movement.accountId,origin:movement.origin,personId:movement.personId,currency:movement.currency,effectiveDate:movement.effectiveDate,kind:'ADJUSTMENT',adjustmentType:'COMPENSATION',affectsPhysicalBalance:false,status:'CONFIRMED',distributionMovementId:parent.id,idempotencyKey:`${text(movement.idempotencyKey,'Chave',70)}:${index}`},adapter)).id);
  return {id:parent.id,distributionIds:ids};
 });
}

const nestedMoneyTransaction=Symbol('nestedMoneyTransaction');
async function moneyTransaction<T>(db:typeof prisma,run:(tx:Prisma.TransactionClient)=>Promise<T>):Promise<T>{
 if((db as unknown as {[nestedMoneyTransaction]?:boolean})[nestedMoneyTransaction])return db.$transaction(run);
 // A concurrent identical request may report unique-key conflict instead of serialization conflict.
 // Retry the whole transaction, then validate the complete immutable payload and global manifest.
 for(let attempt=0;attempt<3;attempt++){
  try{return await marketingTransaction(db,run);}catch(error){
   if(!(error instanceof Prisma.PrismaClientKnownRequestError)||error.code!=='P2002'||attempt===2)throw error;
  }
 }
 throw new MarketingError(409,'Atualização concorrente. Recarregue.');
}
