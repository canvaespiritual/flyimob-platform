import { prisma } from "@/lib/prisma";
import { documentationApiSession, failure, json } from "@/lib/documentacoes/http.server";
import { input, text, integer, boolean, DocumentationError } from "@/lib/documentacoes/validation";
export async function GET() {
  try { const session = await documentationApiSession(); return json({ items: await prisma.documentationDocumentType.findMany({ where: { tenantId: session.tenant.id }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }) }); } catch (error) { return failure(error); }
}
export async function POST(req: Request) {
  try {
    const session = await documentationApiSession(true); const body = input(await req.json()); const code = text(body.code, "Código", true, 60)!;
    if (!/^[A-Z0-9_]+$/.test(code)) throw new DocumentationError(400, "Use letras maiúsculas, números e sublinhado no código.");
    return json(await prisma.documentationDocumentType.create({ data: { tenantId: session.tenant.id, code, name: text(body.name, "Nome", true)!, description: text(body.description, "Descrição", false, 1000), sortOrder: integer(body.sortOrder ?? 0, "Ordem"), defaultRequired: boolean(body.defaultRequired ?? false, "Obrigatório"), isActive: boolean(body.isActive ?? true, "Ativo") } }), 201);
  } catch (error) { return failure(error); }
}
