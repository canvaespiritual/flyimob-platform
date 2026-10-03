import { randomUUID } from "node:crypto";
import { Prisma, type DocumentationDocument } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canManageDocumentation, type DocumentationViewer } from "./access-policy";
import { documentScope } from "./document-access.server";
import { DocumentationError, input, integer, text } from "./validation";
import { fileMetadata, validateFile, UPLOAD_WINDOW_MS } from "./file-policy";
import { documentationStorage, type DocumentationStorage } from "./storage.server";

type DB = Prisma.TransactionClient;
const editable = ["EM_MONTAGEM", "AGUARDANDO_DOCUMENTOS", "PENDENCIA_DOCUMENTAL"] as const;
async function folder(tx: DB, session: DocumentationViewer, id: string, write = false) {
  const row = await tx.documentationFolder.findFirst({ where: { id, ...documentScope(session) } });
  if (!row) throw new DocumentationError(404, "Pasta não encontrada ou não atribuída a você.");
  if (write && !editable.some(status => status === row.status)) throw new DocumentationError(409, "Alterações documentais indisponíveis neste status.");
  return row;
}
async function claim(tx: DB, session: DocumentationViewer, id: string, version: number, append = false) {
  await folder(tx, session, id, !append);
  const result = await tx.documentationFolder.updateMany({ where: { id, ...documentScope(session), version, ...(!append ? { status: { in: [...editable] } } : {}) }, data: { version: { increment: 1 }, updatedAt: new Date() } });
  if (result.count !== 1) throw new DocumentationError(409, "Esta pasta foi alterada. Atualize a página antes de continuar.");
}
function canCorrect(session: DocumentationViewer, document: Pick<DocumentationDocument, "uploadedById" | "uploadOrigin">) {
  return canManageDocumentation(session) || session.user.role === "BROKER" || (session.user.role === "CORRESPONDENTE" && document.uploadedById === session.user.id && document.uploadOrigin === "CORRESPONDENT");
}
async function event(tx: DB, session: DocumentationViewer, folderId: string, eventType: string, metadata: Prisma.InputJsonObject) {
  await tx.documentationEvent.create({ data: { tenantId: session.tenant.id, folderId, actorId: session.user.id, actorRole: session.user.role, eventType, metadata } });
}
async function document(tx: DB, session: DocumentationViewer, folderId: string, id: string, write = false) {
  await folder(tx, session, folderId, write);
  const row = await tx.documentationDocument.findFirst({ where: { id, tenantId: session.tenant.id, folderId } });
  if (!row) throw new DocumentationError(404, "Documento não encontrado.");
  if (!row.storageKey.startsWith(`documentacoes/${session.tenant.id}/${folderId}/`) || !/\/[^/]+$/.test(row.storageKey)) throw new DocumentationError(409, "Referência de storage inválida. Contate o administrador.");
  return row;
}
function processing(session: DocumentationViewer, row: DocumentationDocument) {
  if (row.uploadedById !== session.user.id) throw new DocumentationError(403, "Este upload pertence a outro usuário.");
  if (row.status !== "PROCESSING") throw new DocumentationError(409, "O upload já foi finalizado ou alterado.");
  if (row.createdAt.getTime() + UPLOAD_WINDOW_MS < Date.now()) throw new DocumentationError(410, "Autorização de upload expirada. Inicie um novo envio.");
}
async function uploadRow(tx: DB, session: DocumentationViewer, folderId: string, id: string) {
  const row = await document(tx, session, folderId, id);
  // Adding files is always allowed. Replacing an existing file still observes
  // the correction window so completed/ongoing analysis evidence is preserved.
  if (row.replacedDocumentId) await folder(tx, session, folderId, true);
  return row;
}
export async function beginUpload(session: DocumentationViewer, folderId: string, value: unknown, db = prisma, storage: DocumentationStorage = documentationStorage) {
  documentScope(session); const body = input(value);
  if ("storageKey" in body) throw new DocumentationError(400, "A referência do arquivo é definida pelo servidor.");
  const file = fileMetadata(body); const version = integer(body.version, "Versão");
  const personId = text(body.personId, "Pessoa"); const documentTypeId = text(body.documentTypeId, "Tipo");
  const replacedDocumentId = text(body.replacedDocumentId, "Documento anterior");
  const replacementReason = replacedDocumentId ? text(body.replacementReason, "Motivo da substituição", true, 1000) : null;
  await folder(db, session, folderId, !!replacedDocumentId); await storage.ready();
  return db.$transaction(async tx => {
    await claim(tx, session, folderId, version, !replacedDocumentId);
    if (personId && !await tx.documentationPerson.findFirst({ where: { id: personId, tenantId: session.tenant.id, folderId }, select: { id: true } })) throw new DocumentationError(400, "Pessoa não pertence a esta pasta.");
    if (documentTypeId && !await tx.documentationDocumentType.findFirst({ where: { id: documentTypeId, tenantId: session.tenant.id, isActive: true }, select: { id: true } })) throw new DocumentationError(400, "Tipo documental inválido ou inativo nesta operação.");
    if (await tx.documentationDocument.count({ where: { tenantId: session.tenant.id, folderId, status: "PROCESSING", createdAt: { gt: new Date(Date.now() - UPLOAD_WINDOW_MS) } } }) >= 30) throw new DocumentationError(429, "Há muitos uploads em andamento nesta pasta. Finalize os envios antes de iniciar outros.");
    if (replacedDocumentId) {
      const old = await document(tx, session, folderId, replacedDocumentId, true);
      if (old.status !== "ACTIVE") throw new DocumentationError(409, "Documento anterior não está ativo.");
      if (!canCorrect(session, old)) throw new DocumentationError(403, "Você pode corrigir somente documentos enviados por você.");
    }
    const id = randomUUID(); const storageKey = `documentacoes/${session.tenant.id}/${folderId}/${randomUUID()}`;
    await tx.documentationDocument.create({ data: { id, tenantId: session.tenant.id, folderId, personId, documentTypeId,
      uploadedById: session.user.id, uploadedByRole: session.user.role, uploadOrigin: session.user.role === "CORRESPONDENTE" ? "CORRESPONDENT" : "ADMINISTRATION",
      ...file, fileSize: BigInt(file.fileSize), storageKey, replacedDocumentId, replacementReason, status: "PROCESSING" } });
    await event(tx, session, folderId, "DOCUMENT_UPLOAD_STARTED", { documentId: id });
    return { id, version: version + 1, expiresAt: new Date(Date.now() + UPLOAD_WINDOW_MS).toISOString() };
  });
}
export async function uploadDocument(session: DocumentationViewer, folderId: string, id: string, bytes: Uint8Array, db = prisma, storage: DocumentationStorage = documentationStorage) {
  const row = await uploadRow(db, session, folderId, id); processing(session, row);
  const checksum = await validateFile(bytes, row.mimeType, Number(row.fileSize));
  await storage.put(row, bytes, checksum); return { ok: true };
}
export async function uploadAuthorization(session: DocumentationViewer, folderId: string, id: string, db = prisma) {
  const row = await uploadRow(db, session, folderId, id); processing(session, row); return { mimeType: row.mimeType, fileSize: Number(row.fileSize) };
}
export async function finalizeUpload(session: DocumentationViewer, folderId: string, id: string, value: unknown, db = prisma, storage: DocumentationStorage = documentationStorage) {
  const body = input(value); if ("storageKey" in body) throw new DocumentationError(400, "Referência de arquivo não aceita.");
  const version = integer(body.version, "Versão"); const row = await uploadRow(db, session, folderId, id);
  if (row.uploadedById !== session.user.id) throw new DocumentationError(403, "Este upload pertence a outro usuário.");
  if (row.status === "ACTIVE") { const current = await folder(db, session, folderId); return { id, version: current.version, alreadyFinalized: true }; }
  processing(session, row);
  const object = await storage.get(row); const checksum = await validateFile(object.bytes, row.mimeType, Number(row.fileSize));
  if (object.checksum !== checksum) throw new DocumentationError(409, "Integridade do arquivo não confirmada.");
  return db.$transaction(async tx => {
    await claim(tx, session, folderId, version, !row.replacedDocumentId);
    const current = await uploadRow(tx, session, folderId, id); processing(session, current);
    if (current.personId && !await tx.documentationPerson.findFirst({ where: { id: current.personId, tenantId: session.tenant.id, folderId } })) throw new DocumentationError(409, "A pessoa vinculada foi alterada.");
    if (current.documentTypeId && !await tx.documentationDocumentType.findFirst({ where: { id: current.documentTypeId, tenantId: session.tenant.id, isActive: true } })) throw new DocumentationError(409, "O tipo documental foi desativado.");
    if (current.replacedDocumentId) {
      const previous = await document(tx, session, folderId, current.replacedDocumentId, true);
      if (!canCorrect(session, previous)) throw new DocumentationError(403, "Correção não permitida.");
      const changed = await tx.documentationDocument.updateMany({ where: { id: previous.id, tenantId: session.tenant.id, folderId, status: "ACTIVE" }, data: { status: "REPLACED" } });
      if (changed.count !== 1) throw new DocumentationError(409, "O documento anterior foi alterado. Atualize a página.");
      await event(tx, session, folderId, "DOCUMENT_REPLACED", { documentId: current.id, previousDocumentId: previous.id });
    }
    const result = await tx.documentationDocument.updateMany({ where: { id, tenantId: session.tenant.id, folderId, status: "PROCESSING" }, data: { status: "ACTIVE", checksum } });
    if (result.count !== 1) throw new DocumentationError(409, "Este documento foi alterado. Atualize a página.");
    await event(tx, session, folderId, "DOCUMENT_ADDED", { documentId: id });
    return { id, version: version + 1 };
  });
}
export async function invalidateDocument(session: DocumentationViewer, folderId: string, id: string, value: unknown, db = prisma) {
  const body = input(value); const version = integer(body.version, "Versão"); const reason = text(body.reason, "Motivo", true, 1000)!;
  return db.$transaction(async tx => {
    await claim(tx, session, folderId, version); const row = await document(tx, session, folderId, id, true);
    if (!canCorrect(session, row)) throw new DocumentationError(403, "Você pode invalidar somente documentos enviados por você.");
    const result = await tx.documentationDocument.updateMany({ where: { id, tenantId: session.tenant.id, folderId, status: "ACTIVE" }, data: { status: "INVALIDATED", replacementReason: reason } });
    if (result.count !== 1) throw new DocumentationError(409, "Este documento foi alterado. Atualize a página.");
    await event(tx, session, folderId, "DOCUMENT_INVALIDATED", { documentId: id }); return { version: version + 1 };
  });
}
export async function documentContent(session: DocumentationViewer, folderId: string, id: string, db = prisma, storage: DocumentationStorage = documentationStorage) {
  const row = await document(db, session, folderId, id);
  if (row.status !== "ACTIVE") throw new DocumentationError(409, "Este documento não está ativo.");
  if (!row.checksum) throw new DocumentationError(409, "Documento ainda não validado.");
  const object = await storage.get(row); const checksum = await validateFile(object.bytes, row.mimeType, Number(row.fileSize));
  if (checksum !== row.checksum || object.checksum !== row.checksum) throw new DocumentationError(409, "Integridade do documento não confirmada.");
  await folder(db, session, folderId); // Re-check assignment after storage I/O.
  const active = await db.documentationDocument.count({ where: { id, tenantId: session.tenant.id, folderId, status: "ACTIVE", checksum: row.checksum } });
  if (!active) throw new DocumentationError(409, "Este documento foi alterado. Atualize a página.");
  return { bytes: object.bytes, mimeType: row.mimeType, originalFileName: row.originalFileName };
}
export async function listDocuments(session: DocumentationViewer, folderId: string, params: URLSearchParams, db = prisma) {
  const current = await folder(db, session, folderId);
  const page = Number(params.get("page") ?? 1); if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new DocumentationError(400, "Página inválida.");
  const admin = canManageDocumentation(session); const audit = admin && params.get("audit") === "true";
  const where: Prisma.DocumentationDocumentWhereInput = { tenantId: session.tenant.id, folderId, ...(audit ? {} : { status: "ACTIVE" }) };
  const [items, total, people, types] = await Promise.all([
    db.documentationDocument.findMany({ where, select: { id: true, personId: true, documentTypeId: true, documentType: { select: { name: true } }, originalFileName: true, mimeType: true, fileSize: true, status: true, createdAt: true, checksum: true, replacedDocumentId: true, replacementReason: admin ? true : false, uploadedById: true, uploadedByRole: true, uploadOrigin: true, uploadedBy: { select: { name: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 30, take: 30 }),
    db.documentationDocument.count({ where }),
    db.documentationPerson.findMany({ where: { tenantId: session.tenant.id, folderId }, select: { id: true, name: true, relationship: true }, orderBy: { createdAt: "asc" } }),
    db.documentationDocumentType.findMany({ where: { tenantId: session.tenant.id, isActive: true }, select: { id: true, name: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  const correctionsAllowed = editable.some(status => status === current.status);
  return { items: items.map(row => ({ ...row, fileSize: Number(row.fileSize), canCorrect: correctionsAllowed && canCorrect(session, row), canFinalize: (!row.replacedDocumentId || correctionsAllowed) && row.status === "PROCESSING" && row.uploadedById === session.user.id && row.createdAt.getTime() + UPLOAD_WINDOW_MS >= Date.now() })), total, page, pageSize: 30,
    version: current.version, people, types, canUpload: true, storageConfigured: !!process.env.AWS_S3_DOCUMENTATION_BUCKET };
}
