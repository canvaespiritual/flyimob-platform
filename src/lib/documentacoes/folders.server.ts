import { Prisma, type DocumentationFolderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { type DocumentationViewer, documentationFolderScope, canManageDocumentation } from "./access-policy";
import { initialCatalog } from "./catalog";
import { DocumentationError, input, text, integer, personInput, editableStatus, type Input } from "./validation";

import { canActAsSalesResponsible } from "@/lib/team/policy";
import { personSelect } from "@/lib/team/select.server";

type DB = Prisma.TransactionClient;
const editable = ["EM_MONTAGEM", "AGUARDANDO_DOCUMENTOS", "PENDENCIA_DOCUMENTAL"] as DocumentationFolderStatus[];
export const folderListSelect = {
  id: true, status: true, version: true, createdAt: true, updatedAt: true,
  people: { where: { relationship: "TITULAR" }, select: { name: true, cpf: true }, take: 1 },
  responsiblePerson: { select: { id: true, name: true } },
  broker: { select: { id: true, name: true } }, correspondent: { select: { id: true, name: true } },
} satisfies Prisma.DocumentationFolderSelect;

async function event(tx: DB, session: DocumentationViewer, folderId: string, eventType: string, metadata?: Prisma.InputJsonObject) {
  await tx.documentationEvent.create({ data: { tenantId: session.tenant.id, folderId,
    actorId: session.user.id, actorRole: session.user.role, eventType, metadata } });
}
export async function ensureCatalog(tx: DB, tenantId: string) {
  // Inserts missing codes only: never resets customized names/order/activation.
  return tx.documentationDocumentType.createMany({ data: initialCatalog(tenantId), skipDuplicates: true });
}
async function references(tx: DB, tenantId: string, body: Input, previous?: { responsiblePersonId: string | null; brokerId: string | null }) {
  const requestedId = text(body.responsiblePersonId ?? body.brokerId, "Responsável comercial", true)!;
  const correspondentId = text(body.correspondentId, "Correspondente");
  const crmLeadId = text(body.crmLeadId, "Cliente CRM");
  let construtoraId = text(body.construtoraId, "Construtora");
  const empreendimentoId = text(body.empreendimentoId, "Empreendimento");
  const unchanged = previous && (requestedId === previous.responsiblePersonId || (!body.responsiblePersonId && requestedId === previous.brokerId));
  let responsiblePersonId = previous?.responsiblePersonId ?? null;
  let brokerId = previous?.brokerId ?? null;
  if (!unchanged) {
    let person = await tx.operationPerson.findFirst({ where: { tenantId, id: requestedId }, select: personSelect });
    if (!person && body.responsiblePersonId === undefined) {
      const legacy = await tx.user.findFirst({ where: { tenantId, id: requestedId }, select: { personId: true } });
      person = legacy?.personId ? await tx.operationPerson.findFirst({ where: { tenantId, id: legacy.personId }, select: personSelect }) : null;
    }
    if (!person || !canActAsSalesResponsible(person)) throw new DocumentationError(400, "Responsável comercial inválido ou inativo nesta operação.");
    responsiblePersonId = person.id;
    brokerId = person.user?.id ?? null;
  }
  if (correspondentId && !await tx.user.findFirst({ where: { id: correspondentId, tenantId, role: "CORRESPONDENTE", isActive: true }, select: { id: true } })) throw new DocumentationError(400, "Correspondente inválido ou inativo nesta operação.");
  const lead = crmLeadId ? await tx.cRMLead.findFirst({ where: { id: crmLeadId, tenantId }, select: { id: true, nome: true, telefone: true, email: true } }) : null;
  if (crmLeadId && !lead) throw new DocumentationError(400, "Cliente CRM inválido nesta operação.");
  if (empreendimentoId) {
    const property = await tx.empreendimento.findFirst({ where: { id: empreendimentoId, tenantId }, select: { id: true, construtoraId: true } });
    if (!property) throw new DocumentationError(400, "Empreendimento inválido nesta operação.");
    if (property.construtoraId) {
      if (construtoraId && construtoraId !== property.construtoraId) throw new DocumentationError(400, "Empreendimento e construtora não correspondem.");
      construtoraId = property.construtoraId;
    }
  }
  if (construtoraId && !await tx.construtora.findFirst({ where: { id: construtoraId, tenantId }, select: { id: true } })) throw new DocumentationError(400, "Construtora inválida nesta operação.");
  return { responsiblePersonId, brokerId, correspondentId, crmLeadId, construtoraId, empreendimentoId, lead };
}
export async function createFolder(session: DocumentationViewer, value: unknown, db = prisma) {
  if (!canManageDocumentation(session)) throw new DocumentationError(403, "Acesso não permitido.");
  const body = input(value);
  return db.$transaction(async tx => {
    const { lead, ...refs } = await references(tx, session.tenant.id, body);
    const holder = input(body.holder);
    const person = personInput({ ...holder, name: holder.name ?? lead?.nome,
      phone: holder.phone ?? lead?.telefone, email: holder.email ?? lead?.email, relationship: "TITULAR" }, true);
    const folder = await tx.documentationFolder.create({ data: { tenantId: session.tenant.id, ...refs,
      createdById: session.user.id, administrativeObservation: text(body.administrativeObservation, "Observação", false, 3000),
      status: "EM_MONTAGEM", people: { create: person } }, select: { id: true, version: true } });
    await ensureCatalog(tx, session.tenant.id);
    await event(tx, session, folder.id, "FOLDER_CREATED");
    await event(tx, session, folder.id, "BROKER_ASSIGNED", { brokerId: refs.responsiblePersonId ?? refs.brokerId! });
    if (refs.correspondentId) await event(tx, session, folder.id, "CORRESPONDENT_ASSIGNED", { correspondentId: refs.correspondentId });
    return folder;
  });
}
async function claim(tx: DB, session: DocumentationViewer, folderId: string, version: number) {
  const folder = await tx.documentationFolder.findFirst({ where: { id: folderId, ...documentationFolderScope(session) } });
  if (!folder) throw new DocumentationError(404, "Pasta não encontrada.");
  if (!editable.includes(folder.status)) throw new DocumentationError(409, "Esta pasta não permite alterações administrativas nesta etapa.");
  const result = await tx.documentationFolder.updateMany({ where: { id: folderId, tenantId: session.tenant.id, version, status: { in: editable } }, data: { version: { increment: 1 }, updatedAt: new Date() } });
  if (result.count !== 1) throw new DocumentationError(409, "A pasta foi atualizada. Recarregue antes de salvar.");
  return folder;
}
export async function updateFolder(session: DocumentationViewer, id: string, value: unknown, db = prisma) {
  if (!canManageDocumentation(session)) throw new DocumentationError(403, "Acesso não permitido.");
  const body = input(value); const version = integer(body.version, "Versão");
  return db.$transaction(async tx => {
    const before = await claim(tx, session, id, version);
    const resolved = await references(tx, session.tenant.id, { ...before, ...body, ...(body.brokerId !== undefined && body.responsiblePersonId === undefined ? { responsiblePersonId: undefined } : {}) }, before);
    const refs = { responsiblePersonId: resolved.responsiblePersonId, brokerId: resolved.brokerId, correspondentId: resolved.correspondentId, crmLeadId: resolved.crmLeadId, construtoraId: resolved.construtoraId, empreendimentoId: resolved.empreendimentoId };
    const administrativeObservation = body.administrativeObservation === undefined ? before.administrativeObservation : text(body.administrativeObservation, "Observação", false, 3000);
    if (before.status === "PENDENCIA_DOCUMENTAL" && body.status !== undefined && body.status !== before.status) throw new DocumentationError(409, "Use o reenvio para mudar o status da pasta com pendências.");
    const status = body.status === undefined || body.status === before.status ? before.status : editableStatus(body.status);
    await tx.documentationFolder.update({ where: { tenantId_id: { tenantId: session.tenant.id, id } }, data: { ...refs, status, administrativeObservation } });
    if (body.holder !== undefined) {
      const holder = personInput({ ...input(body.holder), relationship: "TITULAR" }, true);
      const person = await tx.documentationPerson.findFirst({ where: { tenantId: session.tenant.id, folderId: id, relationship: "TITULAR" }, select: { id: true } });
      if (!person) throw new DocumentationError(409, "Titular ausente. A pasta precisa ser revisada.");
      await tx.documentationPerson.update({ where: { tenantId_folderId_id: { tenantId: session.tenant.id, folderId: id, id: person.id } }, data: holder });
      await event(tx, session, id, "PERSON_UPDATED", { personId: person.id });
    }
    await event(tx, session, id, "FOLDER_UPDATED", { fields: Object.keys(body).filter(key => ["status", "holder", "administrativeObservation", "crmLeadId", "construtoraId", "empreendimentoId"].includes(key)) });
    if (before.responsiblePersonId !== refs.responsiblePersonId || before.brokerId !== refs.brokerId) await event(tx, session, id, "BROKER_ASSIGNED", { brokerId: refs.responsiblePersonId ?? refs.brokerId! });
    if (before.correspondentId !== refs.correspondentId) await event(tx, session, id, before.correspondentId ? "CORRESPONDENT_CHANGED" : "CORRESPONDENT_ASSIGNED", { correspondentId: refs.correspondentId });
    return { id, version: version + 1 };
  });
}
export async function mutatePerson(session: DocumentationViewer, folderId: string, personId: string | null, method: "POST" | "PATCH" | "DELETE", value: unknown, db = prisma) {
  if (!canManageDocumentation(session)) throw new DocumentationError(403, "Acesso não permitido.");
  const body = input(value); const version = integer(body.version, "Versão");
  return db.$transaction(async tx => {
    await claim(tx, session, folderId, version);
    const where = { tenantId: session.tenant.id, folderId };
    const person = personId ? await tx.documentationPerson.findFirst({ where: { ...where, id: personId } }) : null;
    if (personId && !person) throw new DocumentationError(404, "Pessoa não encontrada nesta pasta.");
    if (method === "DELETE") {
      if (!person || person.relationship === "TITULAR") throw new DocumentationError(409, "O titular não pode ser removido.");
      if (await tx.documentationDocument.count({ where: { ...where, personId } }) || await tx.documentationPendingItem.count({ where: { ...where, personId } })) throw new DocumentationError(409, "Pessoa vinculada a documentos ou pendências não pode ser removida.");
      await tx.documentationPerson.delete({ where: { tenantId_folderId_id: { ...where, id: person.id } } });
      await event(tx, session, folderId, "PERSON_REMOVED", { personId: person.id });
    } else {
      const values = personInput(body, person?.relationship === "TITULAR");
      if (person?.relationship === "TITULAR" && values.relationship !== "TITULAR") throw new DocumentationError(409, "O titular não pode perder seu vínculo.");
      if (values.relationship === "TITULAR" && await tx.documentationPerson.count({ where: { ...where, relationship: "TITULAR", ...(personId ? { id: { not: personId } } : {}) } })) throw new DocumentationError(409, "A pasta já possui um titular.");
      const changed = person ? await tx.documentationPerson.update({ where: { tenantId_folderId_id: { ...where, id: person.id } }, data: values }) : await tx.documentationPerson.create({ data: { ...where, ...values } });
      await event(tx, session, folderId, person ? "PERSON_UPDATED" : "PERSON_ADDED", { personId: changed.id, relationship: values.relationship });
    }
    return { version: version + 1 };
  });
}
