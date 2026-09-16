import { createHash } from "node:crypto";
import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { AcademyError } from "./limits";
import { academyAdminIds, duration, notificationKey, validPushEndpoint, validPushKeys } from "./push-policy";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
type Database = typeof prisma;
type Sender = typeof webpush.sendNotification;

export function pushConfiguration() {
  const publicKey = process.env.NEXT_PUBLIC_ACADEMY_VAPID_PUBLIC_KEY;
  const privateKey = process.env.ACADEMY_VAPID_PRIVATE_KEY;
  const subject = process.env.ACADEMY_VAPID_SUBJECT;
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

export async function subscribe(userId: string, body: unknown, db: Database = prisma) {
  const subscription = body as { endpoint?: unknown; keys?: unknown } | null;
  if (!subscription || !validPushEndpoint(subscription.endpoint) || !validPushKeys(subscription.keys)) {
    throw new AcademyError(400, "invalid_subscription");
  }
  const { endpoint, keys } = subscription;
  const endpointHash = hash(endpoint);
  // Ownership can be transferred on a shared device only by its current authenticated user.
  // Cancel old pending deliveries before resetting the subscription start time.
  await db.$transaction(async (tx) => {
    const previous = await tx.academyPushSubscription.findUnique({ where: { endpointHash } });
    if (previous && previous.userId === userId && previous.active && previous.p256dh === keys.p256dh && previous.auth === keys.auth) return;
    if (previous) await tx.academyPushDelivery.updateMany({
      where: { subscriptionId: previous.id, state: { in: ["PENDING", "SENDING"] } }, data: { state: "CANCELLED" },
    });
    await tx.academyPushSubscription.upsert({
      where: { endpointHash },
      create: { userId, endpointHash, endpoint, ...keys },
      update: { userId, endpoint, ...keys, active: true, subscribedAt: new Date() },
    });
  });
}

export async function unsubscribe(userId: string, endpoint: unknown, db: Database = prisma) {
  if (!validPushEndpoint(endpoint)) throw new AcademyError(400, "invalid_subscription");
  await db.academyPushSubscription.updateMany({ where: { endpointHash: hash(endpoint), userId }, data: { active: false } });
}

type Candidate = { id: string; sessionId: string; occurredAt: Date };

// Poll persisted facts only: the public collector, precheckout and Hotmart paths stay untouched.
export async function discoverNotifications(start: Date, db: Database = prisma) {
  const checkouts = await db.$queryRaw<Candidate[]>`
    SELECT l.id, l."sessionId", click."receivedAt" AS "occurredAt"
    FROM "AcademyLead" l JOIN "AcademySession" s ON s.id = l."sessionId"
    JOIN LATERAL (
      SELECT MIN(e."receivedAt") AS "receivedAt" FROM "AcademyEvent" e
      WHERE e."sessionId" = s.id AND e.type = 'CHECKOUT_CLICK' AND e."receivedAt" >= l."createdAt"
    ) click ON click."receivedAt" IS NOT NULL
    WHERE s."funnelKey" = 'corretor-academy'
      AND click."receivedAt" >= ${start}
      AND NOT EXISTS (SELECT 1 FROM "AcademyPushNotification" n WHERE n."eventKey" = 'checkout:' || s.id)
    ORDER BY click."receivedAt", l."createdAt", l.id LIMIT 100`;
  const sales = await db.$queryRaw<Candidate[]>`
    SELECT s.id, s."sessionId", MIN(w."receivedAt") AS "occurredAt"
    FROM "AcademySale" s JOIN "AcademyWebhookEvent" w ON w."saleId" = s.id
    WHERE s."status" IN ('APPROVED', 'COMPLETED')
      AND w."processingStatus" = 'PROCESSED'
      AND w."eventType" IN ('PURCHASE_APPROVED', 'PURCHASE_COMPLETE')
      AND s."offerId" = 'a2itt7gi'
      AND NOT EXISTS (SELECT 1 FROM "AcademyPushNotification" n WHERE n."eventKey" = 'sale:' || s.id)
    GROUP BY s.id HAVING MIN(w."receivedAt") >= ${start}
    ORDER BY MIN(w."receivedAt"), s.id LIMIT 100`;

  for (const [kind, rows] of [["checkout", checkouts], ["sale", sales]] as const) {
    for (const row of rows) {
      await db.$transaction(async (tx) => {
        const eventKey = notificationKey(kind, kind === "checkout" ? row.sessionId : row.id);
        const notice = await tx.academyPushNotification.upsert({
          where: { eventKey }, update: {},
          create: { eventKey, kind, sourceId: row.id, occurredAt: row.occurredAt },
        });
        const subscribers = await tx.academyPushSubscription.findMany({
          where: { active: true, userId: { in: academyAdminIds() }, subscribedAt: { lte: notice.occurredAt } }, select: { id: true },
        });
        if (subscribers.length) await tx.academyPushDelivery.createMany({
          data: subscribers.map((sub) => ({ notificationId: notice.id, subscriptionId: sub.id })), skipDuplicates: true,
        });
      });
    }
  }
}

const attributionSelect = { source: true, utmSource: true, utmCampaign: true, campaignId: true, adId: true, utmContent: true, watchedSeconds: true } as const;
function origin(session: { source: string | null; utmSource: string | null; utmCampaign: string | null; campaignId: string | null; adId: string | null; utmContent: string | null } | null) {
  return session ? [session.source || session.utmSource, session.utmCampaign || session.campaignId, session.adId || session.utmContent].filter(Boolean).join(" • ").slice(0, 180) : "";
}

async function payloadFor(notice: { id: string; kind: string; sourceId: string }, db: Database) {
  if (notice.kind === "checkout") {
    const lead = await db.academyLead.findUnique({ where: { id: notice.sourceId }, select: { name: true, session: { select: attributionSelect } } });
    if (!lead) return null;
    return { id: notice.id, title: "🔥 Novo checkout", body: [lead.name, "Corretor Academy", origin(lead.session), `Assistiu ${duration(lead.session.watchedSeconds)} antes do checkout`].filter(Boolean).join("\n") };
  }
  const sale = await db.academySale.findUnique({ where: { id: notice.sourceId }, select: { status: true, buyerName: true, grossAmount: true, currency: true, session: { select: attributionSelect } } });
  if (!sale || !["APPROVED", "COMPLETED"].includes(sale.status)) return null;
  const amount = sale.grossAmount === null ? "Valor não informado" : `${sale.currency || "Moeda não informada"} ${sale.grossAmount.toFixed(2)}`;
  return { id: notice.id, title: "💰 Venda aprovada", body: [sale.buyerName || "Comprador", "Corretor Academy", amount, origin(sale.session)].filter(Boolean).join("\n") };
}

export async function deliverNotifications(db: Database = prisma, sender: Sender = webpush.sendNotification) {
  const vapidDetails = pushConfiguration();
  if (!vapidDetails) return { sent: 0 };
  const now = new Date();
  await db.academyPushDelivery.updateMany({
    where: { state: "SENDING", claimedAt: { lt: new Date(now.getTime() - 600_000) } }, data: { state: "PENDING" },
  });
  const jobs = await db.academyPushDelivery.findMany({
    where: { state: "PENDING", nextAttemptAt: { lte: now }, attempts: { lt: 5 } },
    include: { notification: true, subscription: true }, orderBy: { nextAttemptAt: "asc" }, take: 30,
  });
  let sent = 0;
  for (const job of jobs) {
    const claimed = await db.academyPushDelivery.updateMany({
      where: { id: job.id, state: "PENDING" }, data: { state: "SENDING", claimedAt: now, attempts: { increment: 1 } },
    });
    if (!claimed.count) continue;
    try {
      // Recheck revocation after claiming, not just the stale job snapshot.
      const sub = await db.academyPushSubscription.findUnique({ where: { id: job.subscriptionId } });
      const account = sub ? await db.user.findUnique({ where: { id: sub.userId }, select: { id: true } }) : null;
      if (!sub?.active || !account || !academyAdminIds().includes(sub.userId) || !validPushEndpoint(sub.endpoint)) {
        await db.academyPushDelivery.update({ where: { id: job.id }, data: { state: "CANCELLED" } });
        continue;
      }
      const payload = await payloadFor(job.notification, db);
      if (!payload) {
        await db.academyPushDelivery.update({ where: { id: job.id }, data: { state: "CANCELLED" } });
        continue;
      }
      await sender({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), {
        vapidDetails, TTL: 3600, timeout: 8000, topic: hash(job.notificationId).slice(0, 32),
      });
      await db.academyPushDelivery.update({ where: { id: job.id }, data: { state: "SENT", sentAt: new Date(), lastStatus: 201 } });
      sent++;
    } catch (error) {
      const status = typeof error === "object" && error !== null && "statusCode" in error ? Number(error.statusCode) : null;
      const invalid = status === 404 || status === 410;
      if (invalid) await db.academyPushSubscription.update({ where: { id: job.subscriptionId }, data: { active: false } });
      const retry = !invalid && (status === null || status === 429 || status >= 500) && job.attempts + 1 < 5;
      await db.academyPushDelivery.update({ where: { id: job.id }, data: {
        state: retry ? "PENDING" : "FAILED", lastStatus: Number.isFinite(status) ? status : null,
        nextAttemptAt: new Date(Date.now() + 60_000 * 2 ** job.attempts),
      } });
    }
  }
  return { sent };
}

export async function runPushWorker() {
  const start = new Date(process.env.ACADEMY_PUSH_START_AT ?? "");
  if (!pushConfiguration() || !Number.isFinite(start.getTime()) || !academyAdminIds().length) {
    throw new AcademyError(503, "push_not_configured");
  }
  await discoverNotifications(start);
  return deliverNotifications();
}

export async function testNotification(userId: string, endpoint: unknown, kind: unknown) {
  if (!validPushEndpoint(endpoint) || (kind !== "checkout" && kind !== "sale")) throw new AcademyError(400, "invalid_payload");
  const vapidDetails = pushConfiguration();
  if (!vapidDetails) throw new AcademyError(503, "push_not_configured");
  const sub = await prisma.academyPushSubscription.findFirst({ where: { endpointHash: hash(endpoint), userId, active: true } });
  if (!sub) throw new AcademyError(404, "subscription_not_found");
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({
      id: `test-${kind}-${Date.now()}`, title: kind === "checkout" ? "🧪 Teste de checkout" : "🧪 Teste de venda",
      body: "Pessoa fictícia · Corretor Academy\nTeste técnico. Nenhum lead ou venda foi criado.",
    }), { vapidDetails, TTL: 60, timeout: 8000 });
  } catch (error) {
    const status = typeof error === "object" && error !== null && "statusCode" in error ? Number(error.statusCode) : null;
    if (status === 404 || status === 410) await prisma.academyPushSubscription.update({ where: { id: sub.id }, data: { active: false } });
    throw new AcademyError(502, "test_push_failed");
  }
}
