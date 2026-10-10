import { requestContext } from "../documentacoes/request-context";
import assert from "node:assert/strict";
import { test } from "node:test";
import { generateKeyPairSync, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { assertionHeaders, signatureMessage, validateCourseIds } from "../../src/lib/training/contract";
import { prisma } from "../../src/lib/prisma";
import { operate, setAccess } from "../../src/lib/training/service.server";
import { exchange } from "../../src/lib/training/horizonte.server";
import { assertTrainingOrigin } from "../../src/lib/training/http.server";
import { createSessionToken } from "../../src/lib/auth.server";
import { GET as coursesGet } from "../../src/app/api/training/courses/route";
import { PUT as accessPut } from "../../src/app/api/admin/training/access/route";

test("exchange signature matches Horizonte exact-byte contract and rejects tampering", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const body = JSON.stringify({ subject: "tenant:broker", name: "Teste", courses: [] });
  const headers = assertionHeaders(body, "local-test", privateKey.export({ type: "pkcs8", format: "pem" }).toString());
  const message = signatureMessage(body, headers["x-horizonte-timestamp"], headers["x-horizonte-nonce"]);
  assert.equal(message.endsWith("\n"), false);
  assert.match(headers["x-horizonte-nonce"], /^[\w-]{16,100}$/);
  assert.equal(verify(null, Buffer.from(message), publicKey, Buffer.from(headers["x-horizonte-signature"], "base64url")), true);
  assert.equal(verify(null, Buffer.from(signatureMessage(body + " ", headers["x-horizonte-timestamp"], headers["x-horizonte-nonce"])), publicKey, Buffer.from(headers["x-horizonte-signature"], "base64url")), false);
});
test("course assignments reject duplicates, unknown IDs and non-array bodies", () => {
  assert.deepEqual(validateCourseIds([], ["c1"]), []);
  assert.deepEqual(validateCourseIds(["c1"], ["c1"]), ["c1"]);
  for (const input of [["c1", "c1"], ["c2"], null, "c1", [1]]) assert.throws(() => validateCourseIds(input, ["c1"]));
});
test("local access enforces tenant, broker role, lock and deny before remote fetch", async () => {
  const original = prisma.$transaction, originalFetch = globalThis.fetch;
  let calls = 0, lock = false;
  globalThis.fetch = async () => { calls++; throw new Error("unexpected network"); };
  const fake = { $executeRaw: async () => { lock = true; }, user: { findFirst: async ({ where }: { where: Record<string, unknown> }) => { assert.deepEqual(where, { id: "b1", tenantId: "t1", role: "BROKER", isActive: true }); return { id: "b1" }; } }, trainingAccess: { findUnique: async () => ({ courseIds: [], syncPending: false }) } };
  prisma.$transaction = (async (fn: (tx: unknown) => unknown) => fn(fake)) as typeof original;
  try {
    assert.deepEqual(await operate({ id: "b1", tenantId: "t1", name: "Broker" }, "courses"), { data: [] });
    await assert.rejects(operate({ id: "b1", tenantId: "t1", name: "Broker" }, "playback", "l1"), /access_revoked/);
    assert.equal(lock, true); assert.equal(calls, 0);
  } finally { prisma.$transaction = original; globalThis.fetch = originalFetch; }
});
test("revocation remains locally committed and pending on upstream outage", async () => {
  const original = prisma.$transaction, oldEnabled = process.env.HORIZONTE_ENABLED;
  process.env.HORIZONTE_ENABLED = "false";
  let saved: unknown;
  const fake = { $executeRaw: async () => {}, user: { findFirst: async ({ where }: { where: Record<string, unknown> }) => { assert.equal(where.tenantId, "t1"); assert.equal(where.role, "BROKER"); return { id: "b1", tenantId: "t1", name: "Broker" }; } }, trainingAccess: { upsert: async ({ update }: { update: unknown }) => { saved = update; } } };
  prisma.$transaction = (async (fn: (tx: unknown) => unknown) => fn(fake)) as typeof original;
  try {
    assert.deepEqual(await setAccess({ id: "admin", tenantId: "t1", name: "Admin" }, "b1", []), { ok: true, syncPending: true });
    assert.deepEqual(saved, { tenantId: "t1", courseIds: [], updatedBy: "admin", syncPending: true });
    fake.user.findFirst = async () => null as never;
    await assert.rejects(setAccess({ id: "admin", tenantId: "t1", name: "Admin" }, "other-tenant", []), /broker_not_found/);
  } finally { prisma.$transaction = original; if (oldEnabled === undefined) delete process.env.HORIZONTE_ENABLED; else process.env.HORIZONTE_ENABLED = oldEnabled; }
});
test("service worker bypasses API/media and returns offline page for failed navigation", async () => {
  const handlers: Record<string, (event: any) => void> = {};
  let fetches = 0, response: Promise<unknown> | undefined;
  const cached = { offline: true };
  vm.runInNewContext(readFileSync("public/corretor-sw.js", "utf8"), {
    URL, self: { location: { origin: "https://flyimob.test" }, addEventListener: (name: string, fn: (e: any) => void) => { handlers[name] = fn; } },
    fetch: async () => { fetches++; throw new Error("offline"); }, caches: { open: async () => ({ match: async () => cached }) },
  });
  for (const url of ["https://flyimob.test/api/training/courses", "https://s3.test/video", "https://flyimob.test/api/documentacoes/file", "https://flyimob.test/academy-admin"]) {
    handlers.fetch({ request: { url, method: "GET", mode: "cors" }, respondWith: () => { throw new Error("sensitive request intercepted"); } });
  }
  handlers.fetch({ request: { url: "https://flyimob.test/admin", method: "GET", mode: "navigate" }, respondWith: (p: Promise<unknown>) => { response = p; } });
  assert.deepEqual(await response, cached); assert.equal(fetches, 1);
});

