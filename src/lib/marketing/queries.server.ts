import { Prisma, MarketingPurpose, MarketingTrackingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize, civilToday, day, MarketingError, period, type MarketingViewer } from "./policy";
import { summarize } from "./metrics.server";
import { configurationStatus } from "./connections.server";
import { canActAsSalesResponsible } from "@/lib/team/policy";
import { people } from "@/lib/team/service.server";

export function metaStatusWhere(status: "ACTIVE" | "PAUSED" | "OTHER"): Prisma.MarketingCampaignWhereInput {
  return status === "OTHER" ? { AND: [{ OR: [{ effectiveStatus: null }, { effectiveStatus: { notIn: ["ACTIVE", "PAUSED"] } }] },
    { OR: [{ effectiveStatus: { not: null } }, { sourceStatus: null }, { sourceStatus: { notIn: ["ACTIVE", "PAUSED"] } }] }] }
    : { OR: [{ effectiveStatus: status }, { effectiveStatus: null, sourceStatus: status }] };
}
const identitySelect = { personId: true, person: { select: { name: true, operationalRole: true } }, brokerId: true, broker: { select: { name: true } } };
function identity<T extends { personId: string | null; person: { name: string } | null; brokerId: string | null; broker: { name: string } | null }>(item: T) {
  return { ...item, brokerId: item.personId ?? item.brokerId, broker: item.person ?? item.broker ?? { name: "Responsável legado" } };
}

