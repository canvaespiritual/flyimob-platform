import { GetObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/prisma";
import { MarketingError } from "@/lib/marketing/policy";
import { documentationStorage, type DocumentationStorage } from "@/lib/documentacoes/storage.server";
import { s3, S3_BUCKET, S3_REGION } from "@/lib/s3";
import type { OfficeIdentity } from "./identity.server";
import type { OfficeDb } from "./db.server";

export async function officeReceipt(identity: OfficeIdentity, kind: string, id: string, db: OfficeDb = prisma, storage: DocumentationStorage = documentationStorage) {
  const tenantId = identity.tenantId;
  if (kind === "marketing") {
    const receipt = await db.marketingMoneyReceipt.findFirst({ where: { id, tenantId, movement: { tenantId, OR: [{ beneficiaryPersonId: { in: identity.personIds } }, { origin: "PERSON", personId: { in: identity.personIds } }] } } });
    if (!receipt) throw new MarketingError(404, "Comprovante não encontrado na sua operação.");
    const result = await storage.get({ ...receipt, folderId: receipt.movementId });
    if (result.checksum !== receipt.checksum) throw new MarketingError(409, "Comprovante divergente.");
    return { bytes: result.bytes, name: receipt.originalName };
  }
  if (kind !== "finance") throw new MarketingError(404, "Comprovante indisponível.");
  const receipt = await db.financialAttachment.findFirst({ where: { id, tenantId }, select: { id: true, entityType: true, entityId: true, storageKey: true, url: true, originalName: true, sizeBytes: true } });
  if (!receipt) throw new MarketingError(404, "Comprovante não encontrado na sua operação.");
  const where = { id: receipt.entityId, tenantId, participantId: { in: identity.participantIds } };
  const entity = receipt.entityType === "PAYMENT" ? await db.financialPayment.findFirst({ where, select: { id: true } }) : receipt.entityType === "ADJUSTMENT" ? await db.financialAdjustment.findFirst({ where, select: { id: true } }) : null;
  if (!entity) throw new MarketingError(404, "Comprovante não encontrado na sua operação.");
  let key = receipt.storageKey;
  if (!key) {
    const url = new URL(receipt.url);
    if (url.protocol !== "https:" || url.hostname !== `${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com`) throw new MarketingError(503, "Comprovante legado precisa de revisão de armazenamento.");
    key = decodeURIComponent(url.pathname.slice(1));
  }
  if (!key.startsWith(`public/financeiro/${tenantId}/${receipt.entityType.toLowerCase()}/${receipt.entityId}/`) || key.includes("..")) throw new MarketingError(503, "Chave de comprovante precisa de revisão.");
  const object = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  if (!object.Body || !object.ContentLength || object.ContentLength > 30 * 1024 * 1024) throw new MarketingError(503, "Comprovante indisponível.");
  const bytes = await object.Body.transformToByteArray();
  if (bytes.length !== object.ContentLength) throw new MarketingError(503, "Comprovante incompleto.");
  return { bytes, name: receipt.originalName };
}
