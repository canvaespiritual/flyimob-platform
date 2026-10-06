import { Prisma } from "@prisma/client";
import { day, MarketingError } from "./policy";
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
export type EconomicMovement = { affectsPhysicalBalance?: boolean; status: string; kind: string; origin: string; personId: string | null; currency: string; amount: Prisma.Decimal; effectiveDate: Date };
export type EconomicMetric = { date: Date; currency: string; state: string; metaSpend: Prisma.Decimal | null; effectiveSpend: Prisma.Decimal | null; leads: number | null; campaign: { id: string; assignments: { personId: string | null; brokerId?: string | null; validFrom: Date; validTo: Date | null }[] } };
export function economicLedger(movements: EconomicMovement[], metrics: EconomicMetric[], from: Date, to: Date, resolve: (id: string) => string = id => id) {
  const groups = new Map<string, { id: string; currency: string; contributions: Prisma.Decimal; adjustments: Prisma.Decimal; consumption: Prisma.Decimal; periodContributions: Prisma.Decimal; periodConsumption: Prisma.Decimal; leads: number; missing: number }>();
  const group = (id: string, currency: string) => { const key = `${id}:${currency}`; if (!groups.has(key)) groups.set(key, { id, currency, contributions: toDecimal(0), adjustments: toDecimal(0), consumption: toDecimal(0), periodContributions: toDecimal(0), periodConsumption: toDecimal(0), leads: 0, missing: 0 }); return groups.get(key)!; };
  for (const m of movements) {
    if (m.status !== "CONFIRMED" || m.effectiveDate > to) continue;
    const g = group(m.origin === "PERSON" && m.personId ? resolve(m.personId) : m.origin, m.currency);
    if (m.kind === "CONTRIBUTION") { g.contributions = g.contributions.plus(m.amount); if (m.effectiveDate >= from) g.periodContributions = g.periodContributions.plus(m.amount); }
    else g.adjustments = g.adjustments.plus(m.amount);
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
    const position = g.contributions.plus(g.adjustments).minus(g.consumption);
    return { ...g, contributions: g.contributions.toFixed(2), adjustments: g.adjustments.toFixed(2), consumption: g.consumption.toFixed(2), periodContributions: g.periodContributions.toFixed(2), periodConsumption: g.periodConsumption.toFixed(2), position: position.toFixed(2), operationalCredit: Prisma.Decimal.max(position.negated(), 0).toFixed(2), cpl: g.leads ? roundMoney(g.periodConsumption.div(g.leads)).toFixed(2) : null };
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
