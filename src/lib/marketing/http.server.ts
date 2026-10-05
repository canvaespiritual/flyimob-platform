import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { getSessionUser } from "@/lib/session.server";
import { authorize, MarketingError } from "./policy";
import { MetaError } from "./meta.server";

export async function marketingSession(ownerOnly = false) {
  const session = await getSessionUser();
  if (!session) throw new MarketingError(401, "Autenticação necessária.");
  authorize(session, ownerOnly);
  return session;
}
export async function marketingPageSession() {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  try { authorize(session); } catch { redirect("/admin/forbidden"); }
  return session;
}
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}
export function failure(error: unknown) {
  if (error instanceof MetaError) return json({ error: error.safeCode === "AUTHORIZATION_REQUIRED" ? "Conexão precisa ser renovada ou a conta perdeu acesso. Reconecte a Meta." : error.safeCode === "RATE_LIMITED" ? "Limite da Meta atingido. Aguarde antes de tentar novamente." : "A Meta não concluiu a leitura. Os dados anteriores foram preservados.", code: error.safeCode }, 502);
  if (error instanceof MarketingError) return json({ error: error.message }, error.status);
  if (error instanceof SyntaxError) return json({ error: "JSON inválido." }, 400);
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (["P2021", "P2022"].includes(error.code)) return json({ error: "Marketing ainda não está disponível no banco. A migration precisa ser aplicada." }, 503);
    if (["P2002", "P2003", "P2025", "P2034", "P2004"].includes(error.code)) return json({ error: "Conflito de vigência ou atualização. Recarregue e tente novamente." }, 409);
  }
  // No raw exception, request payload, credential, provider response or Prisma parameters.
  return json({ error: "Não foi possível concluir a operação de Marketing." }, 500);
}
