import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma } from "../../src/lib/prisma";
import { startSession } from "../../src/lib/academy/sessions.server";
import { AcademyError, LIMITS } from "../../src/lib/academy/limits";
import { assertSessionContext, validateEvents, validateSession } from "../../src/lib/academy/validation";
import { eventMetrics, retainOneShotPitch, unionLength, watchMetrics } from "../../src/lib/academy/metrics";
import { eventPayloadHash, newEvents } from "../../src/lib/academy/idempotency";
import { bearerToken, isOpaqueToken, isSessionExpired, newOpaqueToken, tokenHash } from "../../src/lib/academy/identity.server";
import { academyError, assertCollectorOrigin, readLimitedJson } from "../../src/lib/academy/http.server";
import { buildCorretorAcademyCheckoutUrl, CORRETOR_ACADEMY } from "../../src/lib/academy/config";
import { normalizeEmail, normalizeName, normalizePhone } from "../../src/lib/academy/normalization";
import { HOTMART_STATUS_BY_EVENT, isHotmartPayload } from "../../src/lib/academy/hotmart.server";
import { POST as hotmartPost } from "../../src/app/api/academy/webhooks/hotmart/route";

const now = new Date("2026-09-15T12:00:30.000Z");
const range = {
  rangeKey: "range-1", startMs: 0, endMs: 30_000,
  observedStartAt: "2026-09-15T12:00:00.000Z", observedEndAt: now.toISOString(),
};
const progress = {
  eventKey: "event-1", sequence: 1, type: "PROGRESS", clientAt: now.toISOString(),
  positionSecond: 30, metadata: { player: "test" }, ranges: [range],
};
function parsed(overrides = {}) { return validateEvents({ events: [{ ...progress, ...overrides }] }, now)[0]; }
function fails(fn: () => unknown, status = 400) {
  assert.throws(fn, (error: unknown) => error instanceof AcademyError && error.status === status);
}
const initial = {
  currentSecond: 0, maxReachedSecond: 0, lastPositionSequence: -1,
  playStartedAt: null, pitchReachedAt: null, checkoutOpenedAt: null, checkoutClickedAt: null,
};

test("30 seconds plus seek to minute 20 is only 30 seconds watched", () => {
  const watched = parsed();
  const seek = parsed({ eventKey: "seek", sequence: 2, type: "SEEK", positionSecond: 1200, ranges: [] });
  assert.deepEqual(watchMetrics(watched.ranges), { watchedSeconds: 30, uniqueWatchedSeconds: 30 });
  const metrics = eventMetrics(initial, [watched, seek]);
  assert.equal(metrics.currentSecond, 1200);
  assert.equal(metrics.maxReachedSecond, 1200);
});

test("replaying content increases observed time, not unique coverage", () => {
  const first = parsed().ranges[0];
  const replay = { ...first, observedStartAt: now, observedEndAt: new Date(now.getTime() + 30_000) };
  assert.deepEqual(watchMetrics([first, replay]), { watchedSeconds: 60, uniqueWatchedSeconds: 30 });
});

test("overlapping observations cannot double count time or coverage", () => {
  const first = parsed().ranges[0];
  const overlap = { ...first, startMs: 15_000, endMs: 45_000,
    observedStartAt: new Date(now.getTime() - 15_000), observedEndAt: new Date(now.getTime() + 15_000) };
  assert.deepEqual(watchMetrics([first, overlap, first]), { watchedSeconds: 45, uniqueWatchedSeconds: 45 });
});

test("2x playback distinguishes clock time from content coverage", () => {
  const event = parsed({ positionSecond: 60, ranges: [{ ...range, endMs: 60_000 }] });
  assert.deepEqual(watchMetrics(event.ranges), { watchedSeconds: 30, uniqueWatchedSeconds: 60 });
});

test("out-of-order events do not rewind current position; max never decreases", () => {
  const latest = parsed({ eventKey: "new", sequence: 10, positionSecond: 20, ranges: [] });
  const older = parsed({ eventKey: "old", sequence: 5, positionSecond: 1200, ranges: [] });
  const metrics = eventMetrics(initial, [latest, older]);
  assert.equal(metrics.currentSecond, 20);
  assert.equal(metrics.maxReachedSecond, 1200);
  assert.equal(metrics.lastPositionSequence, 10);
});

