import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { percentageOf, roundMoney, toDecimal } from "@/lib/financeiro/money";
import { day, MarketingError } from "./policy";
import { marketingTransaction } from "./admin.server";

export function effectiveSpend(spend: Prisma.Decimal, rate: Prisma.Decimal) {
  return roundMoney(spend.plus(percentageOf(spend, rate)));
}
export function metricValues(value: { date: string; metaSpend: string; leads: number; currency: string; sourceObservedAt: Date }) {
  const date = day(value.date);
  if (!/^\d{1,16}(\.\d{1,2})?$/.test(value.metaSpend) || !Number.isSafeInteger(value.leads) || value.leads < 0 || value.leads > 2147483647 ||
      !/^[A-Z]{3}$/.test(value.currency) || !Number.isFinite(value.sourceObservedAt.getTime())) throw new MarketingError(400, "Métrica diária inválida.");
  return { date, metaSpend: new Prisma.Decimal(value.metaSpend), leads: value.leads, currency: value.currency, sourceObservedAt: value.sourceObservedAt };
}
/** Internal ingestion boundary only. V1 has no public import endpoint or external provider. */
export async function storeDailyMetric(tenantId: string, campaignId: string,
  value: { date: string; metaSpend: string; leads: number; currency: string; sourceObservedAt: Date }, db = prisma) {
  const input = metricValues(value);
  return marketingTransaction(db, async tx => {
    const campaign = await tx.marketingCampaign.findFirst({ where: { tenantId, id: campaignId }, include: { account: true } });
    if (!campaign) throw new MarketingError(404, "Campanha não encontrada na operação.");
    if (input.currency !== campaign.account.currency) throw new MarketingError(400, "Moeda diferente da conta de anúncios.");
    const key = { tenantId_campaignId_date: { tenantId, campaignId, date: input.date } };
    const existing = await tx.marketingDailyMetric.findUnique({ where: key });
    if (existing?.sourceObservedAt && existing.sourceObservedAt > input.sourceObservedAt) return existing;
    if (existing?.sourceObservedAt && existing.sourceObservedAt.getTime() === input.sourceObservedAt.getTime()) {
      if (existing.metaSpend?.eq(input.metaSpend) && existing.leads === input.leads) return existing;
      throw new MarketingError(409, "A mesma observação não pode possuir dois totais diferentes.");
    }
    const rule = existing?.costPercentage !== null && existing?.costPercentage !== undefined ? null : await tx.marketingCostRule.findFirst({
      where: { tenantId, validFrom: { lte: input.date }, OR: [{ validTo: null }, { validTo: { gt: input.date } }] },
    });
    const costPercentage = existing?.costPercentage ?? rule?.percentage ?? toDecimal(0);
    const now = new Date();
    const data = { ...input, state: "CONFIRMED" as const, costRuleId: existing?.costRuleId ?? rule?.id ?? null,
      costPercentage, effectiveSpend: effectiveSpend(input.metaSpend, costPercentage), syncedAt: now, lastAttemptAt: now };
    return tx.marketingDailyMetric.upsert({ where: key, create: { tenantId, campaignId, ...data }, update: data });
  });
}
export async function markDailyMetricUnavailable(tenantId: string, campaignId: string, dateValue: string,
  state: "MISSING" | "FAILED", db = prisma) {
  const date = day(dateValue);
  return marketingTransaction(db, async tx => {
    const campaign = await tx.marketingCampaign.findFirst({ where: { tenantId, id: campaignId }, include: { account: true } });
    if (!campaign) throw new MarketingError(404, "Campanha não encontrada na operação.");
    const key = { tenantId_campaignId_date: { tenantId, campaignId, date } };
    const existing = await tx.marketingDailyMetric.findUnique({ where: key });
    // A failed attempt never erases a previously confirmed observation.
    if (existing?.metaSpend !== null && existing?.metaSpend !== undefined) return tx.marketingDailyMetric.update({ where: key, data: { lastAttemptAt: new Date() } });
    return tx.marketingDailyMetric.upsert({ where: key, create: { tenantId, campaignId, date, currency: campaign.account.currency, state, lastAttemptAt: new Date() }, update: { state, lastAttemptAt: new Date() } });
  });
}

