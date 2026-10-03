import { requestContext } from "./request-context";
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import { hashPassword, verifyPassword, createSessionToken, verifySessionToken } from "../../src/lib/auth.server";
import { sessionAuthorizesUser, safeReturnTo, postAuthDestination } from "../../src/lib/auth-policy";
import { getSessionUser } from "../../src/lib/session.server";
import { hasPermission } from "../../src/lib/rbac";
import { documentationFolderScope } from "../../src/lib/documentacoes/access-policy";
import { POST as login } from "../../src/app/api/auth/login/route";
import { POST as uploadAttachment } from "../../src/app/api/empreendimentos/anexos/upload/route";
import { POST as uploadPhotos } from "../../src/app/api/empreendimentos/fotos/upload/route";
import { POST as updateBuilder } from "../../src/app/api/construtoras/update/route";
import { POST as createCorrespondent } from "../../src/app/api/documentacoes/correspondentes/route";
import AdminLayout from "../../src/app/admin/layout";
import CorrespondentePage from "../../src/app/correspondente/page";
import { getFinanceApiSession } from "../../src/lib/financeiro/access.server";
import { requirePermission } from "../../src/lib/authz.server";
import { academyAdmin } from "../../src/lib/academy/admin-access.server";
import { POST as resetPassword } from "../../src/app/api/auth/reset-password/route";
import { POST as acceptInvite } from "../../src/app/api/auth/accept-invite/route";
import { PATCH as updateUser } from "../../src/app/api/users/[id]/route";
import { GET as listComparisons } from "../../src/app/api/comparativos/list/route";
import { POST as moveComparisonItem } from "../../src/app/api/comparativos/items/move/route";
import { s3 } from "../../src/lib/s3";

process.env.SESSION_SECRET = "synthetic-test-secret-not-a-production-credential";
const restores: (() => void)[] = [];
function restoreDatabaseMocks() { while (restores.length) restores.pop()!(); }
function mockMethod<T extends (...args: never[]) => unknown>(t: TestContext, target: object, key: string, implementation: T) {
  // Prisma delegate methods are proxy-generated and have no descriptors for mock.method.
  const record = target as Record<string, unknown>;
  const original = record[key];
  record[key] = implementation;
  restores.push(() => { record[key] = original; });
  t.after(restoreDatabaseMocks);
}
const account = (role: UserRole = "OWNER") => ({ id: "user-a", tenantId: "tenant-a", role,
  isActive: true, sessionVersion: 0, name: "Synthetic User", email: "synthetic@example.test",
  tenant: { id: "tenant-a", name: "Synthetic operation", slug: "synthetic-a", isPlatform: false, parentId: null } });
