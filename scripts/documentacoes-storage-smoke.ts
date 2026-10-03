import { loadEnvConfig } from "@next/env";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
loadEnvConfig(process.cwd());

async function main() {
  const { requestContext } = await import("../tests/documentacoes/request-context");
  const { prisma } = await import("../src/lib/prisma");
  const { s3 } = await import("../src/lib/s3");
  const { documentationStorage } = await import("../src/lib/documentacoes/storage.server");
  const { PDFDocument } = await import("pdf-lib");
  const { createSessionToken } = await import("../src/lib/auth.server");
  const { HeadBucketCommand, GetPublicAccessBlockCommand, DeleteObjectCommand, HeadObjectCommand } = await import("@aws-sdk/client-s3");
  const root = await import("../src/app/api/documentacoes/pastas/[id]/documentos/route");
  const upload = await import("../src/app/api/documentacoes/pastas/[id]/documentos/[documentId]/upload/route");
  const finalize = await import("../src/app/api/documentacoes/pastas/[id]/documentos/[documentId]/finalizar/route");
  const invalidate = await import("../src/app/api/documentacoes/pastas/[id]/documentos/[documentId]/invalidar/route");
  const fileRoute = await import("../src/app/api/documentacoes/pastas/[id]/documentos/[documentId]/arquivo/route");
  const Bucket = "flyimob-documentacoes2";
  assert.equal(process.env.AWS_S3_DOCUMENTATION_BUCKET, Bucket);
  assert.equal(process.env.AWS_REGION, "us-east-2");
  const keys = new Set<string>(); const marker = `storage-smoke-${randomUUID()}`;
  const results: string[] = []; let tenantId: string | undefined; let rollbackVerified = false;
  const rollback = new Error("CONTROLLED_STORAGE_SMOKE_ROLLBACK");
  try {
    const head = await s3.send(new HeadBucketCommand({ Bucket }));
    assert.equal(head.BucketRegion, "us-east-2");
    const block = (await s3.send(new GetPublicAccessBlockCommand({ Bucket }))).PublicAccessBlockConfiguration;
    for (const key of ["BlockPublicAcls", "IgnorePublicAcls", "BlockPublicPolicy", "RestrictPublicBuckets"] as const) assert.equal(block?.[key], true);
    await documentationStorage.ready(); results.push("bucket_region_and_four_private_controls");
    const pdf = await PDFDocument.create(); pdf.addPage([100, 100]); const bytes = await pdf.save();
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const direct = { id: randomUUID(), tenantId: marker, folderId: "synthetic-direct-test", storageKey: `documentacoes/${marker}/synthetic-direct-test/${randomUUID()}`, mimeType: "application/pdf", fileSize: BigInt(bytes.length), uploadedById: marker };
    keys.add(direct.storageKey);
    await documentationStorage.put(direct, bytes, checksum); results.push("direct_put");
    const fetched = await documentationStorage.get(direct);
    assert.deepEqual(Buffer.from(fetched.bytes), Buffer.from(bytes)); assert.equal(fetched.checksum, checksum);
    assert.equal(createHash("sha256").update(fetched.bytes).digest("hex"), checksum); results.push("direct_get_bytes_sha256_equal");

    try {
      await prisma.$transaction(async tx => {
        const tenant = await tx.tenant.create({ data: { name: marker, slug: marker } }); tenantId = tenant.id;
        const owner = await tx.user.create({ data: { tenantId: tenant.id, name: marker, email: `${marker}-owner@example.invalid`, role: "OWNER" } });
        const broker = await tx.user.create({ data: { tenantId: tenant.id, name: marker, email: `${marker}-broker@example.invalid`, role: "BROKER" } });
        const folder = await tx.documentationFolder.create({ data: { tenantId: tenant.id, brokerId: broker.id, createdById: owner.id } });
        const person = await tx.documentationPerson.create({ data: { tenantId: tenant.id, folderId: folder.id, name: marker, relationship: "TITULAR" } });
        const type = await tx.documentationDocumentType.create({ data: { tenantId: tenant.id, code: marker, name: marker } });
        // Real SQL transaction + savepoints: route services share uncommitted synthetic records.
        const originalTransaction = prisma.$transaction;
        const delegates = ["user", "documentationFolder", "documentationPerson", "documentationDocumentType", "documentationDocument", "documentationEvent"] as const;
        const restores: Array<() => void> = [];
        for (const name of delegates) { const original = prisma[name]; Object.assign(prisma, { [name]: tx[name] }); restores.push(() => Object.assign(prisma, { [name]: original })); }
        let serial = 0;
        Object.assign(prisma, { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
          const savepoint = `storage_smoke_${++serial}`;
          await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
          try { const value = await callback(tx); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`); return value; }
          catch (error) { await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`); throw error; }
        } });
        try {
          const token = createSessionToken({ uid: owner.id, tid: tenant.id, role: owner.role, sv: 0 });
          const brokerToken = createSessionToken({ uid: broker.id, tid: tenant.id, role: broker.role, sv: 0 });
          const context = { params: Promise.resolve({ id: folder.id }) };
          const url = `https://local.test/api/documentacoes/pastas/${folder.id}/documentos`;
          const jsonRequest = (body: unknown) => new Request(url, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://local.test" }, body: JSON.stringify(body) });
          let version = 0;
          async function send(replacedDocumentId?: string) {
            const started = await requestContext(token, () => root.POST(jsonRequest({ version, originalFileName: "synthetic-test.pdf", mimeType: "application/pdf", fileSize: bytes.length, personId: person.id, documentTypeId: type.id, replacedDocumentId, replacementReason: replacedDocumentId ? "Synthetic replacement test" : undefined }), context));
            assert.equal(started.status, 201); const authorization = await started.json(); version = authorization.version;
            assert.ok(!JSON.stringify(authorization).match(/storageKey|amazonaws|https?:/));
            const row = await tx.documentationDocument.findUniqueOrThrow({ where: { id: authorization.id } }); keys.add(row.storageKey);
            const docContext = { params: Promise.resolve({ id: folder.id, documentId: row.id }) };
            const sent = await requestContext(token, () => upload.PUT(new Request(url, { method: "PUT", headers: { "Content-Type": "application/pdf", Origin: "https://local.test" }, body: new Uint8Array(bytes) }), docContext));
            assert.equal(sent.status, 200);
            const completed = await requestContext(token, () => finalize.POST(jsonRequest({ version }), docContext));
            assert.equal(completed.status, 200); const completion = await completed.json(); version = completion.version;
            const active = await tx.documentationDocument.findUniqueOrThrow({ where: { id: row.id } });
            assert.equal(active.status, "ACTIVE"); assert.equal(active.checksum, checksum);
            return docContext;
          }
          const first = await send(); results.push("real_routes_start_put_finalize_sql_persistence");
          for (const suffix of ["", "?download=true"]) {
            const response = await requestContext(token, () => fileRoute.GET(new Request(url + suffix), first));
            assert.equal(response.status, 200); assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from(bytes));
            assert.match(response.headers.get("Cache-Control")!, /no-store/); assert.equal(response.headers.get("Location"), null);
            assert.match(response.headers.get("Content-Disposition")!, suffix ? /^attachment/ : /^inline/);
          }
          assert.equal((await requestContext(undefined, () => fileRoute.GET(new Request(url), first))).status, 401);
          assert.equal((await requestContext(brokerToken, () => fileRoute.GET(new Request(url), first))).status, 200);
          const listed = await requestContext(token, () => root.GET(new Request(url), context)); assert.equal(listed.status, 200);
          assert.ok(!JSON.stringify(await listed.json()).match(/storageKey|amazonaws/)); results.push("authenticated_preview_download_authorization_no_storage_leak");
          const oldId = (await first.params).documentId; const second = await send(oldId);
          assert.equal((await tx.documentationDocument.findUniqueOrThrow({ where: { id: oldId } })).status, "REPLACED");
          assert.equal((await requestContext(token, () => fileRoute.GET(new Request(url), first))).status, 409);
          const invalidated = await requestContext(token, () => invalidate.POST(jsonRequest({ version, reason: "Synthetic invalidation test" }), second));
          assert.equal(invalidated.status, 200);
          assert.equal((await requestContext(token, () => fileRoute.GET(new Request(url), second))).status, 409);
          results.push("replacement_invalidation_inactive_access_denied");
        } finally { Object.assign(prisma, { $transaction: originalTransaction }); restores.reverse().forEach(restore => restore()); }
        throw rollback;
      }, { timeout: 120000, maxWait: 10000 });
    } catch (error) { if (error !== rollback) throw error; }
    assert.equal(await prisma.tenant.count({ where: { slug: marker } }), 0);
    assert.equal(await prisma.user.count({ where: { email: { startsWith: marker } } }), 0);
    if (tenantId) {
      for (const count of [await prisma.documentationDocument.count({ where: { tenantId } }), await prisma.documentationFolder.count({ where: { tenantId } }), await prisma.documentationPerson.count({ where: { tenantId } }), await prisma.documentationDocumentType.count({ where: { tenantId } }), await prisma.documentationEvent.count({ where: { tenantId } })]) assert.equal(count, 0);
    }
    rollbackVerified = true; results.push("all_sql_synthetic_records_rolled_back");
  } finally {
    const failures: string[] = [];
    for (const Key of keys) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket, Key }));
        try { await s3.send(new HeadObjectCommand({ Bucket, Key })); throw new Error("Object still exists"); }
        catch (error) { if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404) throw error; }
      } catch { failures.push(Key); }
    }
    await prisma.$disconnect(); s3.destroy();
    console.log(JSON.stringify({ results, testObjects: keys.size, cleanupFailures: failures, databaseRollback: rollbackVerified }));
    if (failures.length) throw new Error("Synthetic object cleanup failed");
  }
}
void main().catch(error => {
  const safe = error as { name?: string; code?: string; $metadata?: { httpStatusCode?: number } };
  console.error(JSON.stringify({ failed: true, name: safe.name, code: safe.code, httpStatus: safe.$metadata?.httpStatusCode })); process.exitCode = 1;
});