export type ReportRow = {
  date: Date; currency: string; state: string; metaSpend: Prisma.Decimal | null; effectiveSpend: Prisma.Decimal | null; leads: number | null;
  impressions?: bigint | null; clicks?: bigint | null; linkClicks?: bigint | null;
  campaign: { id: string; name: string; purpose: string; sourceStatus?: string | null; account?: { name: string; timezone: string }; assignments: { brokerId: string; validFrom: Date; validTo: Date | null; broker: { name: string } }[] };
};
export function summarize(rows: ReportRow[], brokerFilter?: string) {
  type Acc = { currency: string; meta: Prisma.Decimal; effective: Prisma.Decimal; leads: number; rows: number; impressions?: bigint | null; clicks?: bigint | null; linkClicks?: bigint | null };
  const totals = new Map<string, Acc>(); const brokers = new Map<string, { id: string | null; name: string; amount: Acc }>();
  const campaigns = new Map<string, { id: string; name: string; purpose: string; account: string; status: string | null; brokers: Set<string>; amount: Acc }>();
  let unavailable = 0;
  const add = (map: Map<string, Acc>, currency: string) => {
    if (!map.has(currency)) map.set(currency, { currency, meta: toDecimal(0), effective: toDecimal(0), leads: 0, rows: 0 });
    return map.get(currency)!;
  };
  for (const row of rows) {
    const assignment = row.campaign.assignments.find(item => item.validFrom <= row.date && (!item.validTo || row.date < item.validTo));
    if (brokerFilter && (brokerFilter === "unassigned" ? !!assignment : assignment?.brokerId !== brokerFilter)) continue;
    if (row.state !== "CONFIRMED" || row.metaSpend === null || row.effectiveSpend === null || row.leads === null) { unavailable++; continue; }
    const total = add(totals, row.currency);
    const brokerKey = `${assignment?.brokerId ?? "unassigned"}:${row.currency}`;
    if (!brokers.has(brokerKey)) brokers.set(brokerKey, { id: assignment?.brokerId ?? null, name: assignment?.broker.name ?? "Não atribuídas", amount: { currency: row.currency, meta: toDecimal(0), effective: toDecimal(0), leads: 0, rows: 0 } });
    const campaignKey = `${row.campaign.id}:${row.currency}`;
    if (!campaigns.has(campaignKey)) campaigns.set(campaignKey, { id: row.campaign.id, name: row.campaign.name, purpose: row.campaign.purpose, account: row.campaign.account?.name ?? "—", status: row.campaign.sourceStatus ?? null, brokers: new Set(), amount: { currency: row.currency, meta: toDecimal(0), effective: toDecimal(0), leads: 0, rows: 0 } });
    campaigns.get(campaignKey)!.brokers.add(assignment?.broker.name ?? "Não atribuída");
    for (const amount of [total, brokers.get(brokerKey)!.amount, campaigns.get(campaignKey)!.amount]) {
      amount.meta = amount.meta.plus(row.metaSpend); amount.effective = amount.effective.plus(row.effectiveSpend); amount.leads += row.leads; amount.rows++;
      for (const key of ["impressions", "clicks", "linkClicks"] as const) amount[key] = amount[key] === null || row[key] == null ? null : (amount[key] ?? 0n) + row[key]!;
    }
  }
  const ratio = (spend: Prisma.Decimal, denominator: number | bigint | null | undefined, factor = 1) => denominator ? roundMoney(spend.div(denominator.toString()).times(factor)).toFixed(2) : null;
  const serialize = (a: Acc) => ({ currency: a.currency, metaSpend: a.meta.toFixed(2), effectiveSpend: a.effective.toFixed(2), increment: a.effective.minus(a.meta).toFixed(2), leads: a.leads,
    cpl: ratio(a.effective, a.leads), cplMeta: ratio(a.meta, a.leads), cplEffective: ratio(a.effective, a.leads), cpc: ratio(a.meta, a.clicks), cpm: ratio(a.meta, a.impressions, 1000),
    impressions: a.impressions?.toString() ?? null, clicks: a.clicks?.toString() ?? null, linkClicks: a.linkClicks?.toString() ?? null, rows: a.rows });
  return { totals: [...totals.values()].map(serialize).sort((a, b) => a.currency.localeCompare(b.currency)),
    brokers: [...brokers.values()].map(b => ({ id: b.id, name: b.name, ...serialize(b.amount) })),
    campaigns: [...campaigns.values()].map(c => ({ id: c.id, name: c.name, purpose: c.purpose, account: c.account, status: c.status, broker: [...c.brokers].join(" / "), ...serialize(c.amount) })), unavailable };
}