test("interval union handles empty, disjoint, nested and touching ranges", () => {
  assert.equal(unionLength([]), 0);
  assert.equal(unionLength([{ start: 20, end: 30 }, { start: 0, end: 10 }, { start: 10, end: 20 }, { start: 5, end: 8 }]), 30);
  assert.equal(unionLength([{ start: 10, end: 20 }, { start: 40, end: 50 }]), 20);
});

test("milestones retain the earliest accepted client time", () => {
  const a = parsed({ type: "PLAY", ranges: [] });
  const b = { ...a, clientAt: new Date(now.getTime() - 1000) };
  const result = eventMetrics(eventMetrics(initial, [a]), [b]);
  assert.equal(result.playStartedAt?.toISOString(), b.clientAt.toISOString());
  assert.equal(result.pitchReachedAt, null);
});

test("pitch reached is one-shot per session and batch", () => {
  const events = [{ type: "PITCH_REACHED" }, { type: "PROGRESS" }, { type: "PITCH_REACHED" }];
  assert.deepEqual(retainOneShotPitch(events, false).map((event) => event.type), ["PITCH_REACHED", "PROGRESS"]);
  assert.deepEqual(retainOneShotPitch(events, true).map((event) => event.type), ["PROGRESS"]);
});

test("seek cannot carry ranges and impossible jumps are rejected", () => {
  fails(() => parsed({ type: "SEEK" }));
  fails(() => parsed({ ranges: [{ ...range, endMs: 1_200_000 }] }));
  fails(() => parsed({ ranges: [{ ...range, startMs: 40_000 }] }));
  fails(() => parsed({ ranges: [{ ...range, endMs: 0 }] }));
  fails(() => parsed({ ranges: [{ ...range, observedEndAt: range.observedStartAt }] }));
});

test("purchase, arbitrary session IDs and out-of-bound positions are rejected", () => {
  fails(() => parsed({ type: "PURCHASE" }));
  fails(() => parsed({ type: "purchase_approved" }));
  fails(() => parsed({ sessionId: "arbitrary" }));
  fails(() => parsed({ positionSecond: Infinity }));
  fails(() => parsed({ positionSecond: -1 }));
  fails(() => parsed({ positionSecond: LIMITS.maxVideoMs / 1000 + 1 }));
  fails(() => parsed({ positionSecond: null }));
});

test("batch size and uniqueness limits", () => {
  fails(() => validateEvents({ events: [] }, now));
  fails(() => validateEvents({ events: Array(21).fill(progress) }, now));
  fails(() => validateEvents({ events: [progress, progress] }, now));
  fails(() => validateEvents({ events: [progress, { ...progress, eventKey: "other" }] }, now));
  fails(() => parsed({ ranges: Array(21).fill(range).map((r, i) => ({ ...r, rangeKey: `r-${i}` })) }));
});

test("metadata rejects excessive size, depth and prototype-related keys", () => {
  fails(() => parsed({ metadata: { x: "a".repeat(1025) } }));
  fails(() => parsed({ metadata: { a: { b: { c: { d: true } } } } }));
  fails(() => parsed({ metadata: JSON.parse('{"__proto__":{}}') }));
  fails(() => parsed({ metadata: [] }));
  fails(() => parsed({ metadata: { invalid: NaN } }));
  let deep: unknown = true;
  for (let i = 0; i < 1000; i++) deep = { nested: deep };
  fails(() => parsed({ metadata: deep }));
});

test("dates require real canonical UTC instants within the acceptance window", () => {
  fails(() => parsed({ clientAt: "2026-02-30T12:00:30.000Z" }));
  fails(() => parsed({ clientAt: "2026-09-15" }));
  fails(() => parsed({ clientAt: new Date(now.getTime() + LIMITS.clockSkewMs + 1).toISOString() }));
  fails(() => parsed({ ranges: [{ ...range, observedEndAt: new Date(now.getTime() + 1).toISOString() }] }));
});

test("idempotency compares canonical payload, including ranges", () => {
  const event = parsed({ metadata: { a: 1, b: 2 } });
  const reordered = parsed({ metadata: { b: 2, a: 1 } });
  const persisted = [{ eventKey: event.eventKey, sequence: event.sequence, payloadHash: eventPayloadHash(event) }];
  assert.equal(eventPayloadHash(event), eventPayloadHash(reordered));
  assert.deepEqual(newEvents([reordered], persisted), []);
  fails(() => newEvents([{ ...event, positionSecond: 31 }], persisted), 409);
  fails(() => newEvents([{ ...event, ranges: [] }], persisted), 409);
  fails(() => newEvents([{ ...event, eventKey: "different" }], persisted), 409);
  assert.equal(newEvents([{ ...event, eventKey: "new", sequence: 2 }], persisted).length, 1);
});

