import { prisma } from "@/lib/prisma";
import { day, MarketingError } from "@/lib/marketing/policy";
import { economicLedger, coveredDays } from "@/lib/marketing/finance-calculations";
import { summarize } from "@/lib/marketing/metrics.server";
import { performanceSeries } from "@/lib/marketing/performance";
import { applyCostCorrections, costCorrectionEvent } from "@/lib/marketing/cost-corrections.server";
import { ownsMetric, type officePeriod } from "./policy";
import type { OfficeIdentity } from "./identity.server";
import type { OfficeDb } from "./db.server";

export async function officeMarketing(identity: OfficeIdentity, range: ReturnType<typeof officePeriod>, db: OfficeDb = prisma) {
  const tenantId = identity.tenantId, ownership = { OR: [{ personId: { in: identity.personIds } }, { personId: null, brokerId: identity.userId }] };
  const campaignWhere = { tenantId, assignments: { some: { tenantId, cancelledAt: null, ...ownership } } };
  const movementWhere = { tenantId, OR: [{ beneficiaryPersonId: { in: identity.personIds } }, { origin: "PERSON", personId: { in: identity.personIds } }] };
  const [campaigns, movements, events] = await Promise.all([
    db.marketingCampaign.findMany({ where: campaignWhere, select: { id: true, name: true, assignments: { where: { tenantId, cancelledAt: null }, select: { personId: true, brokerId: true, validFrom: true, validTo: true } } } }),
    db.marketingMoneyMovement.findMany({ where: { ...movementWhere, effectiveDate: { lte: day(range.to) } }, select: { id: true, accountId: true, personId: true, beneficiaryPersonId: true, kind: true, origin: true, fundingNature: true, fundingMovementId: true, distributionMovementId: true, status: true, effectiveDate: true, amount: true, currency: true, affectsPhysicalBalance: true, reason: true, note: true, recoveryMethod: true, receipts: { select: { id: true, originalName: true } } }, take: 20001 }),
    db.marketingAuditEvent.findMany({ where: { tenantId, eventType: costCorrectionEvent }, select: { metadata: true } }),
  ]);
  if (movements.length > 20000) throw new MarketingError(400, "Histórico de recursos requer relatório paginado.");
  const metricWhere = { tenantId, campaignId: { in: campaigns.map(c => c.id) }, date: { lte: day(range.to) } };
  if (await db.marketingDailyMetric.count({ where: metricWhere }) > 100000) throw new MarketingError(400, "Histórico de campanhas muito grande para esta consulta.");
  const [raw, rules, parents] = await Promise.all([
    db.marketingDailyMetric.findMany({ where: metricWhere, select: { date: true, currency: true, state: true, metaSpend: true, effectiveSpend: true, leads: true, campaign: { select: { id: true, name: true, purpose: true, accountId: true, assignments: { where: { tenantId, cancelledAt: null }, select: { personId: true, brokerId: true, validFrom: true, validTo: true } } } } } }),
    events.length ? db.marketingCostRule.findMany({ where: { tenantId }, select: { id: true, percentage: true, validFrom: true, validTo: true } }) : [],
    // Parent records are needed by the established ledger, never serialized to the broker.
    db.marketingMoneyMovement.findMany({ where: { tenantId, id: { in: movements.flatMap(m => [m.fundingMovementId, m.distributionMovementId].filter((v): v is string => !!v)) } }, select: { id: true, personId: true, beneficiaryPersonId: true, kind: true, origin: true, fundingNature: true, fundingMovementId: true, distributionMovementId: true, status: true, effectiveDate: true, amount: true, currency: true, affectsPhysicalBalance: true } }),
  ]);
  // Recoveries can reference a distributed loan, which in turn references a
  // global contribution. Load that chain once; no parent is returned to the UI.
  const allMovements = new Map([...movements, ...parents].map(m => [m.id, m]));
  for (let depth = 0; depth < 32; depth++) {
    const missing = [...new Set([...allMovements.values()].flatMap(m => [m.fundingMovementId, m.distributionMovementId].filter((v): v is string => !!v && !allMovements.has(v))))];
    if (!missing.length) break;
    const ancestors = await db.marketingMoneyMovement.findMany({ where: { tenantId, id: { in: missing } }, select: { id: true, personId: true, beneficiaryPersonId: true, kind: true, origin: true, fundingNature: true, fundingMovementId: true, distributionMovementId: true, status: true, effectiveDate: true, amount: true, currency: true, affectsPhysicalBalance: true } });
    if (ancestors.length !== missing.length || depth === 31) throw new MarketingError(503, "Vínculo histórico de recursos precisa de revisão.");
    for (const row of ancestors) allMovements.set(row.id, row);
  }
  // Ownership applies on the metric day, not the campaign's current responsible.
  const mine = raw.filter(r => ownsMetric(r.campaign.assignments, r.date, identity.personIds, identity.userId));
  const rows = applyCostCorrections(mine.map(r => ({ ...r, campaign: { ...r.campaign, assignments: r.campaign.assignments.map(a => ({ ...a, brokerId: a.personId ? identity.personIds.includes(a.personId) ? identity.canonical : a.personId : a.brokerId === identity.userId ? identity.canonical : a.brokerId, broker: { name: "Sua operação" } })) } })), rules, events);
  const resolve = (id: string) => identity.personIds.includes(id) ? identity.canonical : id;
  const ledger = economicLedger([...allMovements.values()], rows.map(r => ({ ...r, campaign: { ...r.campaign, assignments: r.campaign.assignments.map(a => ({ ...a, personId: a.brokerId })) } })), day(range.from), day(range.to), resolve).filter(row => row.id === identity.canonical);
  const selected = rows.filter(r => r.date >= day(range.from));
  const summary = summarize(selected, identity.canonical);
  const accountIds = [...new Set(selected.map(r => r.campaign.accountId))];
  const runs = await db.marketingSyncRun.findMany({ where: { tenantId, accountId: { in: accountIds }, status: "SUCCEEDED", periodFrom: { lte: day(range.to) }, periodTo: { gte: day(range.from) } }, select: { accountId: true, periodFrom: true, periodTo: true } });
  const history = movements.filter(m => m.effectiveDate >= day(range.from)).map(m => ({ id: m.id, date: m.effectiveDate, amount: m.amount.toFixed(2), currency: m.currency, status: m.status, kind: m.kind, nature: m.fundingNature, origin: m.origin, reason: m.reason, description: m.note, recoveryMethod: m.recoveryMethod,
    receipts: m.receipts.map(r => ({ name: r.originalName, href: `/api/broker-office/receipts/marketing/${r.id}` })),
  }));
  return { linked: identity.personIds.length > 0, campaigns: campaigns.filter(c => c.assignments.some(a => (a.personId ? identity.personIds.includes(a.personId) : a.brokerId === identity.userId) && a.validFrom <= day(range.to) && (!a.validTo || a.validTo > day(range.from)))).map(c => ({ id: c.id, name: c.name, results: summary.campaigns.filter(r => r.id === c.id) })),
    totals: summary.totals, unavailable: summary.unavailable, positions: ledger, history,
    evolution: [...new Set(selected.map(r => r.currency))].map(currency => ({ currency, ...performanceSeries(selected, range.from, range.to, currency, [identity.canonical], (account, date) => coveredDays(runs.filter(r => r.accountId === account), day(date), day(date)), accountIds) })),
  };
}
