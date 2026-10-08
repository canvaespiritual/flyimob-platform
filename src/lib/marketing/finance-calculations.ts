import { Prisma } from "@prisma/client";
import { day, MarketingError } from "./policy";
import { isFundingAllocation, isRecoverableFunding } from "./funding-policy";
import { roundMoney, toDecimal } from "@/lib/financeiro/money";

export function movementMoney(value: unknown, signed = false) {
  if (typeof value !== "string" || !new RegExp(`^${signed ? "-?" : ""}\\d{1,12}(\\.\\d{1,2})?$`).test(value)) throw new MarketingError(400, "Valor inválido. Use até duas casas decimais.");
  const result = new Prisma.Decimal(value);
  if (result.isZero() || (!signed && result.isNegative())) throw new MarketingError(400, "O valor deve ser diferente de zero e aportes devem ser positivos.");
  return result;
}
export function localDayBoundary(date: string, timezone: string, time = "00:00") {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new MarketingError(400, "Horário inválido.");
  const [hour,minute] = time.split(":").map(Number);
  const target = day(date).getTime() + hour * 3600000 + minute * 60000; let value = target;
  for (let iteration = 0; iteration < 4; iteration++) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
    const n = (key: string) => Number(parts.find(p => p.type === key)!.value);
    const represented = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
    if (represented === target) return new Date(value);
    value += target - represented;
  }
  throw new MarketingError(400, "Não foi possível determinar o início do dia no fuso da conta.");
}
export type EconomicMovement = { id?: string; distributionMovementId?: string | null; beneficiaryPersonId?: string | null; fundingNature?: string; fundingMovementId?: string | null; affectsPhysicalBalance?: boolean; status: string; kind: string; origin: string; personId: string | null; currency: string; amount: Prisma.Decimal; effectiveDate: Date };
export type EconomicMetric = { date: Date; currency: string; state: string; metaSpend: Prisma.Decimal | null; effectiveSpend: Prisma.Decimal | null; leads: number | null; campaign: { id: string; assignments: { personId: string | null; brokerId?: string | null; validFrom: Date; validTo: Date | null }[] } };
export function economicLedger(movements: EconomicMovement[], metrics: EconomicMetric[], from: Date, to: Date, resolve: (id: string) => string = id => id) {
  const zero = () => ({contributions:toDecimal(0),adjustments:toDecimal(0),consumption:toDecimal(0),periodContributions:toDecimal(0),periodConsumption:toDecimal(0),fundingProvided:toDecimal(0),fundingReceived:toDecimal(0),receivable:toDecimal(0),outstandingDebt:toDecimal(0),recoveredExternal:toDecimal(0),metaCompensated:toDecimal(0),mediaTransfers:toDecimal(0),bonuses:toDecimal(0),forgiven:toDecimal(0),losses:toDecimal(0),recomposed:toDecimal(0),periodDistributions:toDecimal(0),periodRecoveries:toDecimal(0),periodBonuses:toDecimal(0),periodLosses:toDecimal(0),periodFundingProvided:toDecimal(0),periodFundingReceived:toDecimal(0),periodDebtCreated:toDecimal(0),periodDebtReleased:toDecimal(0),periodReceivableCreated:toDecimal(0),periodReceivableReleased:toDecimal(0),periodAdjustments:toDecimal(0),periodMediaTransfers:toDecimal(0),periodForgiven:toDecimal(0)});
  const groups = new Map<string, ReturnType<typeof zero> & {id:string;currency:string;leads:number;missing:number}>();
  const group = (id: string, currency: string) => { const key = `${id}:${currency}`; if (!groups.has(key)) groups.set(key, { id, currency, ...zero(), leads: 0, missing: 0 }); return groups.get(key)!; };
  const confirmed=movements.filter(m=>m.status==='CONFIRMED'&&m.effectiveDate<=to);
  for (const m of confirmed) {
    if (m.fundingNature?.startsWith('SETTLEMENT_') || isFundingAllocation(m.fundingNature??'')) continue;
    const funder=m.origin === "PERSON" && m.personId ? resolve(m.personId) : m.origin;
    const beneficiary=m.beneficiaryPersonId ? resolve(m.beneficiaryPersonId) : funder;
    const g = group(funder, m.currency);
    if (m.kind === "CONTRIBUTION") { g.contributions = g.contributions.plus(m.amount); if (m.effectiveDate >= from) g.periodContributions = g.periodContributions.plus(m.amount); }
    else {g.adjustments = g.adjustments.plus(m.amount);if(m.effectiveDate>=from)g.periodAdjustments=g.periodAdjustments.plus(m.amount);}
    if(m.kind==='CONTRIBUTION'&&beneficiary!==funder){
      const recipient=group(beneficiary,m.currency);
      g.fundingProvided=g.fundingProvided.plus(m.amount);recipient.fundingReceived=recipient.fundingReceived.plus(m.amount);if(m.effectiveDate>=from){g.periodFundingProvided=g.periodFundingProvided.plus(m.amount);recipient.periodFundingReceived=recipient.periodFundingReceived.plus(m.amount);}
      if(isRecoverableFunding(m.fundingNature??'')){g.receivable=g.receivable.plus(m.amount);recipient.outstandingDebt=recipient.outstandingDebt.plus(m.amount);if(m.effectiveDate>=from){g.periodReceivableCreated=g.periodReceivableCreated.plus(m.amount);recipient.periodDebtCreated=recipient.periodDebtCreated.plus(m.amount);}}
    }
  }
  const parents=new Map(confirmed.filter(m=>m.id).map(m=>[m.id!,m]));
  for(const m of confirmed.filter(m=>isFundingAllocation(m.fundingNature??''))){
    const parent=m.distributionMovementId?parents.get(m.distributionMovementId):undefined;
    if(!parent)throw new MarketingError(503,'Distribuição sem entrada histórica válida.');
    const source=parent.origin==='PERSON'&&parent.personId?resolve(parent.personId):parent.origin;
    const recipientId=m.beneficiaryPersonId?resolve(m.beneficiaryPersonId):source;
    const company=group(source,m.currency),recipient=group(recipientId,m.currency);
    if(source!==recipientId){company.fundingProvided=company.fundingProvided.plus(m.amount);recipient.fundingReceived=recipient.fundingReceived.plus(m.amount);if(m.effectiveDate>=from){company.periodFundingProvided=company.periodFundingProvided.plus(m.amount);recipient.periodFundingReceived=recipient.periodFundingReceived.plus(m.amount);}}
    if(isRecoverableFunding(m.fundingNature??'')){company.receivable=company.receivable.plus(m.amount);recipient.outstandingDebt=recipient.outstandingDebt.plus(m.amount);if(m.effectiveDate>=from){company.periodReceivableCreated=company.periodReceivableCreated.plus(m.amount);recipient.periodDebtCreated=recipient.periodDebtCreated.plus(m.amount);}}
    if(m.effectiveDate>=from)recipient.periodDistributions=recipient.periodDistributions.plus(m.amount);
  }
  for(const m of confirmed){
    if(['BONUS','ALLOCATION_BONUS','RECOMPOSE_BONUS'].includes(m.fundingNature??'')){const source=m.origin==='PERSON'&&m.personId?resolve(m.personId):m.origin;const recipient=m.beneficiaryPersonId?resolve(m.beneficiaryPersonId):source;for(const id of new Set([source,recipient])){const g=group(id,m.currency);g.bonuses=g.bonuses.plus(m.amount);if(m.effectiveDate>=from)g.periodBonuses=g.periodBonuses.plus(m.amount);}}
    if(['RECOMPOSE_LOAN','RECOMPOSE_BONUS'].includes(m.fundingNature??'')){const g=group(m.origin,m.currency);g.recomposed=g.recomposed.plus(m.amount);}
  }
  const financingById=new Map(confirmed.filter(m=>m.id&&isRecoverableFunding(m.fundingNature??'')).map(m=>[m.id!,m]));
  for(const m of confirmed.filter(m=>m.fundingNature?.startsWith('SETTLEMENT_'))){
    const funding=m.fundingMovementId?financingById.get(m.fundingMovementId):undefined;
    if(!funding?.beneficiaryPersonId)throw new MarketingError(503,'Liquidação sem financiamento histórico válido.');
    const company=group(funding.origin,m.currency),recipient=group(resolve(funding.beneficiaryPersonId),m.currency);
    company.receivable=company.receivable.minus(m.amount);recipient.outstandingDebt=recipient.outstandingDebt.minus(m.amount);if(m.effectiveDate>=from){company.periodReceivableReleased=company.periodReceivableReleased.plus(m.amount);recipient.periodDebtReleased=recipient.periodDebtReleased.plus(m.amount);}
    if(m.fundingNature==='SETTLEMENT_META'){
      company.mediaTransfers=company.mediaTransfers.plus(m.amount);recipient.mediaTransfers=recipient.mediaTransfers.minus(m.amount);if(m.effectiveDate>=from){company.periodMediaTransfers=company.periodMediaTransfers.plus(m.amount);recipient.periodMediaTransfers=recipient.periodMediaTransfers.minus(m.amount);}
      company.metaCompensated=company.metaCompensated.plus(m.amount);recipient.metaCompensated=recipient.metaCompensated.plus(m.amount);
    }else if(m.fundingNature==='SETTLEMENT_BONUS'||m.fundingNature==='SETTLEMENT_LOSS'){
      const field=m.fundingNature==='SETTLEMENT_BONUS'?'forgiven':'losses';company[field]=company[field].plus(m.amount);recipient[field]=recipient[field].plus(m.amount);
      if(m.effectiveDate>=from){const periodField=field==='forgiven'?'periodForgiven':'periodLosses';company[periodField]=company[periodField].plus(m.amount);recipient[periodField]=recipient[periodField].plus(m.amount);}
    }else{company.recoveredExternal=company.recoveredExternal.plus(m.amount);recipient.recoveredExternal=recipient.recoveredExternal.plus(m.amount);}
    if(m.effectiveDate>=from&&['SETTLEMENT_META','SETTLEMENT_EXTERNAL'].includes(m.fundingNature??'')){company.periodRecoveries=company.periodRecoveries.plus(m.amount);recipient.periodRecoveries=recipient.periodRecoveries.plus(m.amount);}
  }
  for (const m of metrics) {
    if (m.date > to) continue;
    const a = m.campaign.assignments.find(a => a.validFrom <= m.date && (!a.validTo || m.date < a.validTo));
    const id = a?.personId ?? a?.brokerId;
    const g = group(id ? resolve(id) : "UNASSIGNED", m.currency);
    if (m.state !== "CONFIRMED" || m.effectiveSpend === null) { g.missing++; continue; }
    g.consumption = g.consumption.plus(m.effectiveSpend);
    if (m.date >= from) { g.periodConsumption = g.periodConsumption.plus(m.effectiveSpend); g.leads += m.leads ?? 0; }
  }
  return [...groups.values()].map(g => {
    const mediaPosition = g.contributions.plus(g.adjustments).minus(g.fundingProvided).plus(g.fundingReceived).plus(g.mediaTransfers).minus(g.consumption);
    const position=mediaPosition.plus(g.receivable).minus(g.outstandingDebt);
    const unfundedCredit=Prisma.Decimal.max(mediaPosition.negated(),0);
    return { ...g, periodFundingProvided:g.periodFundingProvided.toFixed(2),periodFundingReceived:g.periodFundingReceived.toFixed(2),periodDebtCreated:g.periodDebtCreated.toFixed(2),periodDebtReleased:g.periodDebtReleased.toFixed(2),periodReceivableCreated:g.periodReceivableCreated.toFixed(2),periodReceivableReleased:g.periodReceivableReleased.toFixed(2),periodAdjustments:g.periodAdjustments.toFixed(2),periodMediaTransfers:g.periodMediaTransfers.toFixed(2),periodForgiven:g.periodForgiven.toFixed(2),bonuses:g.bonuses.toFixed(2),forgiven:g.forgiven.toFixed(2),losses:g.losses.toFixed(2),recomposed:g.recomposed.toFixed(2),periodDistributions:g.periodDistributions.toFixed(2),periodRecoveries:g.periodRecoveries.toFixed(2),periodBonuses:g.periodBonuses.toFixed(2),periodLosses:g.periodLosses.toFixed(2), contributions:g.contributions.toFixed(2),adjustments:g.adjustments.toFixed(2),consumption:g.consumption.toFixed(2),periodContributions:g.periodContributions.toFixed(2),periodConsumption:g.periodConsumption.toFixed(2),fundingProvided:g.fundingProvided.toFixed(2),fundingReceived:g.fundingReceived.toFixed(2),receivable:g.receivable.toFixed(2),outstandingDebt:g.outstandingDebt.toFixed(2),recoveredExternal:g.recoveredExternal.toFixed(2),metaCompensated:g.metaCompensated.toFixed(2),mediaTransfers:g.mediaTransfers.toFixed(2),mediaPosition:mediaPosition.toFixed(2),position:position.toFixed(2),unfundedCredit:unfundedCredit.toFixed(2),operationalCredit:g.outstandingDebt.plus(unfundedCredit).toFixed(2),cpl:g.leads?roundMoney(g.periodConsumption.div(g.leads)).toFixed(2):null };
  });
}
export function physicalReconciliation(opening: Prisma.Decimal, movements: EconomicMovement[], metrics: EconomicMetric[], from: Date, to: Date, observed: Prisma.Decimal | null, tolerance: Prisma.Decimal) {
  let expected = opening;
  for (const m of movements) if (m.status === "CONFIRMED" && m.affectsPhysicalBalance !== false && m.effectiveDate >= from && m.effectiveDate <= to) expected = expected.plus(m.amount);
  for (const m of metrics) if (m.date >= from && m.date <= to && m.state === "CONFIRMED" && m.metaSpend !== null) expected = expected.minus(m.metaSpend);
  const difference = observed === null ? null : observed.minus(expected);
  return { expected: expected.toFixed(2), observed: observed?.toFixed(2) ?? null, difference: difference?.toFixed(2) ?? null, matched: difference !== null && difference.abs().lte(tolerance) };
}
export function coveredDays(ranges: { periodFrom: Date; periodTo: Date }[], from: Date, to: Date) {
  let cursor = from.getTime();
  for (const r of [...ranges].sort((a,b) => a.periodFrom.getTime()-b.periodFrom.getTime())) { if (r.periodTo.getTime() < cursor) continue; if (r.periodFrom.getTime() > cursor) return false; cursor = Math.max(cursor, r.periodTo.getTime() + 86400000); if (cursor > to.getTime()) return true; }
  return cursor > to.getTime();
}

export function resolveOperationalIdentity(people:{id:string;mergedIntoId:string|null}[],id:string) {
 const seen=new Set<string>();let current=id;
 while(!seen.has(current)){seen.add(current);const person=people.find(p=>p.id===current);if(!person?.mergedIntoId)return current;current=person.mergedIntoId;}
 throw new MarketingError(503,"Identidade operacional precisa de revisão.");
}