test("origin data is bounded and URLs discard query parameters and fragments", () => {
  assert.deepEqual(validateSession({ funnelKey: "curso-1", attribution: {
    utmCampaign: " campaign ", landingPage: "https://flyimob.com/course?email=private#secret",
  } }), { funnelKey: "curso-1", vslKey: null, videoId: null, attribution: { utmCampaign: "campaign", landingPage: "https://flyimob.com/course" } });
  fails(() => validateSession({ funnelKey: "course", tenantId: "not-allowed" }));
  fails(() => validateSession({ funnelKey: "course", attribution: { referrer: "javascript:alert(1)" } }));
  fails(() => validateSession({ funnelKey: "course", attribution: { referrer: "https://user:pass@example.com" } }));
  fails(() => validateSession({ funnelKey: "../course" }));
});

test("tokens are opaque random credentials, hashes are not credentials", () => {
  const a = newOpaqueToken(); const b = newOpaqueToken();
  assert.ok(isOpaqueToken(a)); assert.notEqual(a, b);
  assert.equal(tokenHash(a).length, 64); assert.notEqual(tokenHash(a), a);
  assert.equal(isOpaqueToken(tokenHash(a)), false);
  assert.equal(bearerToken(new Request("https://flyimob.com", { headers: { authorization: `Bearer ${a}` } }), true), a);
  fails(() => bearerToken(new Request("https://flyimob.com"), true), 401);
  fails(() => bearerToken(new Request("https://flyimob.com", { headers: { authorization: "Bearer arbitrary-id" } }), true), 401);
});

test("session expiry has idle and absolute limits", () => {
  assert.equal(isSessionExpired({ lastActivityAt: now, expiresAt: new Date(now.getTime() + 1) }, now), false);
  assert.equal(isSessionExpired({ lastActivityAt: now, expiresAt: now }, now), true);
  assert.equal(isSessionExpired({ lastActivityAt: new Date(now.getTime() - LIMITS.idleMs), expiresAt: new Date(now.getTime() + 1000) }, now), true);
});

test("collector requires a matching Origin and rejects cross-site requests", () => {
  const previous = process.env.ACADEMY_ALLOWED_ORIGINS;
  process.env.ACADEMY_ALLOWED_ORIGINS = "https://flyimob.com";
  try {
    assertCollectorOrigin(new Request("http://internal/api", { headers: { origin: "https://flyimob.com" } }));
    fails(() => assertCollectorOrigin(new Request("https://flyimob.com/api")), 403);
    fails(() => assertCollectorOrigin(new Request("https://flyimob.com/api", { headers: { origin: "https://attacker.test" } })), 403);
    fails(() => assertCollectorOrigin(new Request("https://flyimob.com/api", { headers: { origin: "https://flyimob.com", "sec-fetch-site": "cross-site" } })), 403);
  } finally {
    if (previous === undefined) delete process.env.ACADEMY_ALLOWED_ORIGINS;
    else process.env.ACADEMY_ALLOWED_ORIGINS = previous;
  }
});

test("JSON body limit applies even without Content-Length", async () => {
  const headers = { "content-type": "application/json" };
  assert.deepEqual(await readLimitedJson(new Request("https://flyimob.com", { method: "POST", headers, body: '{"ok":true}' })), { ok: true });
  for (const request of [
    new Request("https://flyimob.com", { method: "POST", headers, body: '"' + "x".repeat(LIMITS.bodyBytes) + '"' }),
    new Request("https://flyimob.com", { method: "POST", headers: { ...headers, "content-length": String(LIMITS.bodyBytes + 1) }, body: "{}" }),
  ]) await assert.rejects(readLimitedJson(request), (error: unknown) => error instanceof AcademyError && error.status === 413);
  await assert.rejects(readLimitedJson(new Request("https://flyimob.com", { method: "POST", headers, body: "{" })), (error: unknown) => error instanceof AcademyError && error.status === 400);
  await assert.rejects(readLimitedJson(new Request("https://flyimob.com", { method: "POST", body: "{}" })), (error: unknown) => error instanceof AcademyError && error.status === 415);
});