export async function options(viewer: MarketingViewer, db = prisma) {
  authorize(viewer); const tenantId = viewer.tenant.id;
  const [accounts, brokers] = await Promise.all([
    db.metaAdAccount.findMany({ where: { tenantId }, select: { id: true, name: true, currency: true, timezone: true }, orderBy: { name: "asc" } }),
    people(tenantId, db),
  ]);
  return { accounts, brokers: brokers.map(p => ({ id: p.id, name: p.name, operationalRole: p.operationalRole, isActive: canActAsSalesResponsible(p) })) };
}
export async function campaignList(viewer: MarketingViewer, params: URLSearchParams, db = prisma) {
  authorize(viewer); const tenantId = viewer.tenant.id;
  const page = Number(params.get("page") ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new MarketingError(400, "Página inválida.");
  const where: Prisma.MarketingCampaignWhereInput = { tenantId };
  const q = params.get("q")?.trim(); if (q && q.length > 160) throw new MarketingError(400, "Busca muito longa.");
  if (q) where.name = { contains: q, mode: "insensitive" };
  if (params.get("accountId")) where.accountId = params.get("accountId")!;
  const purpose = params.get("purpose"); const status = params.get("status");
  if (purpose) { if (!Object.values(MarketingPurpose).includes(purpose as MarketingPurpose)) throw new MarketingError(400, "Finalidade inválida."); where.purpose = purpose as MarketingPurpose; }
  if (status) { if (!Object.values(MarketingTrackingStatus).includes(status as MarketingTrackingStatus)) throw new MarketingError(400, "Status inválido."); where.trackingStatus = status as MarketingTrackingStatus; }
  const current = { cancelledAt: null, validFrom: { lte: day(civilToday()) }, OR: [{ validTo: null }, { validTo: { gt: day(civilToday()) } }] };
  const brokerId = params.get("brokerId");
  if (brokerId === "unassigned") where.assignments = { none: current };
  else if (brokerId) where.assignments = { some: { ...current, personId: brokerId } };
  const metaStatus = params.get("metaStatus") || (q ? "ALL" : "ACTIVE");
  if (!["ALL", "ACTIVE", "PAUSED", "OTHER"].includes(metaStatus)) throw new MarketingError(400, "Status Meta inválido.");
  const groups = (metaStatus === "ALL" ? ["ACTIVE", "PAUSED", "OTHER"] : [metaStatus]) as ("ACTIVE" | "PAUSED" | "OTHER")[];
  // Global priority before pagination, with deterministic ordering inside each group.
  return db.$transaction(async tx => {
    const counts = await Promise.all(groups.map(group => tx.marketingCampaign.count({ where: { AND: [where, metaStatusWhere(group)] } })));
    const total = counts.reduce((sum, count) => sum + count, 0);
    let skip = (page - 1) * 20;
    const select = { id: true, externalId: true, name: true, purpose: true, trackingStatus: true, sourceStatus: true, effectiveStatus: true, version: true, updatedAt: true, lastSyncedAt: true,
      account: { select: { id: true, name: true, externalId: true, currency: true, timezone: true, businessExternalId: true, businessName: true } },
      assignments: { where: current, select: identitySelect },
    } satisfies Prisma.MarketingCampaignSelect;
    const items: Prisma.MarketingCampaignGetPayload<{ select: typeof select }>[] = [];
    for (let i = 0; i < groups.length && items.length < 20; i++) {
      if (skip >= counts[i]) { skip -= counts[i]; continue; }
      const rows = await tx.marketingCampaign.findMany({ where: { AND: [where, metaStatusWhere(groups[i])] }, select,
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }], skip, take: 20 - items.length });
      items.push(...rows); skip = 0;
    }
    return { items: items.map(c => ({ ...c, assignments: c.assignments.map(identity) })), total, page, pageSize: 20, metaStatus };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
export async function campaignDetail(viewer: MarketingViewer, id: string, params: URLSearchParams, db = prisma) {
  authorize(viewer);
  const page = Number(params.get("page") ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new MarketingError(400, "Página inválida.");
  const campaign = await db.marketingCampaign.findFirst({ where: { tenantId: viewer.tenant.id, id }, select: { id: true, name: true, version: true } });
  if (!campaign) throw new MarketingError(404, "Campanha não encontrada.");
  const where = { tenantId: viewer.tenant.id, campaignId: id };
  const [assignments, total] = await Promise.all([
    db.campaignBrokerAssignment.findMany({ where, select: { ...identitySelect, id: true, validFrom: true, validTo: true, cancelledAt: true, reason: true, createdAt: true, createdBy: { select: { name: true } } }, orderBy: [{ validFrom: "desc" }, { createdAt: "desc" }], skip: (page - 1) * 20, take: 20 }),
    db.campaignBrokerAssignment.count({ where }),
  ]);
  return { campaign, assignments: assignments.map(identity), page, total };
}
export async function overview(viewer: MarketingViewer, params: URLSearchParams, db = prisma) {
  authorize(viewer); const tenantId = viewer.tenant.id;
  const selectedAccount = params.get("accountId") ? await db.metaAdAccount.findFirst({ where: { tenantId, id: params.get("accountId")! }, select: { timezone: true } }) : null;
  const range = period(params, civilToday(selectedAccount?.timezone ?? "America/Sao_Paulo"));
  const purpose = params.get("purpose") || "CLIENTES";
  if (purpose !== "ALL" && !Object.values(MarketingPurpose).includes(purpose as MarketingPurpose)) throw new MarketingError(400, "Finalidade inválida.");
  const campaign: Prisma.MarketingCampaignWhereInput = { tenantId, ...(purpose !== "ALL" ? { purpose: purpose as MarketingPurpose } : {}),
    ...(params.get("accountId") ? { accountId: params.get("accountId")! } : {}), ...(params.get("campaignId") ? { id: params.get("campaignId")! } : {}) };
  const where = { tenantId, date: { gte: day(range.from), lte: day(range.to) }, campaign };
  // Bound response size; campaign count has its own paginated management screen.
  if (await db.marketingDailyMetric.count({ where }) > 100000) throw new MarketingError(400, "Muitos dados. Reduza o período ou filtre por conta/campanha.");
  const rows = await db.marketingDailyMetric.findMany({ where, select: { date: true, currency: true, state: true, metaSpend: true, effectiveSpend: true, leads: true, impressions: true, clicks: true, linkClicks: true,
    campaign: { select: { id: true, name: true, purpose: true, sourceStatus: true, effectiveStatus: true, account: { select: { name: true, timezone: true } }, assignments: { where: { tenantId, cancelledAt: null, validFrom: { lte: day(range.to) }, OR: [{ validTo: null }, { validTo: { gt: day(range.from) } }] }, select: { ...identitySelect, validFrom: true, validTo: true } } } },
  } });
  const latest = await db.metaAdAccount.aggregate({ where: { tenantId, ...(params.get("accountId") ? { id: params.get("accountId")! } : {}) }, _max: { lastSyncedAt: true } });
  return { ...summarize(rows.map(row => ({ ...row, campaign: { ...row.campaign, sourceStatus: row.campaign.effectiveStatus ?? row.campaign.sourceStatus, assignments: row.campaign.assignments.map(identity) } })), params.get("brokerId") || undefined), ...range, purpose, lastSyncedAt: latest._max.lastSyncedAt,
    canSync: viewer.user.role === "OWNER", preferenceKey: `${tenantId}:${viewer.user.id}`, hasAnyMetrics: rows.length > 0,
    timezoneNote: `Datas representam dias locais das contas. Atalhos usam ${selectedAccount?.timezone ?? "America/Sao_Paulo (visão de várias contas)"}.` };
}
export async function settings(viewer: MarketingViewer, db = prisma) {
  authorize(viewer, true); const tenantId = viewer.tenant.id;
  const [connections, rules] = await Promise.all([
    db.metaConnection.findMany({ where: { tenantId }, select: { id: true, label: true, status: true, authorizedAt: true, expiresAt: true, lastSyncedAt: true, safeErrorCode: true,
      accounts: { select: { id: true, selected: true, accessible: true, account: { select: { id: true, name: true, externalId: true, currency: true, timezone: true, businessName: true, sourceAccountStatus: true } } } },
    }, orderBy: { createdAt: "desc" } }),
    db.marketingCostRule.findMany({ where: { tenantId }, select: { id: true, percentage: true, validFrom: true, validTo: true }, orderBy: { validFrom: "desc" } }),
  ]);
  return { connections, rules, today: civilToday(), ...configurationStatus() };
}