test("real route handlers reject anonymous, wrong role and cross-site mutation before writes", async () => {
  const oldSecret = process.env.SESSION_SECRET, oldFind = prisma.user.findFirst;
  process.env.SESSION_SECRET = "synthetic-local-training-session-secret";
  let role = "BROKER";
  prisma.user.findFirst = (async () => ({ id: "b1", tenantId: "t1", role, name: "Teste", email: "test@example.invalid", isActive: true, sessionVersion: 0, tenant: { id: "t1", slug: "test", name: "Test", isPlatform: false, parentId: null } })) as unknown as typeof oldFind;
  try {
    assert.equal((await requestContext(undefined, () => coursesGet(new Request("https://flyimob.test/api/training/courses")))).status, 401);
    const token = createSessionToken({ uid: "b1", tid: "t1", role: "BROKER", sv: 0 });
    role = "MANAGER";
    assert.equal((await requestContext(token, () => coursesGet(new Request("https://flyimob.test/api/training/courses")))).status, 403);
    role = "OWNER";
    const r = await requestContext(token, () => accessPut(new Request("https://flyimob.test/api/admin/training/access", { method: "PUT", headers: { Origin: "https://attacker.invalid", "Content-Type": "application/json" }, body: JSON.stringify({ brokerId: "b1", courseIds: [] }) })));
    assert.equal(r.status, 403); assert.equal(r.headers.get("cache-control"), "private, no-store");
  } finally { prisma.user.findFirst = oldFind; if (oldSecret === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = oldSecret; }
});

test("BFF forwards exact verified endpoints with server bearer and rejects unauthorized lesson", async () => {
  const original = prisma.$transaction, oldFetch = globalThis.fetch;
  const names = ["HORIZONTE_ENABLED", "HORIZONTE_ORIGIN", "HORIZONTE_CLIENT_ID", "HORIZONTE_PRIVATE_KEY"];
  const oldEnv = names.map(n => process.env[n]);
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  process.env.HORIZONTE_ENABLED = "true"; process.env.HORIZONTE_ORIGIN = "https://horizonte.test"; process.env.HORIZONTE_CLIENT_ID = "synthetic"; process.env.HORIZONTE_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const calls: string[] = [], token = "t".repeat(43);
  globalThis.fetch = async (url, init) => {
    const path = new URL(String(url)).pathname; calls.push(path);
    assert.equal(init?.cache, "no-store"); assert.equal(init?.redirect, "error");
    const headers = new Headers(init?.headers);
    if (path.endsWith("exchange")) {
      const body = String(init?.body), input = JSON.parse(body);
      assert.equal(input.subject, "t1:b1"); assert.deepEqual(input.courses.map((c: { id: string }) => c.id), ["c1"]);
      assert.ok(new Date(input.courses[0].expiresAt).getTime() - Date.now() < 86400000);
      assert.equal(verify(null, Buffer.from(signatureMessage(body, headers.get("x-horizonte-timestamp")!, headers.get("x-horizonte-nonce")!)), publicKey, Buffer.from(headers.get("x-horizonte-signature")!, "base64url")), true);
      return Response.json({ token, tokenType: "Bearer", expiresAt: new Date(Date.now() + 300000).toISOString() });
    }
    assert.equal(headers.get("authorization"), `Bearer ${token}`);
    if (path.endsWith("courses")) return Response.json({ data: [{ id: "c1", modules: [{ lessons: [{ id: "l1" }] }] }, { id: "unassigned", modules: [] }] });
    assert.equal(path, "/api/lessons/l1/playback"); assert.equal(init?.method, "POST");
    return Response.json({ source: "PRIVATE", url: "https://media.test/signed", sessionId: "s1", position: 34, revision: "v1", percent: 20 });
  };
  const fake = { $executeRaw: async () => {}, user: { findFirst: async () => ({ id: "b1" }) }, trainingAccess: { findUnique: async () => ({ courseIds: ["c1"], lastLessonId: "l1" }), update: async () => {} } };
  prisma.$transaction = (async (fn: (tx: unknown) => unknown) => fn(fake)) as typeof original;
  try {
    const result = await operate({ id: "b1", tenantId: "t1", name: "Broker" }, "playback", "l1");
    assert.equal((result as { position: number }).position, 34); assert.equal(JSON.stringify(result).includes(token), false);
    assert.deepEqual(calls, ["/api/integrations/v1/exchange", "/api/v1/courses", "/api/lessons/l1/playback"]);
    calls.length = 0;
    await assert.rejects(operate({ id: "b1", tenantId: "t1", name: "Broker" }, "playback", "other-course-lesson"), /access_revoked/);
    assert.equal(calls.some(c => c.includes("lessons")), false);
    const catalog = await operate({ id: "b1", tenantId: "t1", name: "Broker" }, "courses") as { data: { id: string }[] };
    assert.deepEqual(catalog.data.map(c => c.id), ["c1"]);
  } finally { prisma.$transaction = original; globalThis.fetch = oldFetch; names.forEach((name, i) => { if (oldEnv[i] === undefined) delete process.env[name]; else process.env[name] = oldEnv[i]; }); }
});

test("exchange rejects expired or long-lived bearers without exposing tokens", async () => {
  const oldFetch = globalThis.fetch;
  const names = ["HORIZONTE_ENABLED", "HORIZONTE_ORIGIN", "HORIZONTE_CLIENT_ID", "HORIZONTE_PRIVATE_KEY"], old = names.map(n => process.env[n]);
  const { privateKey } = generateKeyPairSync("ed25519");
  process.env.HORIZONTE_ENABLED = "true"; process.env.HORIZONTE_ORIGIN = "https://horizonte.test"; process.env.HORIZONTE_CLIENT_ID = "synthetic"; process.env.HORIZONTE_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  try {
    for (const expiresAt of [undefined, "invalid", new Date(Date.now() - 1000).toISOString(), new Date(Date.now() + 3600000).toISOString()]) {
      globalThis.fetch = async () => Response.json({ token: "x".repeat(43), tokenType: "Bearer", expiresAt });
      await assert.rejects(exchange({ id: "b1", tenantId: "t1", name: "Broker" }, ["c1"]), /invalid_response/);
    }
    globalThis.fetch = async () => Response.json({ token: "x".repeat(43), tokenType: "Bearer", expiresAt: new Date(Date.now() + 300000).toISOString() });
    assert.equal((await exchange({ id: "b1", tenantId: "t1", name: "Broker" }, ["c1"])).length, 43);
  } finally { globalThis.fetch = oldFetch; names.forEach((n, i) => { if (old[i] === undefined) delete process.env[n]; else process.env[n] = old[i]; }); }
});

test("public origin validation works behind Railway proxy without trusting forwarded host", () => {
  const valid = new Request("http://localhost:8080/api/training/lessons/l1/playback", { method: "POST", headers: { Origin: "https://flyimob.com", "Sec-Fetch-Site": "same-origin", "X-Forwarded-Host": "attacker.invalid" } });
  assert.doesNotThrow(() => assertTrainingOrigin(valid, "https://flyimob.com"));
  for (const origin of ["https://attacker.invalid", "http://localhost:8080", "null"]) {
    const request = new Request(valid.url, { method: "POST", headers: { Origin: origin, "X-Forwarded-Host": "flyimob.com" } });
    assert.throws(() => assertTrainingOrigin(request, "https://flyimob.com"), /origin/);
  }
  const crossSite = new Request(valid.url, { method: "POST", headers: { Origin: "https://flyimob.com", "Sec-Fetch-Site": "cross-site" } });
  assert.throws(() => assertTrainingOrigin(crossSite, "https://flyimob.com"), /origin/);
  assert.throws(() => assertTrainingOrigin(valid, "https://flyimob.com/path"), /configuration/);
});
