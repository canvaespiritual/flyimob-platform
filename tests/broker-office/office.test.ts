import { requestContext } from "../documentacoes/request-context";
import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { authorizeOffice, officePeriod, ownsMetric } from "../../src/lib/broker-office/policy";
import { officeEntitlement, officeAdjustment } from "../../src/lib/broker-office/finance-calculations";
import { officeIdentity } from "../../src/lib/broker-office/identity.server";
import { officeMarketing } from "../../src/lib/broker-office/marketing.server";
import { officeFinance } from "../../src/lib/broker-office/finance.server";
import { officeReceipt } from "../../src/lib/broker-office/receipts.server";
import { GET } from "../../src/app/api/broker-office/[section]/route";
import { GET as receiptGet } from "../../src/app/api/broker-office/receipts/[kind]/[id]/route";
import { canAccessFinance } from "../../src/lib/financeiro/access.server";
import { canAccessMarketing } from "../../src/lib/marketing/policy";
import { createSessionToken } from "../../src/lib/auth.server";
import { prisma } from "../../src/lib/prisma";
const dec = (value: number | string) => new Prisma.Decimal(value);
const at = (day: string) => new Date(day + "T00:00:00Z");
const viewer = { user: { id: "user-a", tenantId: "t1", role: "BROKER" as const }, tenant: { id: "t1", isPlatform: false } };
const identity = { tenantId: "t1", userId: "user-a", personIds: ["person-a", "old-a"], canonical: "person-a", participantIds: ["fp-a"] };
const range = officePeriod(new URLSearchParams("period=custom&from=2025-10-01&to=2025-10-31"));

test("broker office does not expand administrative finance, marketing, roles or tenant access", () => {
  authorizeOffice(viewer);
  assert.equal(canAccessFinance(viewer), false); assert.equal(canAccessMarketing(viewer), false);
  for (const role of ["OWNER", "DIRECTOR", "MANAGER", "DATA_ENTRY", "CORRESPONDENTE"]) assert.throws(() => authorizeOffice({ ...viewer, user: { ...viewer.user, role } }));
  assert.throws(() => authorizeOffice({ ...viewer, tenant: { ...viewer.tenant, id: "other" } }));
  assert.throws(() => authorizeOffice({ ...viewer, tenant: { ...viewer.tenant, isPlatform: true } }));
});

test("period filters reject identity manipulation, invalid dates, duplicates and future reports", () => {
  for (const query of ["personId=other", "userId=other", "tenantId=other", "accountId=shared", "period=custom&from=2025-02-30&to=2025-03-01", "period=month&period=previous", "period=custom&from=2099-01-01&to=2099-01-02"]) assert.throws(() => officePeriod(new URLSearchParams(query)));
  const recent = officePeriod(new URLSearchParams("period=last30"));
  assert.equal((recent.end.getTime() + 1 - recent.start.getTime()) / 86400000, 30);
});

test("shared account and transferred campaign use dated explicit ownership; overlaps are withheld", () => {
  const assignments = [
    { personId: "person-a", brokerId: null, validFrom: at("2025-10-01"), validTo: at("2025-10-15") },
    { personId: "person-b", brokerId: null, validFrom: at("2025-10-15"), validTo: null },
  ];
  assert.equal(ownsMetric(assignments, at("2025-10-14"), identity.personIds, identity.userId), true);
  assert.equal(ownsMetric(assignments, at("2025-10-15"), identity.personIds, identity.userId), false);
  assert.equal(ownsMetric([...assignments, { ...assignments[0], validTo: null }], at("2025-10-14"), identity.personIds, identity.userId), false);
  assert.equal(ownsMetric([{ ...assignments[0], personId: null, brokerId: "user-a" }], at("2025-10-14"), [], "user-a"), true);
});

test("vale is one adjustment with partial allocations; compensation is never counted as cash payment", () => {
  const values = officeEntitlement({ finalAmount: dec(1000), paymentAllocations: [{ amount: dec(300), payment: { status: "PAID" } }, { amount: dec(999), payment: { status: "PENDING" } }], adjustmentAllocations: [{ amount: dec(200), adjustment: { effect: "DEBIT" } }, { amount: dec(50), adjustment: { effect: "CREDIT" } }] });
  assert.deepEqual(values, { amount: "1000.00", paid: "300.00", settled: "450.00", remaining: "550.00" });
  assert.equal(officeAdjustment({ amount: dec(500), allocations: [{ amount: dec(150) }, { amount: dec(50) }] }), "300.00");
  assert.equal(officeEntitlement({ finalAmount: dec("0.30"), paymentAllocations: [{ amount: dec("0.10"), payment: { status: "PAID" } }], adjustmentAllocations: [] }).remaining, "0.20");
});

