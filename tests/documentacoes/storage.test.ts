import { requestContext } from "./request-context";
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { type DocumentationDocument } from "@prisma/client";
import sharp from "sharp";
import { PDFDocument, PDFName } from "pdf-lib";
import { GetPublicAccessBlockCommand, PutObjectCommand, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "../../src/lib/prisma";
import { s3 } from "../../src/lib/s3";
import { createSessionToken } from "../../src/lib/auth.server";
import { beginUpload, uploadDocument, finalizeUpload, invalidateDocument, documentContent, listDocuments } from "../../src/lib/documentacoes/documents.server";
import { MAX_DOCUMENT_BYTES, fileMetadata, validateFile, disposition, readUpload } from "../../src/lib/documentacoes/file-policy";
import { documentationStorage, type DocumentationStorage, type StoredDocument } from "../../src/lib/documentacoes/storage.server";
import { documentScope, sameOrigin } from "../../src/lib/documentacoes/document-access.server";
import { DocumentationError } from "../../src/lib/documentacoes/validation";
import { DOCUMENT_FORMATS } from "../../src/lib/documentacoes/file-formats";
import type { DocumentationViewer } from "../../src/lib/documentacoes/access-policy";
import { POST as begin, GET as list } from "../../src/app/api/documentacoes/pastas/[id]/documentos/route";
import { PUT as upload } from "../../src/app/api/documentacoes/pastas/[id]/documentos/[documentId]/upload/route";
import { POST as finish } from "../../src/app/api/documentacoes/pastas/[id]/documentos/[documentId]/finalizar/route";
import { POST as invalidate } from "../../src/app/api/documentacoes/pastas/[id]/documentos/[documentId]/invalidar/route";
import { GET as content } from "../../src/app/api/documentacoes/pastas/[id]/documentos/[documentId]/arquivo/route";

process.env.SESSION_SECRET = "synthetic-documentation-storage-tests";
const owner = { user: { id: "owner-a", tenantId: "tenant-a", role: "OWNER" as const }, tenant: { id: "tenant-a", isPlatform: false } };
const correspondent = { ...owner, user: { ...owner.user, id: "correspondent-a", role: "CORRESPONDENTE" as const } };
const restores: (() => void)[] = [];
function mock(t: TestContext, target: object, key: string, implementation: unknown) { const record = target as Record<string, unknown>; const before = record[key]; record[key] = implementation; restores.push(() => { record[key] = before; }); t.after(() => { while (restores.length) restores.pop()!(); }); }
function env(t: TestContext, value?: string) { const before = process.env.AWS_S3_DOCUMENTATION_BUCKET; if (value === undefined) delete process.env.AWS_S3_DOCUMENTATION_BUCKET; else process.env.AWS_S3_DOCUMENTATION_BUCKET = value; t.after(() => { if (before === undefined) delete process.env.AWS_S3_DOCUMENTATION_BUCKET; else process.env.AWS_S3_DOCUMENTATION_BUCKET = before; }); }
type Where = Record<string, unknown>;
type Args = { where: Where; data: Record<string, unknown>; select?: Record<string, unknown> };
function harness() {
  let version = 0; const documents = new Map<string, DocumentationDocument>(); const events: { eventType: string; metadata: unknown }[] = [];
  const folder = { id: "folder-a", tenantId: "tenant-a", brokerId: "broker-a", correspondentId: "correspondent-a", status: "EM_MONTAGEM", version: 0 };
  const matches = (where: Where, row: { id: string; tenantId: string; folderId?: string; status?: string; uploadedById?: string }) => ["id", "tenantId", "folderId", "status", "uploadedById"].every(key => where[key] === undefined || typeof where[key] === "object" || where[key] === row[key as keyof typeof row]);
  const tx = {
    documentationFolder: { findFirst: async ({ where }: Args) => matches(where, folder) && (!where.correspondentId || where.correspondentId === folder.correspondentId) && (!where.brokerId || where.brokerId === folder.brokerId) ? { ...folder, version } : null,
      updateMany: async ({ where }: Args) => { if (where.version !== version) return { count: 0 }; version++; return { count: 1 }; } },
    documentationPerson: { findFirst: async ({ where }: Args) => where.id === "person-a" && where.tenantId === "tenant-a" && where.folderId === "folder-a" ? { id: "person-a" } : null, findMany: async () => [] },
    documentationDocumentType: { findFirst: async ({ where }: Args) => where.id === "type-a" && where.tenantId === "tenant-a" ? { id: "type-a" } : null, findMany: async () => [] },
    documentationDocument: { create: async ({ data }: Args) => { const row = { ...data, createdAt: new Date(), updatedAt: new Date(), checksum: null } as unknown as DocumentationDocument; documents.set(row.id, row); return row; },
      findFirst: async ({ where }: Args) => [...documents.values()].find(row => matches(where, row)) ?? null,
      findMany: async ({ where, select }: Args) => { assert.equal(select?.storageKey, undefined); return [...documents.values()].filter(row => matches(where, row)).map(row => ({ ...Object.fromEntries(Object.entries(row).filter(([key]) => select?.[key])), uploadedBy: { name: "Synthetic Sender" }, documentType: { name: "Synthetic type" } })); },
      count: async ({ where }: Args) => [...documents.values()].filter(row => matches(where, row)).length,
      updateMany: async ({ where, data }: Args) => { const rows = [...documents.values()].filter(row => matches(where, row)); for (const row of rows) Object.assign(row, data); return { count: rows.length }; } },
    documentationEvent: { create: async ({ data }: Args) => { events.push({ eventType: String(data.eventType), metadata: data.metadata }); return data; } },
  };
  const db = { ...tx, $transaction: async (callback: (tx: unknown) => Promise<unknown>) => { const before = version; const snapshot = [...documents.entries()].map(([id, row]) => [id, { ...row }] as const); const length = events.length;
    try { return await callback(tx); } catch (error) { version = before; documents.clear(); for (const [id, row] of snapshot) documents.set(id, row); events.length = length; throw error; } } } as unknown as typeof prisma;
  const objects = new Map<string, { bytes: Uint8Array; checksum: string }>();
  const storage: DocumentationStorage = { ready: async () => {}, put: async (row, bytes, checksum) => { if (objects.has(row.storageKey)) throw new DocumentationError(409, "already stored"); objects.set(row.storageKey, { bytes, checksum }); }, get: async row => { const object = objects.get(row.storageKey); if (!object) throw new DocumentationError(502, "missing object"); return object; } };
  return { db, tx, folder, documents, events, objects, storage, version: () => version };
}
const image = () => sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer();
const body = (size: number, version = 0) => ({ originalFileName: "synthetic.png", mimeType: "image/png", fileSize: size, personId: "person-a", documentTypeId: "type-a", version });
async function active(h: ReturnType<typeof harness>, viewer: DocumentationViewer = owner) { const bytes = await image(); const start = await beginUpload(viewer, "folder-a", body(bytes.length, h.version()), h.db, h.storage); await uploadDocument(viewer, "folder-a", start.id, bytes, h.db, h.storage); await finalizeUpload(viewer, "folder-a", start.id, { version: h.version() }, h.db, h.storage); return start.id; }

test("MIME, extension, size and sanitized disposition reject unsafe input", () => {
  for (const value of [{ ...body(10), mimeType: "text/html" }, { ...body(10), originalFileName: "evil.svg" }, body(MAX_DOCUMENT_BYTES + 1), body(0), { ...body(10), mimeType: "application/pdf" }]) assert.throws(() => fileMetadata(value), DocumentationError);
  assert.equal(fileMetadata({ ...body(10), originalFileName: "../../test.png" }).originalFileName, "test.png");
  assert.throws(() => disposition("x\r\nSet-Cookie: bad.png", true)); assert.match(disposition("João.png", true), /^attachment; filename="Jo_o.png"; filename\*=UTF-8''/);
});
test("PDF/PNG/JPEG bytes and PDF actions are preserved without decoding", async () => {
  const png = await image(); assert.match(await validateFile(png, "image/png", png.length), /^[a-f0-9]{64}$/);
  const jpeg = await sharp(png).jpeg().toBuffer(); assert.ok(await validateFile(jpeg, "image/jpeg", jpeg.length));
  const pdf = await PDFDocument.create(); pdf.addPage(); const bytes = await pdf.save(); assert.ok(await validateFile(bytes, "application/pdf", bytes.length));
  for (const [data, mime] of [[Buffer.from("unrenderable image"), "image/png"], [png, "image/jpeg"], [png.subarray(0, png.length - 1), "image/png"]] as const) assert.match(await validateFile(data, mime, data.length), /^[a-f0-9]{64}$/);
  pdf.catalog.set(PDFName.of("OpenAction"), PDFName.of("JavaScript")); const original = await pdf.save(); assert.match(await validateFile(original, "application/pdf", original.length), /^[a-f0-9]{64}$/);
});
test("bounded request reading rejects over-limit and incomplete streams", async () => {
  const request = (bytes: number) => new Request("https://local.test/upload", { method: "PUT", body: new Uint8Array(bytes) });
  assert.equal((await readUpload(request(5), 5)).length, 5); await assert.rejects(readUpload(request(6), 5)); await assert.rejects(readUpload(request(4), 5));
});
test("document access is assignment-scoped without granting analysis/admin access", () => {
  assert.deepEqual(documentScope(correspondent), { tenantId: "tenant-a", correspondentId: "correspondent-a" });
  assert.deepEqual(documentScope({ ...owner, user: { ...owner.user, role: "BROKER" } }), { tenantId: "tenant-a", brokerId: owner.user.id });
  for (const denied of [{ ...owner, user: { ...owner.user, role: "MANAGER" as const } }, { ...owner, tenant: { ...owner.tenant, isPlatform: true } }, { ...correspondent, user: { ...correspondent.user, tenantId: "foreign" } }]) assert.throws(() => documentScope(denied));
  assert.throws(() => sameOrigin(new Request("https://local.test/api", { headers: { origin: "https://evil.test" } })));
});
test("public FlyImob origin is allowed behind an internal proxy URL", t => {
  const before = process.env.APP_URL;
  process.env.APP_URL = "https://flyimob.com/";
  t.after(() => { if (before === undefined) delete process.env.APP_URL; else process.env.APP_URL = before; });
  for (const origin of ["https://flyimob.com", "https://www.flyimob.com"]) {
    for (const method of ["POST", "PUT"]) {
      assert.doesNotThrow(() => sameOrigin(new Request("http://localhost:8080/api/documentacoes/pastas/folder-a/documentos", { method, headers: { origin, "sec-fetch-site": "same-origin" } })));
    }
  }
});

test("external, insecure, malformed and spoofed origins remain blocked", t => {
  const before = process.env.APP_URL;
  process.env.APP_URL = "https://flyimob.com";
  t.after(() => { if (before === undefined) delete process.env.APP_URL; else process.env.APP_URL = before; });
  for (const origin of ["https://evil.test", "http://flyimob.com", "https://flyimob.com.evil.test", "https://other.flyimob.com", "null", "https://flyimob.com:444", "https://flyimob.com/path"]) {
    assert.throws(() => sameOrigin(new Request("http://localhost:8080/api", { headers: { origin, host: "evil.test", "x-forwarded-host": "evil.test", "x-forwarded-proto": "https" } })), DocumentationError);
  }
  assert.throws(() => sameOrigin(new Request("http://localhost:8080/api", { headers: { origin: "https://flyimob.com", "sec-fetch-site": "cross-site" } })), DocumentationError);
  assert.throws(() => sameOrigin(new Request("https://evil.test/api", { headers: { origin: "https://evil.test" } })), DocumentationError);
});

test("local same-origin fallback works only without a configured public URL", t => {
  const before = process.env.APP_URL;
  delete process.env.APP_URL;
  t.after(() => { if (before === undefined) delete process.env.APP_URL; else process.env.APP_URL = before; });
  assert.doesNotThrow(() => sameOrigin(new Request("http://localhost:3000/api", { headers: { origin: "http://localhost:3000" } })));
  assert.throws(() => sameOrigin(new Request("http://localhost:3000/api", { headers: { origin: "http://localhost:3001" } })), DocumentationError);
  process.env.APP_URL = "not a URL";
  assert.throws(() => sameOrigin(new Request("http://localhost:3000/api", { headers: { origin: "http://localhost:3000" } })), DocumentationError);
});

test("authorization rejects arbitrary key, foreign person/type/folder/tenant/correspondent", async () => {
  const h = harness(); const png = await image();
  for (const value of [{ ...body(png.length), storageKey: "foreign-key" }, { ...body(png.length), personId: "foreign" }, { ...body(png.length), documentTypeId: "foreign" }]) await assert.rejects(beginUpload(owner, "folder-a", value, h.db, h.storage));
  await assert.rejects(beginUpload(owner, "foreign", body(png.length), h.db, h.storage));
  await assert.rejects(beginUpload({ ...owner, user: { ...owner.user, tenantId: "foreign" }, tenant: { id: "foreign", isPlatform: false } }, "folder-a", body(png.length), h.db, h.storage));
  await assert.rejects(beginUpload({ ...correspondent, user: { ...correspondent.user, id: "other-correspondent" } }, "folder-a", body(png.length), h.db, h.storage));
  assert.equal(h.documents.size, 0); assert.equal(h.events.length, 0); assert.equal(h.objects.size, 0);
});
test("initiation uses unpredictable key, session origin and PROCESSING with transactional event", async () => {
  const h = harness(); const bytes = await image(); const result = await beginUpload(correspondent, "folder-a", { ...body(bytes.length), tenantId: "forged", uploadedById: "forged", uploadOrigin: "ADMINISTRATION" }, h.db, h.storage);
  const row = h.documents.get(result.id)!; assert.equal(row.status, "PROCESSING"); assert.equal(row.tenantId, "tenant-a"); assert.equal(row.uploadedById, correspondent.user.id); assert.equal(row.uploadOrigin, "CORRESPONDENT");
  assert.match(row.storageKey, /^documentacoes\/tenant-a\/folder-a\/[a-f0-9-]{36}$/); assert.equal(row.storageKey.includes("synthetic.png"), false); assert.equal("storageKey" in result, false); assert.equal(h.events[0].eventType, "DOCUMENT_UPLOAD_STARTED");
});
test("missing or incompatible storage never activates document", async () => {
  const h = harness(); const bytes = await image(); const start = await beginUpload(owner, "folder-a", body(bytes.length), h.db, h.storage);
  await assert.rejects(finalizeUpload(owner, "folder-a", start.id, { version: 1 }, h.db, h.storage), /missing object/);
  await uploadDocument(owner, "folder-a", start.id, bytes, h.db, h.storage);
  h.objects.get(h.documents.get(start.id)!.storageKey)!.checksum = "wrong";
  await assert.rejects(finalizeUpload(owner, "folder-a", start.id, { version: 1 }, h.db, h.storage), /Integridade/);
  await assert.rejects(finalizeUpload(owner, "folder-a", start.id, { version: 1, storageKey: "other" }, h.db, h.storage)); assert.equal(h.documents.get(start.id)!.status, "PROCESSING");
});
test("upload validates bytes before storage and cannot be finalized by another uploader", async () => {
  const h = harness(); const bytes = await image(); const result = await beginUpload(owner, "folder-a", body(bytes.length), h.db, h.storage);
  await assert.rejects(uploadDocument(owner, "folder-a", result.id, Buffer.alloc(bytes.length - 1), h.db, h.storage)); assert.equal(h.objects.size, 0);
  await assert.rejects(uploadDocument(correspondent, "folder-a", result.id, bytes, h.db, h.storage));
  await assert.rejects(finalizeUpload(correspondent, "folder-a", result.id, { version: 1 }, h.db, h.storage));
});
test("valid upload becomes ACTIVE with server checksum, event and idempotent finalize", async () => {
  const h = harness(); const id = await active(h); const row = h.documents.get(id)!;
  assert.equal(row.status, "ACTIVE"); assert.match(row.checksum!, /^[a-f0-9]{64}$/); assert.equal(h.version(), 2);
  assert.deepEqual(h.events.map(event => event.eventType), ["DOCUMENT_UPLOAD_STARTED", "DOCUMENT_ADDED"]);
  const repeat = await finalizeUpload(owner, "folder-a", id, { version: 0 }, h.db, h.storage); assert.ok("alreadyFinalized" in repeat && repeat.alreadyFinalized); assert.equal(h.events.length, 2);
});
test("download verifies active status, tenant, assignment and checksum", async () => {
  const h = harness(); const id = await active(h); assert.equal((await documentContent(correspondent, "folder-a", id, h.db, h.storage)).mimeType, "image/png");
  await assert.rejects(documentContent({ ...correspondent, user: { ...correspondent.user, id: "other" } }, "folder-a", id, h.db, h.storage));
  await assert.rejects(documentContent(owner, "foreign-folder", id, h.db, h.storage));
  const row = h.documents.get(id)!; row.status = "INVALIDATED"; await assert.rejects(documentContent(owner, "folder-a", id, h.db, h.storage), /não está ativo/);
  row.status = "ACTIVE"; row.checksum = "wrong"; await assert.rejects(documentContent(owner, "folder-a", id, h.db, h.storage), /Integridade/);
});
test("correspondent cannot invalidate or replace administration documents", async () => {
  const h = harness(); const id = await active(h); const png = await image();
  await assert.rejects(invalidateDocument(correspondent, "folder-a", id, { version: h.version(), reason: "synthetic" }, h.db), /somente documentos/);
  await assert.rejects(beginUpload(correspondent, "folder-a", { ...body(png.length, h.version()), replacedDocumentId: id, replacementReason: "synthetic" }, h.db, h.storage), /somente documentos/);
  assert.equal(h.documents.get(id)!.status, "ACTIVE");
});
test("own correspondent document and admin corrections preserve object and record history", async () => {
  const h = harness(); const id = await active(h, correspondent); const key = h.documents.get(id)!.storageKey;
  await invalidateDocument(correspondent, "folder-a", id, { version: h.version(), reason: "private synthetic reason" }, h.db);
  assert.equal(h.documents.get(id)!.status, "INVALIDATED"); assert.ok(h.objects.has(key)); assert.equal(h.events.at(-1)!.eventType, "DOCUMENT_INVALIDATED"); assert.equal(JSON.stringify(h.events).includes("private synthetic reason"), false);
  const second = await active(h); await invalidateDocument(owner, "folder-a", second, { version: h.version(), reason: "synthetic" }, h.db); assert.equal(h.documents.get(second)!.status, "INVALIDATED");
});
test("replacement uses a new key, activates new and marks original REPLACED atomically", async () => {
  const h = harness(); const previous = await active(h, correspondent); const bytes = await image(); const oldKey = h.documents.get(previous)!.storageKey;
  const next = await beginUpload(correspondent, "folder-a", { ...body(bytes.length, h.version()), replacedDocumentId: previous, replacementReason: "new readable copy" }, h.db, h.storage);
  assert.equal(h.documents.get(previous)!.status, "ACTIVE"); assert.notEqual(h.documents.get(next.id)!.storageKey, oldKey);
  await uploadDocument(correspondent, "folder-a", next.id, bytes, h.db, h.storage); await finalizeUpload(correspondent, "folder-a", next.id, { version: h.version() }, h.db, h.storage);
  assert.equal(h.documents.get(previous)!.status, "REPLACED"); assert.equal(h.documents.get(next.id)!.status, "ACTIVE"); assert.equal(h.documents.get(next.id)!.replacedDocumentId, previous); assert.ok(h.objects.has(oldKey)); assert.equal(h.objects.size, 2); assert.ok(h.events.some(event => event.eventType === "DOCUMENT_REPLACED"));
});
test("stale versions and expired upload cannot silently finalize", async () => {
  const h = harness(); const bytes = await image(); const start = await beginUpload(owner, "folder-a", body(bytes.length), h.db, h.storage); await uploadDocument(owner, "folder-a", start.id, bytes, h.db, h.storage);
  await assert.rejects(finalizeUpload(owner, "folder-a", start.id, { version: 0 }, h.db, h.storage), error => error instanceof DocumentationError && error.status === 409);
  h.documents.get(start.id)!.createdAt = new Date(Date.now() - 31 * 60 * 1000); await assert.rejects(finalizeUpload(owner, "folder-a", start.id, { version: 1 }, h.db, h.storage), error => error instanceof DocumentationError && error.status === 410);
});
test("list excludes inactive for correspondent and serializes bigint without storage keys", async () => {
  const h = harness(); const id = await active(h); const result = await listDocuments(correspondent, "folder-a", new URLSearchParams("audit=true"), h.db);
  assert.equal(result.items.length, 1); assert.equal(typeof result.items[0].fileSize, "number");
  assert.equal("storageKey" in result.items[0], false);
  h.documents.get(id)!.status = "INVALIDATED"; assert.equal((await listDocuments(correspondent, "folder-a", new URLSearchParams("audit=true"), h.db)).items.length, 0);
});
test("private storage fails closed without bucket or all public-access blocks", async t => {
  env(t); await assert.rejects(documentationStorage.ready(), /não configurado/);
  env(t, "synthetic-documentation-private"); mock(t, s3, "send", async () => ({ PublicAccessBlockConfiguration: { BlockPublicAcls: true, IgnorePublicAcls: false, BlockPublicPolicy: true, RestrictPublicBuckets: true } }));
  await assert.rejects(documentationStorage.ready(), /comprovar/);
});
test("S3 writes private encrypted immutable object; finalize checks metadata and ETag", async t => {
  env(t, "synthetic-documentation-private"); const bytes = await image(); const checksum = await validateFile(bytes, "image/png", bytes.length);
  const row: StoredDocument = { id: "doc-a", tenantId: "tenant-a", folderId: "folder-a", uploadedById: "owner-a", storageKey: "documentacoes/tenant-a/folder-a/uuid", mimeType: "image/png", fileSize: BigInt(bytes.length) }; let badMetadata = false;
  mock(t, s3, "send", async (command: object) => {
    if (command instanceof GetPublicAccessBlockCommand) return { PublicAccessBlockConfiguration: { BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true } };
    if (command instanceof PutObjectCommand) { assert.equal(command.input.ACL, undefined); assert.equal(command.input.IfNoneMatch, "*"); assert.equal(command.input.ServerSideEncryption, "AES256"); assert.equal(command.input.CacheControl, "private, no-store"); assert.equal(command.input.Metadata?.authorization, row.id); return {}; }
    if (command instanceof HeadObjectCommand) return { ContentLength: bytes.length, ContentType: "image/png", ETag: '"synthetic"', Metadata: { authorization: badMetadata ? "foreign" : row.id, tenant: row.tenantId, folder: row.folderId, uploader: row.uploadedById, sha256: checksum } };
    if (command instanceof GetObjectCommand) { assert.equal(command.input.IfMatch, '"synthetic"'); return { ContentLength: bytes.length, ContentType: "image/png", Body: (async function* () { yield bytes; })() }; }
    throw new Error("unexpected storage call");
  });
  await documentationStorage.put(row, bytes, checksum); assert.equal((await documentationStorage.get(row)).bytes.byteLength, bytes.length); badMetadata = true; await assert.rejects(documentationStorage.get(row), /não corresponde/);
});
test("new uploads remain available during analysis and after conclusions without changing workflow status", async () => {
  for (const status of ["EM_MONTAGEM", "AGUARDANDO_DOCUMENTOS", "PRONTA_PARA_ANALISE", "AGUARDANDO_CORRESPONDENTE", "PENDENCIA_DOCUMENTAL", "EM_REANALISE", "EM_ANALISE", "APROVADO", "CONDICIONADO", "REPROVADO"]) {
    for (const viewer of [owner, correspondent, { ...owner, user: { ...owner.user, id: "broker-a", role: "BROKER" as const } }]) {
      const h = harness(); h.folder.status = status;
      const id = await active(h, viewer);
      assert.equal(h.documents.get(id)!.status, "ACTIVE");
      assert.equal(h.folder.status, status);
      assert.equal((await listDocuments(viewer, "folder-a", new URLSearchParams(), h.db)).canUpload, true);
      assert.equal(h.objects.size, 1);
    }
  }
});

test("uploads initiated before a workflow status change can finish; destructive corrections stay locked", async () => {
  for (const status of ["AGUARDANDO_CORRESPONDENTE", "EM_REANALISE", "EM_ANALISE", "APROVADO", "CONDICIONADO", "REPROVADO"]) {
    const h = harness(); const png = await image(); const started = await beginUpload(owner, "folder-a", body(png.length), h.db, h.storage); h.folder.status = status;
    await uploadDocument(owner, "folder-a", started.id, png, h.db, h.storage);
    await finalizeUpload(owner, "folder-a", started.id, { version: 1 }, h.db, h.storage);
    assert.equal(h.folder.status, status);
    await assert.rejects(invalidateDocument(owner, "folder-a", started.id, { version: 2, reason: "test" }, h.db));
    await assert.rejects(beginUpload(owner, "folder-a", { ...body(png.length), version: 2, replacedDocumentId: started.id, replacementReason: "test" }, h.db, h.storage));
    const listed = await listDocuments(owner, "folder-a", new URLSearchParams(), h.db);
    assert.equal(listed.canUpload, true);
    assert.equal(listed.items[0].canCorrect, false);
    assert.equal(h.documents.get(started.id)!.status, "ACTIVE");
  }
});

test("responsible broker can read and correct own folder; other brokers cannot access it", async () => {
  const h = harness(); const id = await active(h);
  const broker: DocumentationViewer = { ...owner, user: { ...owner.user, id: "broker-a", role: "BROKER" } };
  const other: DocumentationViewer = { ...broker, user: { ...broker.user, id: "other-broker" } };
  assert.ok((await documentContent(broker, "folder-a", id, h.db, h.storage)).bytes.length);
  await assert.rejects(documentContent(other, "folder-a", id, h.db, h.storage), error => error instanceof DocumentationError && error.status === 404);
  const png = await image(); await assert.rejects(beginUpload(other, "folder-a", { ...body(png.length), version: 2 }, h.db, h.storage));
  h.folder.status = "PENDENCIA_DOCUMENTAL";
  await invalidateDocument(broker, "folder-a", id, { version: 2, reason: "Responsible correction" }, h.db); assert.equal(h.documents.get(id)!.status, "INVALIDATED");
});
test("new API endpoints refuse anonymous requests and unsupported MANAGER role", async t => {
  const context = { params: Promise.resolve({ id: "folder-a", documentId: "doc-a" }) }; const req = () => new Request("https://local.test/api/test", { method: "POST", body: "{}" });
  const handlers = [() => begin(req(), context), () => list(req(), context), () => upload(req(), context), () => finish(req(), context), () => invalidate(req(), context), () => content(req(), context)];
  for (const handler of handlers) assert.equal((await requestContext(undefined, handler)).status, 401);
  mock(t, prisma.user, "findFirst", async () => ({ id: "broker-a", tenantId: "tenant-a", role: "MANAGER", isActive: true, sessionVersion: 0, name: "Synthetic", email: "synthetic@example.invalid", tenant: { id: "tenant-a", name: "Synthetic", slug: "synthetic", parentId: null, isPlatform: false } }));
  const token = createSessionToken({ uid: "broker-a", tid: "tenant-a", role: "MANAGER", sv: 0 });
  for (const handler of handlers) assert.equal((await requestContext(token, handler)).status, 403);
});
test("assignment revocation during storage I/O prevents both download and finalization", async () => {
  const h = harness(); const id = await active(h, correspondent); const original = h.storage.get;
  h.storage.get = async row => { const object = await original(row); h.folder.correspondentId = "another-correspondent"; return object; };
  await assert.rejects(documentContent(correspondent, "folder-a", id, h.db, h.storage), /não atribuída/);
  const second = harness(); const png = await image(); const start = await beginUpload(correspondent, "folder-a", body(png.length), second.db, second.storage); await uploadDocument(correspondent, "folder-a", start.id, png, second.db, second.storage);
  const get = second.storage.get; second.storage.get = async row => { const value = await get(row); second.folder.correspondentId = "another-correspondent"; return value; };
  await assert.rejects(finalizeUpload(correspondent, "folder-a", start.id, { version: 1 }, second.db, second.storage)); assert.equal(second.documents.get(start.id)!.status, "PROCESSING");
});
test("invalidation during storage I/O prevents serving previously active content", async () => {
  const h = harness(); const id = await active(h); const get = h.storage.get;
  h.storage.get = async row => { const result = await get(row); h.documents.get(id)!.status = "INVALIDATED"; return result; };
  await assert.rejects(documentContent(owner, "folder-a", id, h.db, h.storage), /foi alterado/);
});
test("failed timeline insert rolls back replacement and activation while preserving objects", async () => {
  const h = harness(); const old = await active(h); const bytes = await image();
  const next = await beginUpload(owner, "folder-a", { ...body(bytes.length, h.version()), replacedDocumentId: old, replacementReason: "synthetic" }, h.db, h.storage); await uploadDocument(owner, "folder-a", next.id, bytes, h.db, h.storage);
  const version = h.version(); h.tx.documentationEvent.create = async () => { throw new Error("synthetic event failure"); };
  await assert.rejects(finalizeUpload(owner, "folder-a", next.id, { version }, h.db, h.storage), /event failure/);
  assert.equal(h.documents.get(old)!.status, "ACTIVE"); assert.equal(h.documents.get(next.id)!.status, "PROCESSING"); assert.equal(h.version(), version); assert.equal(h.objects.size, 2);
});
test("storage configuration failure creates no pending row or timeline event", async () => {
  const h = harness(); const png = await image(); h.storage.ready = async () => { throw new DocumentationError(503, "missing private bucket"); };
  await assert.rejects(beginUpload(owner, "folder-a", body(png.length), h.db, h.storage)); assert.equal(h.documents.size, 0); assert.equal(h.events.length, 0); assert.equal(h.version(), 0);
});
test("authenticated content endpoint emits protected headers and never a storage redirect", async t => {
  const h = harness(); const id = await active(h); const row = h.documents.get(id)!;
  env(t, "synthetic-documentation-private");
  mock(t, prisma.user, "findFirst", async () => ({ id: owner.user.id, tenantId: "tenant-a", role: "OWNER", isActive: true, sessionVersion: 0, name: "Synthetic", email: "synthetic@example.invalid", tenant: { id: "tenant-a", name: "Synthetic", slug: "synthetic", parentId: null, isPlatform: false } }));
  mock(t, prisma.documentationFolder, "findFirst", h.tx.documentationFolder.findFirst);
  mock(t, prisma.documentationDocument, "findFirst", h.tx.documentationDocument.findFirst);
  mock(t, prisma.documentationDocument, "count", h.tx.documentationDocument.count);
  const object = h.objects.get(row.storageKey)!;
  mock(t, s3, "send", async (command: object) => {
    if (command instanceof GetPublicAccessBlockCommand) return { PublicAccessBlockConfiguration: { BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true } };
    if (command instanceof HeadObjectCommand) return { ContentLength: object.bytes.length, ContentType: row.mimeType, ETag: '"synthetic"', Metadata: { authorization: id, tenant: row.tenantId, folder: row.folderId, uploader: row.uploadedById, sha256: object.checksum } };
    if (command instanceof GetObjectCommand) return { ContentLength: object.bytes.length, ContentType: row.mimeType, Body: (async function* () { yield object.bytes; })() };
    throw new Error("unexpected S3 call");
  });
  const token = createSessionToken({ uid: owner.user.id, tid: "tenant-a", role: "OWNER", sv: 0 });
  const response = await requestContext(token, () => content(new Request("https://local.test/file?download=true"), { params: Promise.resolve({ id: "folder-a", documentId: id }) }));
  assert.equal(response.status, 200); assert.match(response.headers.get("content-disposition")!, /^attachment/); assert.match(response.headers.get("cache-control")!, /no-store/); assert.equal(response.headers.get("x-content-type-options"), "nosniff"); assert.equal(response.headers.get("location"), null); assert.ok((await response.arrayBuffer()).byteLength);
  assert.match(response.headers.get("content-security-policy")!, /sandbox/);
});
test("best-effort preview and authenticated external download preserve ACTIVE status and bytes", async t => {
  for (const [mimeType, extension] of [["application/pdf", "pdf"], ["image/heic", "heic"], ["image/png", "png"]]) {
  const h = harness(); const bytes = Buffer.from("synthetic unrenderable document preserved as uploaded");
  const started = await beginUpload(owner, "folder-a", { ...body(bytes.length), originalFileName: `synthetic.${extension}`, mimeType }, h.db, h.storage);
  await uploadDocument(owner, "folder-a", started.id, bytes, h.db, h.storage); await finalizeUpload(owner, "folder-a", started.id, { version: 1 }, h.db, h.storage);
  const row = h.documents.get(started.id)!; const object = h.objects.get(row.storageKey)!; env(t, "synthetic-documentation-private");
  mock(t, prisma.user, "findFirst", async () => ({ id: owner.user.id, tenantId: "tenant-a", role: "OWNER", isActive: true, sessionVersion: 0, name: "Synthetic", email: "synthetic@example.invalid", tenant: { id: "tenant-a", name: "Synthetic", slug: "synthetic", parentId: null, isPlatform: false } }));
  mock(t, prisma.documentationFolder, "findFirst", h.tx.documentationFolder.findFirst); mock(t, prisma.documentationDocument, "findFirst", h.tx.documentationDocument.findFirst); mock(t, prisma.documentationDocument, "count", h.tx.documentationDocument.count);
  mock(t, s3, "send", async (command: object) => {
    if (command instanceof GetPublicAccessBlockCommand) return { PublicAccessBlockConfiguration: { BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true } };
    if (command instanceof HeadObjectCommand) return { ContentLength: bytes.length, ContentType: row.mimeType, ETag: '"synthetic"', Metadata: { authorization: row.id, tenant: row.tenantId, folder: row.folderId, uploader: row.uploadedById, sha256: object.checksum } };
    if (command instanceof GetObjectCommand) return { ContentLength: bytes.length, ContentType: row.mimeType, Body: (async function* () { yield bytes; })() };
    throw new Error("unexpected storage call");
  });
  const token = createSessionToken({ uid: owner.user.id, tid: "tenant-a", role: "OWNER", sv: 0 });
  const response = await requestContext(token, () => content(new Request("https://local.test/file"), { params: Promise.resolve({ id: "folder-a", documentId: row.id }) }));
  assert.equal(response.status, 200); assert.equal(response.headers.get("content-type"), mimeType);
  assert.match(response.headers.get("content-disposition")!, mimeType === "image/heic" ? /^attachment/ : /^inline/);
  assert.equal(response.headers.get("content-security-policy")!.includes("sandbox"), mimeType !== "application/pdf");
  assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.ok(Buffer.from(await response.arrayBuffer()).equals(bytes));
  assert.equal(row.status, "ACTIVE");
  }
});

for (const format of DOCUMENT_FORMATS) {
  test(`document storage preserves ${format.mime} bytes through upload, finalize and download`, async () => {
    const h = harness(); const bytes = Buffer.from("synthetic original document bytes");
    const started = await beginUpload(owner, "folder-a", { ...body(bytes.length), originalFileName: `synthetic.${format.extensions[0]}`, mimeType: format.mime }, h.db, h.storage);
    await uploadDocument(owner, "folder-a", started.id, bytes, h.db, h.storage);
    await finalizeUpload(owner, "folder-a", started.id, { version: 1 }, h.db, h.storage);
    const downloaded = await documentContent(owner, "folder-a", started.id, h.db, h.storage);
    assert.ok(Buffer.from(downloaded.bytes).equals(bytes));
    assert.equal(h.documents.get(started.id)!.status, "ACTIVE");
  });
}

test("received documents are bounded to a folder/tenant snapshot; own documents use existing upload origin", async () => {
  const h = harness(); h.folder.status = "EM_ANALISE";
  const calls: Args[] = [];
  h.tx.documentationDocument.findMany = async args => { calls.push(args); return []; };
  h.tx.documentationDocument.count = async args => { calls.push(args); return 0; };
  const own = await listDocuments(correspondent, "folder-a", new URLSearchParams("group=correspondent"), h.db);
  assert.equal(own.canUpload, true);
  assert.deepEqual(calls[0].where, { tenantId: "tenant-a", folderId: "folder-a", status: "ACTIVE", uploadOrigin: "CORRESPONDENT" });
  assert.deepEqual(calls[0].where, calls[1].where);
  calls.length = 0;
  await listDocuments(correspondent, "folder-a", new URLSearchParams("group=analysis&roundId=round-a"), h.db);
  assert.deepEqual(calls[0].where, { tenantId: "tenant-a", folderId: "folder-a", status: "ACTIVE", roundDocuments: { some: { tenantId: "tenant-a", folderId: "folder-a", roundId: "round-a" } } });
  assert.equal(calls[0].select?.storageKey, undefined); assert.equal(calls[0].select?.replacementReason, false);
  await assert.rejects(listDocuments(correspondent, "folder-a", new URLSearchParams("group=foreign"), h.db), /Grupo documental inválido/);
  await assert.rejects(listDocuments({ ...correspondent, user: { ...correspondent.user, id: "other-corr" } }, "folder-a", new URLSearchParams("group=correspondent"), h.db), /não atribuída/);
});
