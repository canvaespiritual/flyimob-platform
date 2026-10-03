import { prisma } from "@/lib/prisma";
import { documentationApiSession, failure, json } from "@/lib/documentacoes/http.server";
import { input, text, boolean, DocumentationError } from "@/lib/documentacoes/validation";
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await documentationApiSession(true); const { id } = await context.params; const body = input(await req.json());
    const isActive = boolean(body.isActive, "Ativo"); const stamp = text(body.updatedAt, "Versão", true, 40)!;
    if (Number.isNaN(Date.parse(stamp))) throw new DocumentationError(400, "Versão inválida.");
    const result = await prisma.user.updateMany({ where: { id, tenantId: session.tenant.id, role: "CORRESPONDENTE", updatedAt: new Date(stamp) }, data: { isActive, ...(!isActive ? { sessionVersion: { increment: 1 } } : {}) } });
    if (result.count !== 1) throw new DocumentationError(409, "Correspondente ausente ou atualizado. Recarregue antes de salvar.");
    return json({ ok: true });
  } catch (error) { return failure(error); }
}
