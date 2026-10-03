import { Prisma } from "@prisma/client";
import { getSessionUser } from "@/lib/session.server";
import { canManageDocumentation } from "./access-policy";
import { DocumentationError } from "./validation";

export async function documentationApiSession(ownerOnly = false) {
  const session = await getSessionUser();
  if (!session) throw new DocumentationError(401, "Autenticação necessária.");
  if (!canManageDocumentation(session) || (ownerOnly && session.user.role !== "OWNER")) throw new DocumentationError(403, "Acesso não permitido.");
  return session;
}
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}
export function failure(error: unknown) {
  if (error instanceof SyntaxError) return json({ error: "JSON inválido." }, 400);
  if (error instanceof DocumentationError) return json({ error: error.message }, error.status);
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return json({ error: "Registro duplicado. Uma pasta permite somente um titular e cada código documental deve ser único." }, 409);
    if (["P2003", "P2025", "P2034"].includes(error.code)) return json({ error: "Registro vinculado ou atualizado por outra operação. Recarregue a página." }, 409);
    if (["P2021", "P2022"].includes(error.code)) return json({ error: "O banco ainda não está sincronizado com Documentações. A liberação depende da migration." }, 503);
  }
  // Never include Prisma parameters, request bodies, CPF or internal exception text.
  return json({ error: "Não foi possível concluir a operação." }, 500);
}