test("identity follows explicit links and merged aliases without matching names/emails or other login", async () => {
  let userId = "user-a";
  const db = { user: { findFirst: async ({ where }: { where: unknown }) => { assert.deepEqual(where, { id: userId, tenantId: "t1", role: "BROKER", isActive: true }); return { id: userId, personId: "person-a" }; } },
    operationPerson: { findMany: async ({ where }: { where: unknown }) => { assert.deepEqual(where, { tenantId: "t1" }); return [{ id: "person-a", mergedIntoId: null, user: { id: "user-a" } }, { id: "old-a", mergedIntoId: "person-a", user: null }, { id: "conflicting-alias", mergedIntoId: "person-a", user: { id: "user-b" } }, { id: "person-b", mergedIntoId: null, user: { id: "user-b" } }]; } },
    financialParticipant: { findMany: async ({ where }: { where: { tenantId: string; AND: unknown[] } }) => { assert.equal(where.tenantId, "t1"); assert.ok(JSON.stringify(where.AND).includes('"userId":"' + userId + '"')); assert.equal(JSON.stringify(where).includes("name"), false); return []; } },
  } as unknown as typeof prisma;
  assert.deepEqual((await officeIdentity(viewer, db)).personIds, ["person-a", "old-a"]);
  userId = "user-b";
  assert.deepEqual((await officeIdentity({ ...viewer, user: { ...viewer.user, id: userId } }, db)).personIds, []);
});

test("marketing exposes only owned days and own resource movements, never global parent or other broker totals", async () => {
  const assignments = [{ personId: "person-a", brokerId: null, validFrom: at("2025-10-01"), validTo: at("2025-10-15") }, { personId: "person-b", brokerId: null, validFrom: at("2025-10-15"), validTo: null }];
  const parent = { id: "company-global", accountId: "shared", personId: null, beneficiaryPersonId: null, kind: "CONTRIBUTION", origin: "FLYIMOB", fundingNature: "GLOBAL", fundingMovementId: null, distributionMovementId: null, status: "CONFIRMED", effectiveDate: at("2025-10-01"), amount: dec(90000), currency: "BRL", affectsPhysicalBalance: true };
  const bonus = { ...parent, id: "bonus-a", beneficiaryPersonId: "person-a", fundingNature: "ALLOCATION_BONUS", distributionMovementId: parent.id, amount: dec(300), reason: "Incentivo de captação", note: null, recoveryMethod: null, receipts: [] };
  let movementCalls = 0;
  const metric = (date: string, amount: number) => ({ date: at(date), currency: "BRL", state: "CONFIRMED", metaSpend: dec(amount), effectiveSpend: dec(amount), leads: 5, campaign: { id: "campaign", name: "Campanha atribuída", purpose: "CLIENTES", accountId: "shared", assignments } });
  const db = { marketingCampaign: { findMany: async ({ where }: { where: { tenantId: string } }) => { assert.equal(where.tenantId, "t1"); return [{ id: "campaign", name: "Campanha atribuída", assignments }]; } },
    marketingMoneyMovement: { findMany: async () => ++movementCalls === 1 ? [bonus] : [parent] }, marketingAuditEvent: { findMany: async () => [] },
    marketingDailyMetric: { count: async () => 2, findMany: async () => [metric("2025-10-05", 25), metric("2025-10-20", 9999)] }, marketingSyncRun: { findMany: async () => [] },
  } as unknown as typeof prisma;
  const data = await officeMarketing(identity, range, db);
  assert.equal(data.totals[0].effectiveSpend, "25.00"); assert.equal(data.totals[0].leads, 5);
  assert.equal(data.positions[0].periodBonuses, "300.00"); assert.equal(data.positions[0].mediaPosition, "275.00"); assert.equal(data.positions[0].outstandingDebt, "0.00");
  const serialized = JSON.stringify(data);
  for (const value of ["90000", "9999", "person-b", "company-global"]) assert.equal(serialized.includes(value), false, value);
  assert.equal(data.history.length, 1); assert.equal(data.evolution[0].complete, false);
});

