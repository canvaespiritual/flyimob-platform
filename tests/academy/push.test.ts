import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import webpush from "web-push";
import { prisma } from "../../src/lib/prisma";
import { subscribe, unsubscribe, discoverNotifications, deliverNotifications } from "../../src/lib/academy/push.server";
import { isAcademyAdmin, notificationKey, saoPauloDay, validPushEndpoint, validPushKeys } from "../../src/lib/academy/push-policy";
import { POST as workerPost } from "../../src/app/api/admin/academy/push/dispatch/route";

const vapid = webpush.generateVAPIDKeys();
const endpoint = "https://fcm.googleapis.com/fcm/send/synthetic-academy-test";
const keys = { p256dh: vapid.publicKey, auth: Buffer.alloc(16, 5).toString("base64url") };

test("subscription validation rejects local/private/custom destinations and malformed keys", () => {
  assert.equal(validPushEndpoint(endpoint), true);
  assert.equal(validPushEndpoint("https://web.push.apple.com/test"), true);
  assert.equal(validPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/test"), true);
  for (const url of ["http://fcm.googleapis.com/test", "https://127.0.0.1/test", "https://localhost/test", "https://fcm.googleapis.com.evil.test/test", "https://user:pass@fcm.googleapis.com/test", "https://fcm.googleapis.com:8080/test"]) assert.equal(validPushEndpoint(url), false);
  assert.equal(validPushKeys(keys), true);
  assert.equal(validPushKeys({ ...keys, auth: "invalid" }), false);
});

test("same subscription is idempotent and unsubscribe is scoped to its owner", async () => {
  let record: Record<string, unknown> | null = null;
  let creates = 0;
  const tx = {
    academyPushSubscription: {
      findUnique: async () => record,
      upsert: async ({ create }: { create: Record<string, unknown> }) => { creates++; record = { ...create, active: true, id: "sub1" }; },
      updateMany: async ({ where }: { where: { userId: string } }) => { if (record?.userId === where.userId) record.active = false; },
    },
    academyPushDelivery: { updateMany: async () => ({ count: 0 }) },
  };
  const db = { ...tx, $transaction: async (work: (client: typeof tx) => unknown) => work(tx) } as unknown as typeof prisma;
  await subscribe("admin1", { endpoint, keys }, db);
  await subscribe("admin1", { endpoint, keys }, db);
  assert.equal(creates, 1);
  await unsubscribe("other-user", endpoint, db);
  assert.equal((record as unknown as { active: boolean }).active, true);
  await unsubscribe("admin1", endpoint, db);
  assert.equal((record as unknown as { active: boolean }).active, false);
});

test("admin access is explicit and independent of tenant; dates use São Paulo day", () => {
  const previous = process.env.ACADEMY_ADMIN_USER_IDS;
  process.env.ACADEMY_ADMIN_USER_IDS = "admin1, admin2";
  try { assert.equal(isAcademyAdmin("admin1"), true); assert.equal(isAcademyAdmin("tenant-owner"), false); }
  finally { if (previous === undefined) delete process.env.ACADEMY_ADMIN_USER_IDS; else process.env.ACADEMY_ADMIN_USER_IDS = previous; }
  const day = saoPauloDay(new Date("2026-09-16T02:59:59Z"));
  assert.equal(day.day, "2026-09-15");
  assert.equal(day.from.toISOString(), "2026-09-15T03:00:00.000Z");
  assert.equal(day.to.toISOString(), "2026-09-16T03:00:00.000Z");
});

test("discovery deduplicates checkouts by session and sales by sale across cycles", async () => {
  const notices = new Map<string, { id: string; occurredAt: Date }>();
  const deliveries = new Set<string>();
  const occurredAt = new Date();
  let query = 0;
  const tx = {
    academyPushNotification: { upsert: async ({ where }: { where: { eventKey: string } }) => {
      if (!notices.has(where.eventKey)) notices.set(where.eventKey, { id: where.eventKey, occurredAt });
      return notices.get(where.eventKey);
    } },
    academyPushSubscription: { findMany: async () => [{ id: "sub1" }] },
    academyPushDelivery: { createMany: async ({ data, skipDuplicates }: { data: { notificationId: string; subscriptionId: string }[]; skipDuplicates: boolean }) => {
      assert.equal(skipDuplicates, true);
      for (const entry of data) deliveries.add(`${entry.notificationId}/${entry.subscriptionId}`);
    } },
  };
  const db = { ...tx,
    $queryRaw: async () => ++query % 2 ? [{ id: "lead1", sessionId: "s1", occurredAt }, { id: "lead2", sessionId: "s1", occurredAt }] : [{ id: "sale1", occurredAt }],
    $transaction: async (work: (client: typeof tx) => unknown) => work(tx),
  } as unknown as typeof prisma;
  await discoverNotifications(new Date(0), db);
  await discoverNotifications(new Date(0), db);
  assert.equal(notices.size, 2);
  assert.equal(deliveries.size, 2);
  assert.equal(notificationKey("sale", "sale1"), "sale:sale1");
});

function deliveryFixture(kind: "checkout" | "sale") {
  const job = { id: "job1", state: "PENDING", attempts: 0, notificationId: "notice1", subscriptionId: "sub1",
    notification: { id: "notice1", kind, sourceId: `${kind}1` },
  };
  const sub = { id: "sub1", active: true, userId: "admin1", endpoint, ...keys };
  const tx = {
    user: { findUnique: async () => ({ id: "admin1" }) },
    academyPushDelivery: {
      findMany: async () => job.state === "PENDING" ? [{ ...job }] : [],
      updateMany: async ({ where, data }: { where: { id?: string }; data: { state: string } }) => {
        if (!where.id || job.state !== "PENDING") return { count: 0 };
        job.state = data.state; return { count: 1 };
      },
      update: async ({ data }: { data: { state: string } }) => { job.state = data.state; },
    },
    academyPushSubscription: { findUnique: async () => sub, update: async () => { sub.active = false; } },
    academyLead: { findUnique: async () => ({ name: "Teste Sintético", session: { source: "Meta", utmSource: null, campaignId: "test", utmCampaign: null, adId: null, utmContent: null, watchedSeconds: 2052 } }) },
    academySale: { findUnique: async () => ({ status: "COMPLETED", buyerName: "Teste Sintético", grossAmount: { toFixed: () => "99.00" }, currency: "BRL", session: null }) },
  };
  return { db: tx as unknown as typeof prisma, job, sub };
}

async function withConfiguration(work: () => Promise<void>) {
  const saved = { ...process.env };
  Object.assign(process.env, { NEXT_PUBLIC_ACADEMY_VAPID_PUBLIC_KEY: vapid.publicKey, ACADEMY_VAPID_PRIVATE_KEY: vapid.privateKey, ACADEMY_VAPID_SUBJECT: "mailto:test@example.com", ACADEMY_ADMIN_USER_IDS: "admin1" });
  try { await work(); } finally {
    for (const key of ["NEXT_PUBLIC_ACADEMY_VAPID_PUBLIC_KEY", "ACADEMY_VAPID_PRIVATE_KEY", "ACADEMY_VAPID_SUBJECT", "ACADEMY_ADMIN_USER_IDS"]) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  }
}

for (const kind of ["checkout", "sale"] as const) {
  test(`synthetic ${kind} uses real VAPID encryption and sends once, without commercial writes`, async () => withConfiguration(async () => {
    const fixture = deliveryFixture(kind);
    let sends = 0;
    const sender = (async (subscription, body, options) => {
      sends++;
      assert.ok(typeof body === "string");
      const request = webpush.generateRequestDetails(subscription, body, options);
      assert.ok(request.headers.Authorization || request.headers.authorization);
      assert.ok(Buffer.isBuffer(request.body));
      assert.ok(body?.includes(kind === "checkout" ? "Novo checkout" : "Venda aprovada"));
      return { statusCode: 201, body: "", headers: {} };
    }) as typeof webpush.sendNotification;
    await deliverNotifications(fixture.db, sender);
    await deliverNotifications(fixture.db, sender);
    assert.equal(sends, 1);
    assert.equal(fixture.job.state, "SENT");
  }));
}

test("concurrent workers claim a delivery only once", async () => withConfiguration(async () => {
  const fixture = deliveryFixture("sale");
  let sends = 0;
  const sender = (async () => { sends++; return { statusCode: 201, body: "", headers: {} }; }) as typeof webpush.sendNotification;
  await Promise.all([deliverNotifications(fixture.db, sender), deliverNotifications(fixture.db, sender)]);
  assert.equal(sends, 1);
}));

test("410 disables subscription; transient failure schedules retry without escaping", async () => withConfiguration(async () => {
  for (const statusCode of [410, 503]) {
    const fixture = deliveryFixture("checkout");
    await deliverNotifications(fixture.db, (async () => { throw { statusCode }; }) as typeof webpush.sendNotification);
    assert.equal(fixture.job.state, statusCode === 410 ? "FAILED" : "PENDING");
    assert.equal(fixture.sub.active, statusCode !== 410);
  }
}));

test("worker endpoint rejects unauthenticated invocation", async () => {
  const previous = process.env.ACADEMY_PUSH_WORKER_SECRET;
  process.env.ACADEMY_PUSH_WORKER_SECRET = "x".repeat(40);
  try { assert.equal((await workerPost(new Request("https://example.com/api/admin/academy/push/dispatch", { method: "POST" }))).status, 401); }
  finally { if (previous === undefined) delete process.env.ACADEMY_PUSH_WORKER_SECRET; else process.env.ACADEMY_PUSH_WORKER_SECRET = previous; }
});

test("push cannot fail precheckout/webhook because commercial handlers and services have no push dependency", () => {
  for (const path of ["src/app/api/academy/precheckout/route.ts", "src/app/api/academy/webhooks/hotmart/route.ts", "src/lib/academy/leads.server.ts", "src/lib/academy/hotmart.server.ts"]) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /push\.server|runPushWorker|deliverNotifications/);
  }
});

test("manifest has install metadata, icons exist and service worker keeps private data uncached", () => {
  const manifest = JSON.parse(readFileSync("public/academy-admin/manifest.webmanifest", "utf8"));
  assert.equal(manifest.start_url, "/academy-admin");
  assert.equal(manifest.scope, "/academy-admin");
  assert.equal(manifest.display, "standalone");
  for (const icon of manifest.icons) assert.ok(readFileSync(`public${icon.src}`).length > 100);
  const sw = readFileSync("public/academy-admin-sw.js", "utf8");
  assert.doesNotMatch(sw, /caches\.(open|put|add)/);
  assert.match(sw, /claimNotification\(message.id\)/);
});