const sessionToken = (role: UserRole = "OWNER", sv?: number) => createSessionToken({ uid: "user-a", tid: "tenant-a", role, sv });
const jsonRequest = (body: unknown) => new Request("https://flyimob.test/api/test", { method: "POST",
  headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("current hashes and signed legacy sessions remain compatible; malformed input never throws", async () => {
  const hash = await hashPassword("Synthetic Password 123");
  assert.match(hash, /^scrypt:16384:8:1:/);
  assert.equal(await verifyPassword("Synthetic Password 123", hash), true);
  assert.equal(await verifyPassword("wrong", hash), false);
  assert.equal(await verifyPassword("wrong", "malformed"), false);
  assert.equal(verifySessionToken(sessionToken()).ok, true);
  function signed(value: string) {
    const body = Buffer.from(value).toString("base64url");
    return `${body}.${crypto.createHmac("sha256", process.env.SESSION_SECRET!).update(body).digest("base64url")}`;
  }
  for (const value of ["", "a", "a.b", `${sessionToken()}.extra`, signed("{"), signed("null"),
    signed(JSON.stringify({ uid: 1, tid: "t", role: "OWNER", exp: 9999999999 })),
    signed(JSON.stringify({ uid: "u", tid: "t", role: "OWNER", exp: "9999999999" })),
    signed(JSON.stringify({ uid: "u", tid: "t", role: "OWNER", exp: 9999999999, sv: -1 })),
    createSessionToken({ uid: "u", tid: "t", role: "OWNER" }, -1)]) {
    assert.doesNotThrow(() => verifySessionToken(value));
    assert.equal(verifySessionToken(value).ok, false);
  }
});

test("revocation rejects inactive, old-version and cross-tenant sessions, including legacy tokens", () => {
  const user = account();
  const payload = { uid: user.id, tid: user.tenantId };
  assert.equal(sessionAuthorizesUser(payload, user), true);
  assert.equal(sessionAuthorizesUser(payload, { ...user, isActive: false }), false);
  assert.equal(sessionAuthorizesUser(payload, { ...user, sessionVersion: 1 }), false);
  assert.equal(sessionAuthorizesUser({ ...payload, sv: 1 }, { ...user, sessionVersion: 1 }), true);
  assert.equal(sessionAuthorizesUser({ ...payload, tid: "tenant-b" }, user), false);
});

test("returnTo is internal and correspondent cannot change its destination", () => {
  for (const path of ["https://evil.test", "//evil.test", "/\\evil.test", "/%5cevil.test", "/%2fevil.test", "/api/auth/logout", "/login", "/\n/evil.test", "http:evil"]) {
    assert.equal(safeReturnTo(path), "/admin");
  }
  assert.equal(postAuthDestination("OWNER", "/admin/empreendimentos?a=1"), "/admin/empreendimentos?a=1");
  assert.equal(postAuthDestination("BROKER", "/admin/clientes"), "/admin/clientes");
  assert.equal(postAuthDestination("CORRESPONDENTE", "/academy-admin"), "/correspondente");
});

test("login route supports active OWNER/BROKER/CORRESPONDENTE and rejects inactive users", async (t) => {
  const passwordHash = await hashPassword("Synthetic Password 123");
  for (const role of ["OWNER", "BROKER", "CORRESPONDENTE"] as const) {
    mockMethod(t, prisma.user, "findUnique", async () => ({ ...account(role), passwordHash }));
    const response = await login(jsonRequest({ email: "synthetic@example.test", password: "Synthetic Password 123", returnTo: "/admin/clientes" }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).redirectTo, role === "CORRESPONDENTE" ? "/correspondente" : "/admin/clientes");
    assert.match(response.headers.get("set-cookie")!, /HttpOnly/i);
    restoreDatabaseMocks();
  }
  mockMethod(t, prisma.user, "findUnique", async () => ({ ...account(), isActive: false, passwordHash }));
  assert.equal((await login(jsonRequest({ email: "synthetic@example.test", password: "Synthetic Password 123" }))).status, 401);
});

test("real session resolver rejects inactive/revoked users and bad cookies", async (t) => {
  mockMethod(t, prisma.user, "findFirst", async () => account());
  assert.equal((await requestContext(sessionToken(), getSessionUser))?.user.role, "OWNER");
  assert.equal(await requestContext("broken.cookie", getSessionUser), null);
  restoreDatabaseMocks();
  mockMethod(t, prisma.user, "findFirst", async () => ({ ...account(), isActive: false }));
  assert.equal(await requestContext(sessionToken(), getSessionUser), null);
  restoreDatabaseMocks();
  mockMethod(t, prisma.user, "findFirst", async () => ({ ...account(), sessionVersion: 1 }));
  assert.equal(await requestContext(sessionToken(), getSessionUser), null);
  assert.ok(await requestContext(sessionToken("OWNER", 1), getSessionUser));
});

test("correspondent has no administrative permission, shell, finance, CRM or Academy access", async (t) => {
  mockMethod(t, prisma.user, "findFirst", async () => account("CORRESPONDENTE"));
  for (const perm of ["data:manage", "users:read", "users:invite", "crm:use", "comparativos:use", "dashboard:view", "documentacoes:manage"] as const) {
    assert.equal(hasPermission("CORRESPONDENTE", perm), false);
  }
  await assert.rejects(requestContext(sessionToken("CORRESPONDENTE"), () => AdminLayout({ children: null })), /NEXT_REDIRECT/);
  mockMethod(t, prisma.documentationFolder, "findMany", async () => []);
  mockMethod(t, prisma.documentationFolder, "count", async () => 0);
  mockMethod(t, prisma.documentationFolder, "groupBy", async () => []);
  assert.ok(await requestContext(sessionToken("CORRESPONDENTE"), CorrespondentePage));
  const finance = await requestContext(sessionToken("CORRESPONDENTE"), getFinanceApiSession);
  assert.equal(finance.ok, false);
  if (!finance.ok) assert.equal(finance.status, 403);
  await assert.rejects(requestContext(sessionToken("CORRESPONDENTE"), () => requirePermission("crm:use")), /NEXT_REDIRECT/);
  process.env.ACADEMY_ADMIN_USER_IDS = "user-a";
  await assert.rejects(requestContext(sessionToken("CORRESPONDENTE"), academyAdmin), /academy_access_denied/);
  delete process.env.ACADEMY_ADMIN_USER_IDS;
});

test("critical handlers reject anonymous and correspondent requests before parsing or touching S3", async (t) => {
  for (const handler of [uploadAttachment, uploadPhotos, updateBuilder]) {
    assert.equal((await requestContext(undefined, () => handler(jsonRequest({ tenantSlug: "victim" })))).status, 401);
  }
  mockMethod(t, prisma.user, "findFirst", async () => account("CORRESPONDENTE"));
  for (const handler of [uploadAttachment, uploadPhotos, updateBuilder]) {
    assert.equal((await requestContext(sessionToken("CORRESPONDENTE"), () => handler(jsonRequest({ tenantSlug: "victim" })))).status, 403);
  }
});

test("forged tenant is ignored and legitimate builder update retains response and fields", async (t) => {
  mockMethod(t, prisma.user, "findFirst", async () => account());
  let currentExists = false;
  mockMethod(t, prisma.construtora, "findFirst", async (args: { where: { tenantId: string; NOT?: unknown } }) => {
    assert.equal(args.where.tenantId, "tenant-a");
    return currentExists && !args.where.NOT ? { id: "builder-a", tenantId: "tenant-a" } : null;
  });
  let updated = false;
  mockMethod(t, prisma.construtora, "update", async (args: { data: { name: string } }) => {
    updated = true; assert.equal(args.data.name, "Builder edited"); return {};
  });
  function request() {
    const form = new FormData(); form.set("tenantSlug", "tenant-victim"); form.set("id", "builder-a"); form.set("name", "Builder edited");
    return new Request("https://flyimob.test/api/construtoras/update", { method: "POST", body: form });
  }
  assert.equal((await requestContext(sessionToken(), () => updateBuilder(request()))).status, 404);
  assert.equal(updated, false);
  currentExists = true;
  const response = await requestContext(sessionToken(), () => updateBuilder(request()));
  assert.equal(response.status, 303); assert.equal(updated, true);
  assert.match(response.headers.get("location")!, /\/admin\/construtoras\/builder-a\/edit$/);
});

test("upload endpoints reject cross-tenant property IDs with tenant forced by session", async (t) => {
  mockMethod(t, prisma.user, "findFirst", async () => account());
  mockMethod(t, prisma.empreendimento, "findFirst", async (args: { where: { tenantId: string } }) => {
    assert.equal(args.where.tenantId, "tenant-a"); return null;
  });
  for (const handler of [uploadAttachment, uploadPhotos]) {
    const form = new FormData(); form.set("tenantSlug", "victim"); form.set("empreendimentoId", "property-victim");
    form.set("file", new File(["synthetic"], "synthetic.pdf", { type: "application/pdf" }));
    form.set("files", new File(["synthetic"], "synthetic.jpg", { type: "image/jpeg" }));
    assert.equal((await requestContext(sessionToken(), () => handler(new Request("https://flyimob.test/api/upload", { method: "POST", body: form })))).status, 404);
  }
});

test("direct creation is OWNER-only, fixes tenant/role, hashes password and never returns it", async (t) => {
  mockMethod(t, prisma.user, "findFirst", async () => account());
  mockMethod(t, prisma.user, "create", async (args: { data: { passwordHash: string; tenantId: string; role: string }; select: Record<string, boolean> }) => {
    assert.equal(args.data.tenantId, "tenant-a"); assert.equal(args.data.role, "CORRESPONDENTE");
    assert.equal(await verifyPassword("Synthetic Password 123", args.data.passwordHash), true);
    assert.equal(args.select.passwordHash, undefined);
    return { id: "new-correspondent", role: "CORRESPONDENTE" };
  });
  const body = { name: "Synthetic Correspondent", email: "correspondent@example.test", password: "Synthetic Password 123", tenantId: "victim", role: "OWNER" };
  const response = await requestContext(sessionToken(), () => createCorrespondent(jsonRequest(body)));
  assert.equal(response.status, 201); assert.equal(JSON.stringify(await response.json()).includes(body.password), false);
  restoreDatabaseMocks();
  mockMethod(t, prisma.user, "findFirst", async () => account("DIRECTOR"));
  assert.equal((await requestContext(sessionToken("DIRECTOR"), () => createCorrespondent(jsonRequest(body)))).status, 403);
});

test("future folder scope enforces tenant, assignment and submitted round", () => {
  const user = account("CORRESPONDENTE");
  const scope = documentationFolderScope({ user, tenant: user.tenant });
  assert.equal(scope.tenantId, "tenant-a"); assert.equal(scope.correspondentId, "user-a");
  assert.equal(scope.rounds?.some.correspondentId, "user-a");
  assert.equal(scope.status?.in.includes("EM_MONTAGEM"), false);
  assert.deepEqual(documentationFolderScope({ user, tenant: { ...user.tenant, isPlatform: true } }).id, { in: [] });
});

test("migration is additive and contains tenant/folder FKs and append-only audit", () => {
  const sql = readFileSync("prisma/migrations/20261003000000_documentation_foundation/migration.sql", "utf8");
  assert.doesNotMatch(sql, /\b(DROP|TRUNCATE|DELETE FROM)\b/i);
  assert.match(sql, /ADD COLUMN\s+"sessionVersion" INTEGER NOT NULL DEFAULT 0/);
  assert.match(sql, /FOREIGN KEY \("tenantId", "folderId", "personId"\)/);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON "DocumentationEvent"/);
  assert.match(sql, /"DocumentationRoundDocument"/);
  assert.match(sql, /"DocumentationAnalysisDocument"/);
  assert.equal(new Prisma.Decimal("123.45").toFixed(2), "123.45");
});

test("reset password consumes token once and increments session version in the same transaction", async (t) => {
  mockMethod(t, prisma.passwordResetToken, "findFirst", async () => ({ id: "reset-a", userId: "user-a", user: { isActive: true } }));
  let used = false;
  let version = 0;
  const tx = {
    passwordResetToken: {
      updateMany: async ({ where }: { where: { id?: string } }) => {
        if (!where.id) return { count: 0 };
        if (used) return { count: 0 }; used = true; return { count: 1 };
      },
    },
    user: { update: async ({ data }: { data: { passwordHash: string; sessionVersion: { increment: number } } }) => {
      assert.equal(await verifyPassword("Synthetic Password 456", data.passwordHash), true);
      version += data.sessionVersion.increment;
    } },
  };
  mockMethod(t, prisma, "$transaction", async (work: (value: typeof tx) => unknown) => work(tx));
  assert.equal((await resetPassword(jsonRequest({ token: "synthetic-reset", password: "Synthetic Password 456" }))).status, 200);
  assert.equal(version, 1);
  assert.equal((await resetPassword(jsonRequest({ token: "synthetic-reset", password: "Synthetic Password 456" }))).status, 400);
  assert.equal(version, 1);
});

test("inactivation increments version and reactivation cannot restore the old cookie", async (t) => {
  mockMethod(t, prisma.user, "findFirst", async ({ where }: { where: { id: string } }) => ({ ...account(where.id === "user-a" ? "OWNER" : "BROKER"), id: where.id }));
  let version = 0;
  mockMethod(t, prisma.user, "update", async ({ data }: { data: { sessionVersion?: { increment: number } } }) => {
    version += data.sessionVersion?.increment ?? 0; return {};
  });
  const ctx = { params: Promise.resolve({ id: "broker-b" }) };
  assert.equal((await requestContext(sessionToken(), () => updateUser(jsonRequest({ isActive: false }) as never, ctx))).status, 200);
  assert.equal(version, 1);
  assert.equal((await requestContext(sessionToken(), () => updateUser(jsonRequest({ isActive: true }) as never, ctx))).status, 200);
  assert.equal(version, 1);
  assert.equal(sessionAuthorizesUser({ uid: "user-a", tid: "tenant-a" }, { ...account(), sessionVersion: version }), false);
});

test("effective invite acceptance creates correspondent atomically and returns its restricted destination", async (t) => {
  mockMethod(t, prisma.userInviteToken, "findUnique", async () => ({ id: "invite-a", email: "invited@example.test", role: "CORRESPONDENTE",
    tenantId: "tenant-a", invitedById: "owner-a", usedAt: null, expiresAt: new Date(Date.now() + 60000) }));
  mockMethod(t, prisma.user, "findUnique", async () => null);
  let claimed = false;
  let creates = 0;
  const tx = {
    userInviteToken: { updateMany: async () => { if (claimed) return { count: 0 }; claimed = true; return { count: 1 }; } },
    user: { create: async ({ data }: { data: { tenantId: string; role: string; passwordHash: string } }) => {
      creates++; assert.equal(data.tenantId, "tenant-a"); assert.equal(data.role, "CORRESPONDENTE");
      assert.equal(await verifyPassword("Synthetic Password 789", data.passwordHash), true);
      return { ...account("CORRESPONDENTE"), sessionVersion: 0 };
    } },
  };
  mockMethod(t, prisma, "$transaction", async (work: (value: typeof tx) => unknown) => work(tx));
  const body = { token: "synthetic-invite", password: "Synthetic Password 789", name: "Invited user" };
  const response = await acceptInvite(jsonRequest(body));
  assert.equal(response.status, 200); assert.equal((await response.json()).redirectTo, "/correspondente");
  assert.equal((await acceptInvite(jsonRequest(body))).status, 409); assert.equal(creates, 1);
  assert.equal((await acceptInvite(jsonRequest({ ...body, password: "short" }))).status, 400);
});

test("administrative comparison APIs deny correspondent, including item operations without former guards", async (t) => {
  mockMethod(t, prisma.user, "findFirst", async () => account("CORRESPONDENTE"));
  assert.equal((await requestContext(sessionToken("CORRESPONDENTE"), listComparisons)).status, 403);
  assert.equal((await requestContext(sessionToken("CORRESPONDENTE"), () => moveComparisonItem(jsonRequest({ itemId: "item-a", direction: "up" })))).status, 403);
  assert.equal((await requestContext(undefined, listComparisons)).status, 401);
});

test("legitimate property attachment upload preserves contract with mocked storage", async (t) => {
  mockMethod(t, prisma.user, "findFirst", async () => account("DATA_ENTRY"));
  mockMethod(t, prisma.empreendimento, "findFirst", async ({ where }: { where: { tenantId: string } }) => {
    assert.equal(where.tenantId, "tenant-a"); return { id: "property-a" };
  });
  let stored = false;
  mockMethod(t, s3, "send", async () => { stored = true; });
  mockMethod(t, prisma.empreendimentoAnexo, "create", async ({ data }: { data: { empreendimentoId: string } }) => {
    assert.equal(data.empreendimentoId, "property-a"); return { id: "attachment-a" };
  });
  const form = new FormData(); form.set("empreendimentoId", "property-a");
  form.set("file", new File(["synthetic file"], "synthetic.pdf", { type: "application/pdf" }));
  const response = await requestContext(sessionToken("DATA_ENTRY"), () => uploadAttachment(new Request("https://flyimob.test/api/upload", { method: "POST", body: form })));
  assert.equal(response.status, 200); assert.equal(stored, true); assert.equal((await response.json()).anexo.id, "attachment-a");
});