test("error responses do not cache collector results", async () => {
  const response = academyError(new AcademyError(409, "event_key_conflict"));
  assert.equal(response.status, 409);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { ok: false, error: "event_key_conflict" });
});

test("Google attribution IDs are optional opaque bounded strings", () => {
  const attribution = { gclid: "AbC-123_X", wbraid: "braid-1", gbraid: "braid-2" };
  assert.deepEqual(validateSession({ funnelKey: "course", attribution }).attribution, attribution);
  for (const field of ["gclid", "wbraid", "gbraid"]) {
    assert.equal(validateSession({ funnelKey: "course", attribution: { [field]: "x".repeat(500) } }).attribution[field as keyof typeof attribution]?.length, 500);
    fails(() => validateSession({ funnelKey: "course", attribution: { [field]: "x".repeat(501) } }));
    fails(() => validateSession({ funnelKey: "course", attribution: { [field]: 123 } }));
    fails(() => validateSession({ funnelKey: "course", attribution: { [field]: "x\n" } }));
  }
});

test("VSL context is optional, bounded and immutable on resume", () => {
  const input = validateSession({ funnelKey: "course", vslKey: "course-v2", videoId: "video-123" });
  assertSessionContext(input, { ...input, attribution: { gclid: "new-source" } });
  fails(() => assertSessionContext(input, { ...input, vslKey: "course-v3" }), 409);
  fails(() => assertSessionContext(input, { ...input, videoId: "different" }), 409);
  fails(() => assertSessionContext(input, { ...input, funnelKey: "other" }), 409);
  fails(() => assertSessionContext(input, validateSession({ funnelKey: "course" })), 409);
  const unknown = validateSession({ funnelKey: "course" });
  assertSessionContext(unknown, unknown);
  fails(() => assertSessionContext(unknown, input), 409);
  fails(() => validateSession({ funnelKey: "course", vslKey: "x".repeat(81) }));
  fails(() => validateSession({ funnelKey: "course", videoId: "x".repeat(201) }));
  fails(() => validateSession({ funnelKey: "course", videoId: "https://example.com/video" }));
});

test("checkout open and click maintain independent first timestamps", () => {
  const open = parsed({ type: "CHECKOUT_OPEN", positionSecond: null, ranges: [] });
  const clickedAt = new Date(now.getTime() - 1000);
  const click = parsed({ eventKey: "click", sequence: 2, type: "CHECKOUT_CLICK", clientAt: clickedAt.toISOString(), positionSecond: null, ranges: [] });
  const opened = eventMetrics(initial, [open]);
  assert.equal(opened.checkoutOpenedAt?.getTime(), now.getTime());
  assert.equal(opened.checkoutClickedAt, null);
  const result = eventMetrics(opened, [click, { ...open, clientAt: new Date(now.getTime() + 1000) }]);
  assert.equal(result.checkoutOpenedAt?.getTime(), now.getTime());
  assert.equal(result.checkoutClickedAt?.getTime(), clickedAt.getTime());
  assert.equal(eventMetrics(initial, [click]).checkoutOpenedAt, null);
  const persisted = [{ eventKey: open.eventKey, sequence: open.sequence, payloadHash: eventPayloadHash(open) }];
  assert.equal(newEvents([open], persisted).length, 0);
  fails(() => newEvents([{ ...open, type: "CHECKOUT_CLICK" }], persisted), 409);
  fails(() => parsed({ type: "CHECKOUT_OPEN" })); // Ranges cannot accompany opening.
});

