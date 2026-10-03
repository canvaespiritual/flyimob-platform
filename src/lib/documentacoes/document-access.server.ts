import { getSessionUser } from "@/lib/session.server";
import { canManageDocumentation, type DocumentationViewer } from "./access-policy";
import { DocumentationError } from "./validation";
export function documentScope(session: DocumentationViewer) {
  const tenantId = session.tenant.id;
  if (canManageDocumentation(session)) return { tenantId };
  if (!session.tenant.isPlatform && session.user.tenantId === tenantId && session.user.role === "BROKER") return { tenantId, brokerId: session.user.id };
  if (!session.tenant.isPlatform && session.user.tenantId === tenantId && session.user.role === "CORRESPONDENTE") return { tenantId, correspondentId: session.user.id };
  throw new DocumentationError(403, "Você não possui acesso documental.");
}
export async function documentSession() {
  const session = await getSessionUser();
  if (!session) throw new DocumentationError(401, "Autenticação necessária.");
  documentScope(session); return session;
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (req.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== new URL(req.url).origin)) throw new DocumentationError(403, "Origem não permitida.");
}
