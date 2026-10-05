import { Prisma, type DocumentationAnalysisResult } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canManageDocumentation, type DocumentationViewer } from "./access-policy";
import { documentScope } from "./document-access.server";
import { DocumentationError, input, integer, text } from "./validation";
import { UPLOAD_WINDOW_MS } from "./file-policy";

const submissionStates = ["EM_MONTAGEM", "AGUARDANDO_DOCUMENTOS", "PRONTA_PARA_ANALISE", "PENDENCIA_DOCUMENTAL"];
const waitingStates = ["AGUARDANDO_CORRESPONDENTE", "EM_REANALISE"];
const results: DocumentationAnalysisResult[] = ["PENDENCIA_DOCUMENTAL", "APROVADO", "CONDICIONADO", "REPROVADO"];
export type WorkflowAction = "submit" | "start" | "issue" | "editIssue" | "cancelIssue" | "resolve" | "note" | "finish";
function responsible(session: DocumentationViewer) { return canManageDocumentation(session) || session.user.role === "BROKER"; }
async function event(tx: Prisma.TransactionClient, session: DocumentationViewer, folderId: string, roundId: string, eventType: string, metadata: Prisma.InputJsonObject = {}) {
  await tx.documentationEvent.create({ data: { tenantId: session.tenant.id, folderId, roundId, eventType, actorId: session.user.id, actorRole: session.user.role, metadata } });
}
export async function workflowMutation(session: DocumentationViewer, folderId: string, action: WorkflowAction, value: unknown, db = prisma) {
  const scope = documentScope(session); const body = input(value); const version = integer(body.version, "Versão");
  return db.$transaction(async tx => {
    const folder = await tx.documentationFolder.findFirst({ where: { id: folderId, ...scope } });
    if (!folder) throw new DocumentationError(404, "Pasta não encontrada ou não atribuída a você.");
    const latest = await tx.documentationAnalysisRound.findFirst({ where: { tenantId: session.tenant.id, folderId }, orderBy: { sequence: "desc" } });
    if (folder.version !== version) throw new DocumentationError(409, "Esta pasta foi alterada. Atualize antes de continuar.");
    // A single folder CAS serializes every change, including issues, documents and assignment.
    const claimed = await tx.documentationFolder.updateMany({ where: { id: folderId, ...scope, version, status: folder.status }, data: { version: { increment: 1 } } });
    if (claimed.count !== 1) throw new DocumentationError(409, "Operação concorrente. Atualize a pasta.");
    if (action === "submit") {
      if (!responsible(session)) throw new DocumentationError(403, "Somente o responsável pode enviar a pasta.");
      if (!submissionStates.includes(folder.status)) throw new DocumentationError(409, "Este estado não permite envio.");
      if (!folder.correspondentId || !await tx.user.findFirst({ where: { id: folder.correspondentId, tenantId: session.tenant.id, role: "CORRESPONDENTE", isActive: true } })) throw new DocumentationError(400, "Atribua um correspondente ativo antes de enviar.");
      if (latest && (!latest.closedAt || folder.status !== "PENDENCIA_DOCUMENTAL")) throw new DocumentationError(409, "Rodada anterior incompatível com novo envio.");
      if (await tx.documentationPendingItem.count({ where: { tenantId: session.tenant.id, folderId, status: "OPEN" } })) throw new DocumentationError(409, "Resolva todas as pendências antes de reenviar.");
      if (await tx.documentationDocument.count({ where: { tenantId: session.tenant.id, folderId, status: "PROCESSING", createdAt: { gt: new Date(Date.now() - UPLOAD_WINDOW_MS) } } })) throw new DocumentationError(409, "Finalize os uploads em andamento antes de enviar.");
      const documents = await tx.documentationDocument.findMany({ where: { tenantId: session.tenant.id, folderId, status: "ACTIVE", checksum: { not: null } }, select: { id: true } });
      if (!documents.length) throw new DocumentationError(400, "Adicione ao menos um documento finalizado antes de enviar.");
      const round = await tx.documentationAnalysisRound.create({ data: { tenantId: session.tenant.id, folderId, sequence: (latest?.sequence ?? 0) + 1, correspondentId: folder.correspondentId, folderVersion: version + 1, sentAt: new Date() } });
      await tx.documentationRoundDocument.createMany({ data: documents.map(document => ({ tenantId: session.tenant.id, folderId, roundId: round.id, documentId: document.id })) });
      await tx.documentationFolder.update({ where: { id: folderId }, data: { status: latest ? "EM_REANALISE" : "AGUARDANDO_CORRESPONDENTE" } });
      await event(tx, session, folderId, round.id, latest ? "DOCUMENT_REVIEW_RESUBMITTED" : "DOCUMENT_REVIEW_SUBMITTED", { sequence: round.sequence });
      return { version: version + 1, roundId: round.id };
    }
    if (!latest || text(body.roundId, "Rodada", true) !== latest.id) throw new DocumentationError(409, "Esta não é a rodada atual.");
    const round = latest;
    if (action === "resolve") {
      if (!responsible(session)) throw new DocumentationError(403, "Somente o responsável pode resolver pendências.");
      if (folder.status !== "PENDENCIA_DOCUMENTAL" || !round.closedAt) throw new DocumentationError(409, "Resolução indisponível neste estado.");
      const issueId = text(body.issueId, "Pendência", true)!;
      const updated = await tx.documentationPendingItem.updateMany({ where: { id: issueId, tenantId: session.tenant.id, folderId, roundId: round.id, status: "OPEN" }, data: { status: "RESOLVED", resolvedAt: new Date(), resolvedById: session.user.id } });
      if (updated.count !== 1) throw new DocumentationError(409, "Pendência ausente ou já resolvida.");
      await event(tx, session, folderId, round.id, "DOCUMENT_ISSUE_RESOLVED", { issueId });
      return { version: version + 1 };
    }
    if (session.user.role !== "CORRESPONDENTE" || round.correspondentId !== session.user.id || folder.correspondentId !== session.user.id) throw new DocumentationError(403, "Análise restrita ao correspondente da rodada e da pasta.");
    if (round.closedAt) throw new DocumentationError(409, "Esta rodada já foi concluída.");
    if (action === "start") {
      if (!waitingStates.includes(folder.status)) throw new DocumentationError(409, "Esta pasta não está aguardando análise.");
      await tx.documentationFolder.update({ where: { id: folderId }, data: { status: "EM_ANALISE" } });
      await event(tx, session, folderId, round.id, "DOCUMENT_REVIEW_STARTED");
      return { version: version + 1 };
    }
    if (folder.status !== "EM_ANALISE") throw new DocumentationError(409, "Inicie a análise antes de continuar.");
    if (action === "note") {
      const message = text(body.observation, "Parecer", true, 10000)!;
      const comment = await tx.documentationComment.create({ data: { tenantId: session.tenant.id, folderId, authorId: session.user.id, visibility: "SHARED", message } });
      await event(tx, session, folderId, round.id, "DOCUMENT_REVIEW_NOTE_SAVED", { commentId: comment.id });
    } else if (action === "issue" || action === "editIssue") {
      const personId = text(body.personId, "Pessoa"); const documentTypeId = text(body.documentTypeId, "Tipo"); const documentId = text(body.documentId, "Documento");
      if (personId && !await tx.documentationPerson.findFirst({ where: { id: personId, tenantId: session.tenant.id, folderId } })) throw new DocumentationError(400, "Pessoa fora desta pasta.");
      if (documentTypeId && !await tx.documentationDocumentType.findFirst({ where: { id: documentTypeId, tenantId: session.tenant.id, isActive: true } })) throw new DocumentationError(400, "Tipo documental inválido.");
      if (documentId) {
        const linked = await tx.documentationRoundDocument.findFirst({ where: { tenantId: session.tenant.id, folderId, roundId: round.id, documentId }, include: { document: true } });
        if (!linked || linked.document.status !== "ACTIVE" || (personId && linked.document.personId !== personId) || (documentTypeId && linked.document.documentTypeId !== documentTypeId)) throw new DocumentationError(400, "Documento não pertence ao snapshot/pessoa/tipo desta rodada.");
      }
      const data = { message: text(body.message, "Descrição da pendência", true, 3000)!, personId, documentTypeId, documentId };
      if (action === "issue") {
        const issue = await tx.documentationPendingItem.create({ data: { ...data, tenantId: session.tenant.id, folderId, roundId: round.id, createdById: session.user.id } });
        await event(tx, session, folderId, round.id, "DOCUMENT_ISSUE_CREATED", { issueId: issue.id });
      } else {
        const issueId = text(body.issueId, "Pendência", true)!;
        const changed = await tx.documentationPendingItem.updateMany({ where: { id: issueId, tenantId: session.tenant.id, folderId, roundId: round.id, status: "OPEN", createdById: session.user.id }, data });
        if (changed.count !== 1) throw new DocumentationError(409, "Pendência indisponível para edição.");
        await event(tx, session, folderId, round.id, "DOCUMENT_ISSUE_UPDATED", { issueId });
      }
    } else if (action === "cancelIssue") {
      const issueId = text(body.issueId, "Pendência", true)!;
      const changed = await tx.documentationPendingItem.updateMany({ where: { id: issueId, tenantId: session.tenant.id, folderId, roundId: round.id, status: "OPEN", createdById: session.user.id }, data: { status: "CANCELLED" } });
      if (changed.count !== 1) throw new DocumentationError(409, "Pendência indisponível para cancelamento.");
      await event(tx, session, folderId, round.id, "DOCUMENT_ISSUE_CANCELLED", { issueId });
    } else if (action === "finish") {
      const result = text(body.result, "Resultado", true) as DocumentationAnalysisResult;
      if (!results.includes(result)) throw new DocumentationError(400, "Resultado inválido.");
      const observation = text(body.observation, "Parecer/condições", result === "CONDICIONADO" || result === "REPROVADO", 10000);
      const opened = await tx.documentationPendingItem.count({ where: { tenantId: session.tenant.id, folderId, roundId: round.id, status: "OPEN" } });
      if ((result === "PENDENCIA_DOCUMENTAL" && !opened) || (result !== "PENDENCIA_DOCUMENTAL" && opened)) throw new DocumentationError(409, result === "PENDENCIA_DOCUMENTAL" ? "Crie pelo menos uma pendência aberta." : "Cancele pendências abertas ou solicite correções antes de concluir.");
      const analysis = await tx.documentationAnalysis.create({ data: { tenantId: session.tenant.id, folderId, roundId: round.id, authorId: session.user.id, result, observation } });
      const snapshot = await tx.documentationRoundDocument.findMany({ where: { tenantId: session.tenant.id, folderId, roundId: round.id }, select: { documentId: true } });
      await tx.documentationAnalysisDocument.createMany({ data: snapshot.map(row => ({ tenantId: session.tenant.id, folderId, analysisId: analysis.id, documentId: row.documentId })) });
      await tx.documentationPendingItem.updateMany({ where: { tenantId: session.tenant.id, folderId, roundId: round.id }, data: { analysisId: analysis.id } });
      const closed = await tx.documentationAnalysisRound.updateMany({ where: { id: round.id, tenantId: session.tenant.id, folderId, closedAt: null }, data: { closedAt: new Date() } });
      if (closed.count !== 1) throw new DocumentationError(409, "Rodada já concluída.");
      await tx.documentationFolder.update({ where: { id: folderId }, data: { status: result } });
      const events = { PENDENCIA_DOCUMENTAL: "DOCUMENT_REVIEW_CHANGES_REQUESTED", APROVADO: "DOCUMENT_REVIEW_APPROVED", CONDICIONADO: "DOCUMENT_REVIEW_CONDITIONED", REPROVADO: "DOCUMENT_REVIEW_REJECTED" };
      await event(tx, session, folderId, round.id, events[result], { analysisId: analysis.id });
    } else throw new DocumentationError(400, "Ação inválida.");
    return { version: version + 1 };
  }, { timeout: 15000, maxWait: 5000 });
}