test("session service persists snapshots only on create, with a mocked transaction and no database", async () => {
  const visitorToken = newOpaqueToken();
  const collectorToken = newOpaqueToken();
  const input = validateSession({ funnelKey: "course", vslKey: "v1", videoId: "video1", attribution: {
    gclid: "first-gclid", wbraid: "first-wbraid", gbraid: "first-gbraid",
  } });
  const stored = { id: "session1", visitorId: "visitor1", ...input, ...input.attribution,
    lastActivityAt: new Date(), expiresAt: new Date(Date.now() + 60_000) };
  const updates: Record<string, unknown>[] = [];
  const creates: Record<string, unknown>[] = [];
  const fakeTx = {
    academyVisitor: {
      findUnique: async () => ({ id: "visitor1" }),
      update: async () => ({ id: "visitor1" }),
    },
    academySession: {
      findUnique: async () => stored,
      update: async ({ data }: { data: Record<string, unknown> }) => { updates.push(data); return stored; },
      create: async ({ data }: { data: Record<string, unknown> }) => { creates.push(data); return { id: "new-session", ...data }; },
    },
    academyEvent: { findFirst: async () => null },
  };
  const originalTransaction = prisma.$transaction;
  const transaction = (async (work: unknown) => {
    assert.equal(typeof work, "function");
    return (work as (tx: unknown) => Promise<unknown>)(fakeTx);
  }) as typeof prisma.$transaction;
  prisma.$transaction = transaction;
  try {
    assert.equal(prisma.$transaction, transaction); // Fail before any call if the stub was not installed.
    await startSession(input, visitorToken, null);
    assert.equal(creates[0].vslKey, "v1");
    assert.equal(creates[0].videoId, "video1");
    assert.equal(creates[0].gclid, "first-gclid");
    assert.equal(creates[0].wbraid, "first-wbraid");
    assert.equal(creates[0].gbraid, "first-gbraid");
    const resumed = await startSession({ ...input, attribution: { gclid: "replacement", wbraid: "replacement", gbraid: "replacement" } }, visitorToken, collectorToken);
    assert.equal(resumed.resumed, true);
    assert.deepEqual(Object.keys(updates[0]), ["lastActivityAt"]);
    assert.equal(creates.length, 1);
    await assert.rejects(startSession({ ...input, videoId: "video2" }, visitorToken, collectorToken),
      (error: unknown) => error instanceof AcademyError && error.code === "vsl_context_mismatch");
    assert.equal(updates.length, 1);
    assert.equal(creates.length, 1);
  } finally { prisma.$transaction = originalTransaction; }
});

test("Corretor Academy configuration builds only the official checkout URLs", () => {
  assert.equal(CORRETOR_ACADEMY.funnelKey, "corretor-academy");
  assert.equal(CORRETOR_ACADEMY.vslKey, "corretor-academy-v1");
  assert.equal(CORRETOR_ACADEMY.videoId, "6aa950430492aa379514a80b");
  assert.equal(CORRETOR_ACADEMY.pitchSecond, 2034);
  assert.equal(buildCorretorAcademyCheckoutUrl(false), "https://pay.hotmart.com/C13699064X?off=a2itt7gi");
  assert.equal(buildCorretorAcademyCheckoutUrl(true), "https://pay.hotmart.com/C13699064X?off=a2itt7gi&offDiscount=PONTE");
});

test("lead normalization is stable and phone retains only digits", () => {
  assert.equal(normalizeName("  Ana   Maria  "), "Ana Maria");
  assert.equal(normalizeEmail("  ANA@Example.COM "), "ana@example.com");
  assert.equal(normalizePhone("+55 (62) 99999-0000"), "5562999990000");
  fails(() => normalizeName("A"));
  fails(() => normalizeEmail("invalid"));
  fails(() => normalizePhone("123"));
});

test("Hotmart 2.0 payload and configured event mapping are strict", () => {
  const payload = { id: "evt-1", creation_date: Date.now(), event: "PURCHASE_APPROVED", version: "2.0.0", data: { product: { id: "C13699064X" }, buyer: {}, purchase: { transaction: "HP-1" } } };
  assert.equal(isHotmartPayload(payload), true);
  assert.equal(HOTMART_STATUS_BY_EVENT.PURCHASE_APPROVED, "APPROVED");
  assert.equal(HOTMART_STATUS_BY_EVENT.PURCHASE_BILLET_PRINTED, "PENDING");
  assert.equal(isHotmartPayload({ ...payload, version: "1.0.0" }), false);
});

test("Hotmart webhook rejects invalid Hottok before payload processing", async () => {
  const previous = process.env.HOTMART_HOTTOK;
  process.env.HOTMART_HOTTOK = "test-secret";
  try {
    const response = await hotmartPost(new Request("https://flyimob.com/api/academy/webhooks/hotmart", { method: "POST", headers: { "content-type": "application/json", "x-hotmart-hottok": "wrong" }, body: "{}" }));
    assert.equal(response.status, 401);
  } finally {
    if (previous === undefined) delete process.env.HOTMART_HOTTOK; else process.env.HOTMART_HOTTOK = previous;
  }
});