test("finance preserves original values, splits receipt-backed and projected rights, filters event dates and excludes cancellations from totals", async () => {
  const right = { id: "right", role: "BROKER", status: "OPEN", finalAmount: dec(1000), createdAt: at("2025-10-02"), stage: { id: "stage", type: "ATO", label: null, status: "EXPECTED", expectedReceiptDate: at("2025-12-01"), receipts: [], sale: { id: "sale", clientName: "Cliente próprio", saleDate: at("2025-10-01"), status: "OPEN" } }, paymentAllocations: [], adjustmentAllocations: [] };
  const adjustment = { id: "advance", type: "ADVANCE", effect: "DEBIT", amount: dec(500), occurredAt: at("2025-09-01"), status: "PARTIAL", description: "Vale", allocations: [{ amount: dec(200), appliedAt: at("2025-10-10"), entitlement: { participantId: "fp-a", stage: { type: "ATO", sale: { clientName: "Cliente próprio" } } } }] };
  const db = { financialEntitlement: { findMany: async ({ where }: { where: { tenantId: string; participantId: unknown } }) => { assert.equal(where.tenantId, "t1"); assert.deepEqual(where.participantId, { in: ["fp-a"] }); return [right, { ...right, id: "cancelled", status: "CANCELLED", finalAmount: dec(9999) }]; } },
    financialAdjustment: { findMany: async () => [adjustment] }, financialPayment: { findMany: async () => [{ id: "payment", amount: dec(50), paidAt: at("2025-10-10"), scheduledAt: null, createdAt: at("2025-09-01"), status: "PAID", allocations: [] }] }, financialAttachment: { findMany: async ({ where }: { where: unknown }) => { assert.deepEqual(where, { tenantId: "t1", OR: [{ entityType: "PAYMENT", entityId: { in: ["payment"] } }, { entityType: "ADJUSTMENT", entityId: { in: [] } }] }); return [{ id: "receipt", entityId: "payment", originalName: "Comprovante.pdf", url: "https://existing-storage.test/existing-receipt.pdf" }]; } },
  } as unknown as typeof prisma;
  const data = await officeFinance(identity, range, db);
  assert.equal(data.position.generated, "1000.00"); assert.equal(data.position.projectedWithoutCompanyReceipt, "1000.00"); assert.equal(data.position.pendingWithCompanyReceipt, "0.00"); assert.equal(data.position.advancesOpen, "300.00");
  assert.equal(data.period.payments, "50.00"); assert.equal(data.adjustments.length, 0); assert.equal(data.entitlements.length, 2); assert.equal(data.period.sales, 1);
  assert.deepEqual(data.payments[0].receipts, [{ name: "Comprovante.pdf", href: "https://existing-storage.test/existing-receipt.pdf" }]);
});

test("receipts require individual ownership before reading storage, including shared tenant", async () => {
  let storageCalls = 0;
  const storage = { get: async () => { storageCalls++; throw Error("unexpected read"); } };
  const db = { marketingMoneyReceipt: { findFirst: async ({ where }: { where: { tenantId: string; movement: unknown } }) => { assert.equal(where.tenantId, "t1"); assert.ok(JSON.stringify(where.movement).includes("person-a")); return null; } }, financialAttachment: { findFirst: async () => ({ entityType: "PAYMENT", entityId: "payment-of-b", storageKey: "private" }) }, financialPayment: { findFirst: async ({ where }: { where: { participantId: unknown; tenantId: string } }) => { assert.deepEqual(where.participantId, { in: ["fp-a"] }); assert.equal(where.tenantId, "t1"); return null; } } } as unknown as typeof prisma;
  await assert.rejects(officeReceipt(identity, "marketing", "receipt-of-b", db, storage as never), /não encontrado/);
  await assert.rejects(officeReceipt(identity, "finance", "receipt-of-b", db, storage as never), /não encontrado/);
  assert.equal(storageCalls, 0);
});

