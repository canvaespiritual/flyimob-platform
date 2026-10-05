import { getSessionUser } from "@/lib/session.server";
import { canManageDocumentation, commercialOwnershipScope, type DocumentationViewer } from "./access-policy";
import { DocumentationError } from "./validation";
export function documentScope(session: DocumentationViewer) {
  const tenantId = session.tenant.id;
  if (canManageDocumentation(session)) return { tenantId };
  if (!session.tenant.isPlatform && session.user.tenantId === tenantId && session.user.role === "BROKER") return { tenantId, ...commercialOwnershipScope(session.user.id) };
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
  const reject = () => { throw new DocumentationError(403, "Origem não permitida."); };
  if (req.headers.get("sec-fetch-site") === "cross-site") reject();
  if (!origin) return;

  // Next's request URL may contain the internal host behind Railway's proxy.
  // Use the configured public URL, never client-controlled forwarding headers.
  const configuredUrl = process.env.APP_URL?.trim();
  let publicOrigin: string;
  try { publicOrigin = new URL(configuredUrl || req.url).origin; } catch { return reject(); }
  const allowed = new Set([publicOrigin]);
  // Both exact HTTPS hosts serve this application; no wildcard subdomains.
  if (publicOrigin === "https://flyimob.com" || publicOrigin === "https://www.flyimob.com") {
    allowed.add("https://flyimob.com");
    allowed.add("https://www.flyimob.com");
  }
  if (!allowed.has(origin)) reject();
}
