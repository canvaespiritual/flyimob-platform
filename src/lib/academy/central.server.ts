import { prisma } from "@/lib/prisma";

export type AcademyCentralFilters = {
  from: Date;
  to: Date;
  funnelKey?: string;
  vslKey?: string;
  source?: string;
  utmCampaign?: string;
  adsetId?: string;
  adId?: string;
};

function sessionWhere(filters: AcademyCentralFilters) {
  return {
    startedAt: { gte: filters.from, lt: filters.to },
    ...(filters.funnelKey ? { funnelKey: filters.funnelKey } : {}),
    ...(filters.vslKey ? { vslKey: filters.vslKey } : {}),
    ...(filters.source ? { source: filters.source } : {}),
    ...(filters.utmCampaign ? { utmCampaign: filters.utmCampaign } : {}),
    ...(filters.adsetId ? { adsetId: filters.adsetId } : {}),
    ...(filters.adId ? { adId: filters.adId } : {}),
  } as const;
}

export async function academyCentralSummary(filters: AcademyCentralFilters) {
  const where = sessionWhere(filters);
  const [sessions, events, leads, sales, ranges] = await Promise.all([
    prisma.academySession.findMany({ where, select: { id: true, visitorId: true, currentSecond: true, maxReachedSecond: true, watchedSeconds: true, uniqueWatchedSeconds: true, pitchReachedAt: true, checkoutOpenedAt: true, checkoutClickedAt: true } }),
    prisma.academyEvent.groupBy({ by: ["type"], where: { session: where }, _count: { _all: true } }),
    prisma.academyLead.count({ where: { createdAt: { gte: filters.from, lt: filters.to }, session: where } }),
    prisma.academySale.findMany({ where: { createdAt: { gte: filters.from, lt: filters.to }, session: where }, select: { status: true, grossAmount: true, netAmount: true, sessionId: true } }),
    prisma.academyWatchRange.findMany({ where: { session: where }, select: { startMs: true, endMs: true } }),
  ]);
  const uniqueVisitors = new Set(sessions.map((s) => s.visitorId)).size;
  const eventCount = (type: string) => events.find((e) => e.type === type)?._count._all ?? 0;
  const approved = sales.filter((s) => s.status === "APPROVED" || s.status === "COMPLETED");
  const sum = (key: "grossAmount" | "netAmount", rows = approved) => rows.reduce((n, s) => n + Number(s[key] ?? 0), 0);
  const avg = (key: "watchedSeconds" | "uniqueWatchedSeconds" | "maxReachedSecond") => sessions.length ? sessions.reduce((n, s) => n + s[key], 0) / sessions.length : 0;
  const maxSecond = Math.min(3600, Math.max(1, Math.ceil(Math.max(...ranges.map((r) => r.endMs), 0) / 1000)));
  const bucketSize = maxSecond > 900 ? 15 : 5;
  const bucketCount = Math.ceil(maxSecond / bucketSize);
  const covered = new Array(bucketCount).fill(null).map(() => new Set<string>());
  for (const range of ranges) {
    const first = Math.max(0, Math.floor(range.startMs / 1000 / bucketSize));
    const last = Math.min(bucketCount - 1, Math.ceil(range.endMs / 1000 / bucketSize) - 1);
    for (let i = first; i <= last; i++) for (const s of sessions) covered[i].add(s.id);
  }
  const retention = covered.map((ids, i) => ({ second: i * bucketSize, endSecond: Math.min(maxSecond, (i + 1) * bucketSize), percent: sessions.length ? ids.size / sessions.length * 100 : 0 }));
  return { filters: { from: filters.from.toISOString(), to: filters.to.toISOString() }, metrics: { uniqueVisitors, sessions: sessions.length, playerReady: eventCount("PLAYER_READY"), play: eventCount("PLAY"), pitch: sessions.filter((s) => s.pitchReachedAt).length, checkoutOpen: sessions.filter((s) => s.checkoutOpenedAt).length, checkoutClick: sessions.filter((s) => s.checkoutClickedAt).length, leads, approvedSales: approved.length, pendingSales: sales.filter((s) => s.status === "PENDING").length, grossRevenue: sum("grossAmount"), netRevenue: sum("netAmount"), averageTicket: approved.length ? sum("grossAmount") / approved.length : 0, averageWatched: avg("watchedSeconds"), averageUniqueWatched: avg("uniqueWatchedSeconds"), averageMaxReached: avg("maxReachedSecond"), pitchRetention: sessions.length ? sessions.filter((s) => s.maxReachedSecond >= 2034).length / sessions.length * 100 : 0 }, retention };
}

export async function academyCentralBreakdown(filters: AcademyCentralFilters) {
  const sessions = await prisma.academySession.findMany({ where: sessionWhere(filters), select: { id: true, visitorId: true, source: true, utmSource: true, utmCampaign: true, utmContent: true, campaignId: true, adsetId: true, adId: true, watchedSeconds: true, uniqueWatchedSeconds: true, maxReachedSecond: true, pitchReachedAt: true, checkoutOpenedAt: true, checkoutClickedAt: true } });
  const leads = await prisma.academyLead.findMany({ where: { sessionId: { in: sessions.map(s => s.id) } }, select: { sessionId: true } });
  const sales = await prisma.academySale.findMany({ where: { sessionId: { in: sessions.map(s => s.id) } }, select: { sessionId: true, status: true, grossAmount: true } });
  const groups = new Map<string, typeof sessions>();
  for (const s of sessions) { const key = s.campaignId || s.utmCampaign || s.source || "Não identificado"; groups.set(key, [...(groups.get(key) || []), s]); }
  return [...groups].map(([name, rows]) => { const ids = new Set(rows.map(r => r.id)); const ls = leads.filter(l => ids.has(l.sessionId)); const ss = sales.filter(s => s.sessionId !== null && ids.has(s.sessionId) && (s.status === "APPROVED" || s.status === "COMPLETED")); return { name, visitors: new Set(rows.map(r => r.visitorId)).size, sessions: rows.length, playerReady: 0, pitch: rows.filter(r => r.pitchReachedAt).length, leads: ls.length, checkoutOpen: rows.filter(r => r.checkoutOpenedAt).length, checkoutClick: rows.filter(r => r.checkoutClickedAt).length, sales: ss.length, revenue: ss.reduce((n, s) => n + Number(s.grossAmount || 0), 0), averageWatched: rows.reduce((n, r) => n + r.watchedSeconds, 0) / (rows.length || 1), averageUniqueWatched: rows.reduce((n, r) => n + r.uniqueWatchedSeconds, 0) / (rows.length || 1), averageMaxReached: rows.reduce((n, r) => n + r.maxReachedSecond, 0) / (rows.length || 1) }; });
}

export async function academyCentralLeads(filters: AcademyCentralFilters, search?: string) {
  return prisma.academyLead.findMany({ where: { createdAt: { gte: filters.from, lt: filters.to }, session: sessionWhere(filters), ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }, { phone: { contains: search } }] } : {}) }, include: { session: true, sales: true }, orderBy: { createdAt: "desc" }, take: 200 });
}
