import { prisma } from "@/lib/prisma";
import { documentationApiSession, failure, json } from "@/lib/documentacoes/http.server";
import { input, text, integer, boolean, DocumentationError } from "@/lib/documentacoes/validation";
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await documentationApiSession(true); const { id } = await context.params; const body = input(await req.json());
    const stamp = text(body.updatedAt, "Versão do tipo", true, 40)!;
    if (Number.isNaN(Date.parse(stamp))) throw new DocumentationError(400, "Versão inválida.");
    const result = await prisma.documentationDocumentType.updateMany({ where: { tenantId: session.tenant.id, id, updatedAt: new Date(stamp) }, data: { name: text(body.name, "Nome", true)!, description: text(body.description, "Descrição", false, 1000), sortOrder: integer(body.sortOrder, "Ordem"), isActive: boolean(body.isActive, "Ativo"), defaultRequired: boolean(body.defaultRequired, "Obrigatório") } });
    if (result.count !== 1) throw new DocumentationError(409, "Tipo ausente ou atualizado. Recarregue antes de salvar.");
    return json({ ok: true });
  } catch (error) { return failure(error); }
}