test("authenticated routes reject anonymous, administrators and browser identity overrides before business queries", async () => {
  const oldSecret = process.env.SESSION_SECRET, oldFind = prisma.user.findFirst;
  process.env.SESSION_SECRET = "synthetic-local-office-session-secret";
  let role = "BROKER";
  prisma.user.findFirst = (async () => ({ id: "user-a", tenantId: "t1", role, isActive: true, sessionVersion: 0, tenant: { id: "t1", isPlatform: false } })) as unknown as typeof oldFind;
  try {
    const context = { params: Promise.resolve({ section: "finance" }) };
    assert.equal((await requestContext(undefined, () => GET(new Request("https://flyimob.test/api/broker-office/finance"), context))).status, 401);
    assert.equal((await requestContext(undefined, () => receiptGet(new Request("https://flyimob.test/api/broker-office/receipts/finance/x"), { params: Promise.resolve({ kind: "finance", id: "x" }) }))).status, 401);
    const token = createSessionToken({ uid: "user-a", tid: "t1", role: "BROKER", sv: 0 });
    const response = await requestContext(token, () => GET(new Request("https://flyimob.test/api/broker-office/finance?participantId=other"), context));
    assert.equal(response.status, 400); assert.equal(response.headers.get("cache-control"), "private, no-store");
    role = "OWNER";
    assert.equal((await requestContext(token, () => GET(new Request("https://flyimob.test/api/broker-office/finance"), context))).status, 403);
  } finally { prisma.user.findFirst = oldFind; if (oldSecret === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = oldSecret; }
});

test("finance BFF reads a consistent read-only snapshot with identity from the authenticated session", async () => {
  const oldSecret = process.env.SESSION_SECRET, oldFind = prisma.user.findFirst, oldTx = prisma.$transaction;
  process.env.SESSION_SECRET = "synthetic-local-office-session-secret";
  prisma.user.findFirst = (async () => ({ id: "user-a", tenantId: "t1", role: "BROKER", isActive: true, sessionVersion: 0, tenant: { id: "t1", isPlatform: false } })) as unknown as typeof oldFind;
  let readOnly = false;
  const scoped = async ({ where }: { where: { tenantId: string } }) => { assert.equal(where.tenantId, "t1"); return []; };
  const tx = { $executeRawUnsafe: async (sql: string) => { assert.equal(sql, "SET TRANSACTION READ ONLY"); readOnly = true; }, user: { findFirst: async ({ where }: { where: { id: string } }) => { assert.equal(where.id, "user-a"); return { id: "user-a", personId: null }; } }, operationPerson: { findMany: scoped }, financialParticipant: { findMany: scoped }, financialEntitlement: { findMany: scoped }, financialAdjustment: { findMany: scoped }, financialPayment: { findMany: scoped }, financialAttachment: { findMany: scoped } };
  prisma.$transaction = (async (run: (db: unknown) => unknown, options: { isolationLevel: string }) => { assert.equal(options.isolationLevel, "RepeatableRead"); return run(tx); }) as typeof oldTx;
  try {
    const token = createSessionToken({ uid: "user-a", tid: "t1", role: "BROKER", sv: 0 });
    const response = await requestContext(token, () => GET(new Request("https://flyimob.test/api/broker-office/finance?period=month"), { params: Promise.resolve({ section: "finance" }) }));
    assert.equal(response.status, 200); assert.equal(readOnly, true);
    assert.equal((await response.json()).data.linked, false);
  } finally { prisma.$transaction = oldTx; prisma.user.findFirst = oldFind; if (oldSecret === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = oldSecret; }
});

test("private marketing receipt returns verified bytes only for its beneficiary", async () => {
  const db = { marketingMoneyReceipt: { findFirst: async () => ({ id: "receipt-a", tenantId: "t1", movementId: "movement-a", storageKey: "private/marketing/t1/movement-a/receipt-a", originalName: "aporte.pdf", mimeType: "application/pdf", fileSize: 3n, uploadedById: "owner", checksum: "verified" }) } } as unknown as typeof prisma;
  let seen = false;
  const storage = { get: async (document: { folderId: string; tenantId: string }) => { assert.equal(document.folderId, "movement-a"); assert.equal(document.tenantId, "t1"); seen = true; return { bytes: new Uint8Array([1, 2, 3]), checksum: "verified" }; } };
  const result = await officeReceipt(identity, "marketing", "receipt-a", db, storage as never);
  assert.equal(seen, true); assert.equal(result.name, "aporte.pdf"); assert.equal(result.bytes.length, 3);
  storage.get = async () => ({ bytes: new Uint8Array([1, 2, 3]), checksum: "changed" });
  await assert.rejects(officeReceipt(identity, "marketing", "receipt-a", db, storage as never), /divergente/);
});
