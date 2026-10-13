import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { DocumentationViewer } from "./access-policy";
import { documentScope } from "./document-access.server";
import { DocumentationError, text } from "./validation";

// This projection is shared by summary, lists and workflow. Opening the list never writes a view.
export const roundTrackingSelect = {
  id: true, sequence: true, correspondentId: true, sentAt: true, firstViewedAt: true, closedAt: true,
  events: { where: { eventType: "DOCUMENT_REVIEW_STARTED" }, orderBy: { createdAt: "asc" as const }, take: 1, select: { createdAt: true } },
} satisfies Prisma.DocumentationAnalysisRoundSelect;

export async function recordCorrespondentView(session: DocumentationViewer, folderId: string, value: unknown, db = prisma) {
  if (session.user.role !== "CORRESPONDENTE") throw new DocumentationError(403, "Visualização restrita ao correspondente.");
  documentScope(session);
  const roundId = text(value, "Rodada", true)!;
  return db.$transaction(async tx => {
    // Same folder lock order as workflow mutations: serialize reassignment/resubmission without changing Folder.version.
    const folders = await tx.$queryRaw<{ id: string; status: string }[]>(Prisma.sql`
      SELECT "id", "status" FROM "DocumentationFolder"
      WHERE "id" = ${folderId} AND "tenantId" = ${session.tenant.id} AND "correspondentId" = ${session.user.id}
      FOR UPDATE`);
    const folder = folders[0];
    if (!folder) throw new DocumentationError(404, "Pasta não encontrada ou não atribuída a você.");
    const round = await tx.documentationAnalysisRound.findFirst({ where: { tenantId: session.tenant.id, folderId }, orderBy: { sequence: "desc" }, select: { id: true, correspondentId: true, firstViewedAt: true, closedAt: true } });
    if (!round || round.id !== roundId || round.correspondentId !== session.user.id) throw new DocumentationError(409, "A rodada mudou. Atualize a pasta.");
    if (round.firstViewedAt) return { firstViewedAt: round.firstViewedAt, recorded: false };
    // Do not backfill first views of completed rounds or of corrections still being prepared by the operation.
    if (round.closedAt || !["AGUARDANDO_CORRESPONDENTE", "EM_REANALISE", "EM_ANALISE"].includes(folder.status)) return { firstViewedAt: null, recorded: false };
    const firstViewedAt = new Date();
    await tx.documentationAnalysisRound.update({ where: { id: round.id }, data: { firstViewedAt } });
    await tx.documentationEvent.create({ data: { tenantId: session.tenant.id, folderId, roundId: round.id, actorId: session.user.id,
      actorRole: session.user.role, eventType: "DOCUMENT_REVIEW_VIEWED", createdAt: firstViewedAt } });
    return { firstViewedAt, recorded: true };
  });
}