export async function workflowView(session: DocumentationViewer, folderId: string, params: URLSearchParams, db = prisma) {
  const scope = documentScope(session);
  const folder = await db.documentationFolder.findFirst({ where: { id: folderId, ...scope }, select: { id: true, status: true, version: true, correspondentId: true, responsiblePerson: { select: { name: true } }, broker: { select: { name: true } }, people: { select: { id: true, name: true, relationship: true } } } });
  if (!folder) throw new DocumentationError(404, "Pasta não encontrada.");
  const page = Number(params.get("page") ?? 1); const issuePage = Number(params.get("issuePage") ?? 1);
  if (![page, issuePage].every(value => Number.isSafeInteger(value) && value > 0 && value <= 100000)) throw new DocumentationError(400, "Página inválida.");
  const where = { tenantId: session.tenant.id, folderId };
  const latest = await db.documentationAnalysisRound.findFirst({ where, orderBy: { sequence: "desc" }, select: { id: true, sequence: true, closedAt: true, correspondentId: true } });
  const selectedId = text(params.get("roundId"), "Rodada") ?? latest?.id;
  if (selectedId && !await db.documentationAnalysisRound.count({ where: { ...where, id: selectedId } })) throw new DocumentationError(404, "Rodada não encontrada.");
  const [rounds, total, issues, issueTotal, documents, types, openIssues] = await Promise.all([
    db.documentationAnalysisRound.findMany({ where, orderBy: { sequence: "desc" }, skip: (page - 1) * 10, take: 10, select: { id: true, sequence: true, sentAt: true, closedAt: true, correspondent: { select: { name: true } }, analysis: { select: { result: true, observation: true, createdAt: true, author: { select: { name: true } } } }, _count: { select: { documents: true, pendingItems: true } }, events: { where: { eventType: { in: ["DOCUMENT_REVIEW_SUBMITTED", "DOCUMENT_REVIEW_RESUBMITTED", "DOCUMENT_REVIEW_STARTED"] } }, select: { eventType: true, createdAt: true, actor: { select: { name: true } } } } } }),
    db.documentationAnalysisRound.count({ where }),
    selectedId ? db.documentationPendingItem.findMany({ where: { ...where, roundId: selectedId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: (issuePage - 1) * 20, take: 20, select: { id: true, message: true, status: true, personId: true, documentTypeId: true, documentId: true, createdAt: true, resolvedAt: true, createdBy: { select: { name: true } }, resolvedBy: { select: { name: true } }, person: { select: { name: true } }, documentType: { select: { name: true } }, document: { select: { originalFileName: true } } } }) : [],
    selectedId ? db.documentationPendingItem.count({ where: { ...where, roundId: selectedId } }) : 0,
    db.documentationDocument.findMany({ where: { ...where, status: "ACTIVE", ...(selectedId ? { roundDocuments: { some: { ...where, roundId: selectedId } } } : {}) }, select: { id: true, originalFileName: true, personId: true, documentTypeId: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.documentationDocumentType.findMany({ where: { tenantId: session.tenant.id, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 }),
    db.documentationPendingItem.count({ where: { ...where, status: "OPEN" } }),
  ]);
  const noteEvent = latest ? await db.documentationEvent.findFirst({ where: { ...where, roundId: latest.id, eventType: "DOCUMENT_REVIEW_NOTE_SAVED" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { metadata: true } }) : null;
  const commentId = (noteEvent?.metadata as { commentId?: string } | null)?.commentId;
  const note = commentId ? await db.documentationComment.findFirst({ where: { ...where, id: commentId, visibility: "SHARED" }, select: { message: true } }) : null;
  const analyst = session.user.role === "CORRESPONDENTE" && latest?.correspondentId === session.user.id && folder.correspondentId === session.user.id;
  return { folder, latest, rounds, total, page, selectedId, issues, issueTotal, issuePage, documents, types, openIssues, note: note?.message ?? "", canSubmit: responsible(session) && submissionStates.includes(folder.status), canResolve: responsible(session) && folder.status === "PENDENCIA_DOCUMENTAL", canStart: analyst && waitingStates.includes(folder.status) && !latest?.closedAt, canAnalyze: analyst && folder.status === "EM_ANALISE" && !latest?.closedAt };
}
