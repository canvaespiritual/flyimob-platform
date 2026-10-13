import { prisma } from "@/lib/prisma";
import { canManageDocumentation, type DocumentationViewer } from "./access-policy";
import { documentScope } from "./document-access.server";
import { documentationEventLabels } from "./correspondent-presentation";
import { DocumentationError, text } from "./validation";

export const correspondentNotificationEvents = [
  "DOCUMENT_REVIEW_VIEWED", "DOCUMENT_REVIEW_STARTED",
  "DOCUMENT_REVIEW_CHANGES_REQUESTED", "DOCUMENT_REVIEW_APPROVED", "DOCUMENT_REVIEW_CONDITIONED",
  "DOCUMENT_REVIEW_REJECTED", "DOCUMENT_REVIEW_NOTE_SAVED", "DOCUMENT_ISSUE_CREATED",
  "DOCUMENT_ISSUE_UPDATED", "DOCUMENT_ISSUE_CANCELLED", "DOCUMENT_ADDED",
];
export function notificationScope(session: DocumentationViewer) {
  if (!canManageDocumentation(session) && session.user.role !== "BROKER") throw new DocumentationError(403, "Notificações indisponíveis para este perfil.");
  return { tenantId: session.tenant.id, actorRole: "CORRESPONDENTE" as const,
    eventType: { in: correspondentNotificationEvents }, folder: documentScope(session) };
}

export async function documentationNotifications(session: DocumentationViewer, params: URLSearchParams, db = prisma) {
  const scope = notificationScope(session);
  const page = Number(params.get("page") ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new DocumentationError(400, "Página inválida.");
  const unread = { ...scope, notificationReads: { none: { tenantId: session.tenant.id, userId: session.user.id } } };
  // Unread first, with independent pagination, so old unread replies cannot be hidden by recent read events.
  const where = params.get("filter") === "all" ? scope : unread;
  const [unreadCount, total, events] = await Promise.all([
    db.documentationEvent.count({ where: unread }), db.documentationEvent.count({ where }),
    db.documentationEvent.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20,
      select: { id: true, folderId: true, eventType: true, createdAt: true,
        actor: { select: { name: true } }, folder: { select: { people: { where: { relationship: "TITULAR" }, take: 1, select: { name: true } } } },
        notificationReads: { where: { tenantId: session.tenant.id, userId: session.user.id }, select: { readAt: true } } } }),
  ]);
  return { unreadCount, total, page, items: events.map(event => ({ id: event.id, folderId: event.folderId,
    title: documentationEventLabels[event.eventType] ?? "Resposta do correspondente", eventType: event.eventType,
    correspondent: event.actor?.name ?? "Correspondente", client: event.folder.people[0]?.name ?? "Pasta documental",
    createdAt: event.createdAt, readAt: event.notificationReads[0]?.readAt ?? null,
    href: `${session.user.role === "BROKER" ? "/documentacoes" : "/admin/documentacoes"}/pastas/${event.folderId}${session.user.role === "BROKER" ? "" : "?tab=analise"}` })) };
}

export async function readDocumentationNotification(session: DocumentationViewer, value: unknown, db = prisma) {
  const scope = notificationScope(session); const eventId = text(value, "Notificação", true)!;
  return db.$transaction(async tx => {
    const event = await tx.documentationEvent.findFirst({ where: { ...scope, id: eventId }, select: { id: true, folderId: true } });
    if (!event) throw new DocumentationError(404, "Notificação não encontrada.");
    return tx.documentationNotificationRead.upsert({ where: { tenantId_userId_eventId: { tenantId: session.tenant.id, userId: session.user.id, eventId } },
      create: { tenantId: session.tenant.id, folderId: event.folderId, userId: session.user.id, eventId }, update: {}, select: { readAt: true } });
  });
}
