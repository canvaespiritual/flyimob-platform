import { prisma } from "@/lib/prisma";
import { documentSession, documentScope } from "@/lib/documentacoes/document-access.server";
import { DocumentationError } from "@/lib/documentacoes/validation";
import { failure, json } from "@/lib/documentacoes/http.server";
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await documentSession(); if (session.user.role !== "CORRESPONDENTE") throw new DocumentationError(403, "Acesso reservado ao correspondente.");
    const { id } = await context.params;
    const folder = await prisma.documentationFolder.findFirst({ where: { id, ...documentScope(session) }, select: { id: true, status: true, createdAt: true, updatedAt: true, broker: { select: { name: true } }, people: { select: { id: true, name: true, relationship: true }, orderBy: { createdAt: "asc" } } } });
    if (!folder) throw new DocumentationError(404, "Pasta não encontrada ou não atribuída a você.");
    return json({ folder });
  } catch (error) { return failure(error); }
}
