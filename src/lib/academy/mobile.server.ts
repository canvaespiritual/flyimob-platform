import { prisma } from "@/lib/prisma";
import { CORRETOR_ACADEMY } from "./config";
import { saoPauloDay } from "./push-policy";

const sessionSelect = {
  source: true, utmSource: true, utmCampaign: true, campaignId: true, adId: true, utmContent: true,
  watchedSeconds: true, uniqueWatchedSeconds: true, checkoutClickedAt: true,
  events: { where: { type: "CHECKOUT_CLICK" as const }, select: { receivedAt: true }, orderBy: { receivedAt: "desc" as const }, take: 1 },
} as const;

export async function mobileOverview() {
  const { day, from, to } = saoPauloDay();
  const sessionWhere = { funnelKey: CORRETOR_ACADEMY.funnelKey, startedAt: { gte: from, lt: to } };
  const salesWhere = {
    offerId: CORRETOR_ACADEMY.offerId,
    status: { in: ["APPROVED", "COMPLETED"] as ("APPROVED" | "COMPLETED")[] },
    OR: [
      { approvedAt: { gte: from, lt: to } },
      { approvedAt: null, webhooks: { some: {
        processingStatus: "PROCESSED" as const, eventType: { in: ["PURCHASE_APPROVED", "PURCHASE_COMPLETE"] },
        receivedAt: { gte: from, lt: to },
      } } },
    ],
  };
  const [visitors, ready, started, pitch, checkouts, sales, recentLeads, recentSales] = await Promise.all([
    prisma.academySession.groupBy({ by: ["visitorId"], where: sessionWhere }),
    prisma.academySession.count({ where: { ...sessionWhere, events: { some: { type: "PLAYER_READY" } } } }),
    prisma.academySession.count({ where: { ...sessionWhere, OR: [{ playStartedAt: { not: null } }, { watchRanges: { some: {} } }] } }),
    prisma.academySession.count({ where: { ...sessionWhere, pitchReachedAt: { not: null } } }),
    prisma.academySession.count({ where: {
      funnelKey: CORRETOR_ACADEMY.funnelKey, events: { some: { type: "CHECKOUT_CLICK", receivedAt: { gte: from, lt: to } } }, leads: { some: {} },
    } }),
    prisma.academySale.findMany({ where: salesWhere, select: { grossAmount: true, currency: true } }),
    prisma.academyLead.findMany({
      where: { session: { funnelKey: CORRETOR_ACADEMY.funnelKey, checkoutClickedAt: { not: null } } },
      select: { id: true, name: true, email: true, phone: true, createdAt: true, session: { select: sessionSelect },
        sales: { select: { status: true }, where: { status: { in: ["APPROVED", "COMPLETED"] } } } },
      orderBy: { createdAt: "desc" }, take: 30,
    }),
    prisma.academySale.findMany({
      where: { offerId: CORRETOR_ACADEMY.offerId },
      select: { id: true, buyerName: true, status: true, grossAmount: true, currency: true, approvedAt: true, createdAt: true,
        session: { select: sessionSelect } },
      orderBy: { createdAt: "desc" }, take: 30,
    }),
  ]);
  // Do not sum incompatible currencies or treat missing amounts as actual zero sales.
  const revenue: Record<string, number> = {};
  for (const sale of sales) {
    if (sale.grossAmount !== null && sale.currency) revenue[sale.currency] = (revenue[sale.currency] || 0) + Number(sale.grossAmount);
  }
  const feed = [
    ...recentLeads.filter((lead) => lead.session.events[0]?.receivedAt >= lead.createdAt).map((lead) => ({
      id: lead.id, kind: "checkout" as const, name: lead.name, at: lead.session.events[0].receivedAt.toISOString(),
      phone: lead.phone, email: lead.email, session: lead.session,
      status: lead.sales.length ? "Convertido" : "Aguardando compra", amount: null, currency: null,
    })),
    ...recentSales.map((sale) => ({
      id: sale.id, kind: "sale" as const, name: sale.buyerName || "Comprador", at: (sale.approvedAt || sale.createdAt).toISOString(),
      phone: null, email: null, session: sale.session, status: sale.status,
      amount: sale.grossAmount?.toString() ?? null, currency: sale.currency,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);
  return {
    day, refreshedAt: new Date().toISOString(),
    metrics: { visitors: visitors.length, started, ready, pitch, checkouts, sales: sales.length, revenue }, feed,
  };
}

export type MobileOverview = Awaited<ReturnType<typeof mobileOverview>>;
