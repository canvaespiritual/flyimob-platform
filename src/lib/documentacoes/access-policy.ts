import type { DocumentationFolderStatus, UserRole } from "@prisma/client";

export type DocumentationViewer = {
  user: { id: string; tenantId: string; role: UserRole };
  tenant: { id: string; isPlatform: boolean };
};

export function canManageDocumentation(session: DocumentationViewer) {
  return !session.tenant.isPlatform && session.user.tenantId === session.tenant.id &&
    (session.user.role === "OWNER" || session.user.role === "DIRECTOR");
}

const submittedStates: DocumentationFolderStatus[] = [
  "AGUARDANDO_CORRESPONDENTE", "PENDENCIA_DOCUMENTAL", "EM_REANALISE",
  "EM_ANALISE",
  "APROVADO", "CONDICIONADO", "REPROVADO",
];

/** Mandatory base scope for future queries, never just a folder ID. */
export function documentationFolderScope(session: DocumentationViewer) {
  const tenantId = session.tenant.id;
  if (session.tenant.isPlatform || session.user.tenantId !== tenantId) return { tenantId, id: { in: [] as string[] } };
  if (canManageDocumentation(session)) return { tenantId };
  if (session.user.role === "BROKER") return { tenantId, brokerId: session.user.id };
  if (session.user.role === "CORRESPONDENTE") {
    return { tenantId, correspondentId: session.user.id, status: { in: submittedStates },
      rounds: { some: { tenantId, correspondentId: session.user.id } } };
  }
  return { tenantId, id: { in: [] as string[] } };
}
