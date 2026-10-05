import { randomBytes } from "node:crypto";
import { OperationalRole, UserRole, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { bodyObject, MarketingError, text, type MarketingViewer } from "@/lib/marketing/policy";
import { audit, marketingTransaction } from "@/lib/marketing/admin.server";
import { eligiblePerson } from "./policy";
import { personSelect } from "./select.server";

export function teamOwner(viewer: MarketingViewer) {
  if (viewer.user.role !== "OWNER" || viewer.user.tenantId !== viewer.tenant.id) throw new MarketingError(403, "Somente OWNER pode administrar a equipe.");
}
export async function people(tenantId: string, db = prisma) {
  const rows = await db.operationPerson.findMany({ where: { tenantId, mergedIntoId: null }, select: personSelect, orderBy: [{ name: "asc" }, { id: "asc" }] });
  return rows.map(person => ({ ...person, eligible: eligiblePerson(person) }));
}
function email(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const result = text(value, "E-mail", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new MarketingError(400, "E-mail inválido.");
  return result;
}

/** Explicit identity union only: no matching by name/email and no financial records deleted. */
export async function mergePerson(tx: Prisma.TransactionClient, tenantId: string, sourceId: string, targetId: string) {
  if (sourceId === targetId) return;
  const rows = await tx.operationPerson.findMany({ where: { tenantId, id: { in: [sourceId, targetId] }, mergedIntoId: null }, include: { user: true, financialParticipant: true } });
  const source = rows.find(p => p.id === sourceId), target = rows.find(p => p.id === targetId);
  if (!source || !target || (source.user && target.user) || (source.financialParticipant && target.financialParticipant)) throw new MarketingError(409, "Vínculo conflitante. Cada pessoa admite um acesso e um participante.");
  if (source.user) await tx.user.update({ where: { id: source.user.id }, data: { personId: targetId } });
  if (source.financialParticipant) await tx.financialParticipant.update({ where: { id: source.financialParticipant.id }, data: { personId: targetId } });
  await tx.documentationFolder.updateMany({ where: { tenantId, responsiblePersonId: sourceId }, data: { responsiblePersonId: targetId } });
  await tx.campaignBrokerAssignment.updateMany({ where: { tenantId, personId: sourceId }, data: { personId: targetId } });
  if (source.independent && !target.independent) await tx.operationPerson.update({ where: { tenantId_id: { tenantId, id: targetId } }, data: { independent: true } });
  await tx.operationPerson.update({ where: { tenantId_id: { tenantId, id: sourceId } }, data: { mergedIntoId: targetId, active: false } });
}

export async function savePerson(viewer: MarketingViewer, id: string | null, value: unknown, db = prisma) {
  teamOwner(viewer);
  const body = bodyObject(value, ["name", "email", "operationalRole", "active", "participantId", "userId"]);
  const name = text(body.name, "Nome"), mail = email(body.email);
  if (!Object.values(OperationalRole).includes(body.operationalRole as OperationalRole) || typeof body.active !== "boolean") throw new MarketingError(400, "Função/status inválidos.");
  const participantId = body.participantId ? text(body.participantId, "Participante") : null;
  const userId = body.userId ? text(body.userId, "Usuário") : null;
  return marketingTransaction(db, async tx => {
    const tenantId = viewer.tenant.id;
    const participant = participantId ? await tx.financialParticipant.findFirst({ where: { tenantId, id: participantId } }) : null;
    const user = userId ? await tx.user.findFirst({ where: { tenantId, id: userId } }) : null;
    if ((participantId && !participant) || (userId && !user)) throw new MarketingError(400, "Vínculo fora desta operação.");
    if (participant?.userId && userId && participant.userId !== userId) throw new MarketingError(409, "Participante já vinculado a outro usuário.");
    // Selecting an existing identity is reuse, never a duplicate administrative creation.
    const existingId = id ?? user?.personId ?? participant?.personId;
    const existing = existingId ? await tx.operationPerson.findFirst({ where: { tenantId, id: existingId, mergedIntoId: null }, include: { user: true, financialParticipant: true } }) : null;
    if (existingId && !existing) throw new MarketingError(404, "Pessoa não encontrada.");
    if (existing?.user && userId && existing.user.id !== userId) throw new MarketingError(409, "Pessoa já possui outro acesso.");
    if (existing?.financialParticipant && participantId && existing.financialParticipant.id !== participantId) throw new MarketingError(409, "Pessoa já possui outro participante.");
    const person = existing ?? await tx.operationPerson.create({ data: { tenantId, name, email: mail, independent: true } });
    for (const sourceId of new Set([user?.personId, participant?.personId])) {
      if (sourceId && sourceId !== person.id) { await mergePerson(tx, tenantId, sourceId, person.id); await audit(tx, viewer, "PERSON_MERGED", sourceId, { after: person.id }); }
    }
    if (user) await tx.user.update({ where: { id: user.id }, data: { personId: person.id } });
    if (participant) await tx.financialParticipant.update({ where: { id: participant.id }, data: { personId: person.id, ...(user ? { userId: user.id } : {}) } });
    // Existing links are preserved when omitted; unlinking/replacing is intentionally a separate decision.
    const linkedUser = user ?? existing?.user;
    const linkedParticipant = participant ?? existing?.financialParticipant;
    if (linkedUser && linkedParticipant && !linkedParticipant.userId) await tx.financialParticipant.update({ where: { id: linkedParticipant.id }, data: { userId: linkedUser.id, personId: person.id } });
    // An explicit team edit affirms operational identity independently of login/finance status.
    await tx.operationPerson.update({ where: { tenantId_id: { tenantId, id: person.id } }, data: { name, email: mail, operationalRole: body.operationalRole as OperationalRole, active: body.active as boolean, independent: true } });
    await audit(tx, viewer, "PERSON_SAVED", person.id, { before: existing?.operationalRole ?? null, after: body.operationalRole as string });
    return { id: person.id };
  });
}

export async function enableAccess(viewer: MarketingViewer, id: string, value: unknown, db = prisma) {
  teamOwner(viewer);
  const body = bodyObject(value, ["email", "systemRole"]), mail = email(body.email);
  const role = body.systemRole as UserRole;
  if (!mail || !["DIRECTOR", "MANAGER", "BROKER", "DATA_ENTRY", "CORRESPONDENTE"].includes(role)) throw new MarketingError(400, "E-mail/permissão de acesso inválidos.");
  const token = randomBytes(32).toString("hex");
  await marketingTransaction(db, async tx => {
    const tenantId = viewer.tenant.id;
    const person = await tx.operationPerson.findFirst({ where: { tenantId, id, mergedIntoId: null }, select: personSelect });
    if (!person || !person.active) throw new MarketingError(400, "Selecione uma pessoa ativa.");
    if (person.user && (!person.user.isActive || person.user.email !== mail || person.user.role !== role)) throw new MarketingError(409, "Acesso existente: mantenha e-mail/permissão; reativação usa a gestão de acesso atual.");
    if (viewer.tenant.isPlatform && role === "CORRESPONDENTE") throw new MarketingError(403, "Correspondentes pertencem a uma operação.");
    const user = person.user ?? await tx.user.create({ data: { tenantId, personId: id, name: person.name, email: mail, role, passwordHash: null } });
    if (person.financialParticipant) await tx.financialParticipant.update({ where: { id: person.financialParticipant.id }, data: { userId: user.id, personId: id } });
    await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
    await tx.passwordResetToken.create({ data: { userId: user.id, token, expiresAt: new Date(Date.now() + 3600000) } });
    await audit(tx, viewer, "PERSON_ACCESS_ENABLED", id, { after: role });
  });
  // Returned only to authenticated OWNER, no logging/audit of the bearer token.
  return { path: `/reset-password/${token}`, expiresInMinutes: 60 };
}
