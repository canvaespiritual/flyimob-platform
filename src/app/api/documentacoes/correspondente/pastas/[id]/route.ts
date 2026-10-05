import { prisma } from "@/lib/prisma";
import { documentSession, documentScope } from "@/lib/documentacoes/document-access.server";
import { DocumentationError } from "@/lib/documentacoes/validation";
import { failure, json } from "@/lib/documentacoes/http.server";
import { pagination } from "@/lib/documentacoes/queries.server";
import { maskDocumentationCpf } from "@/lib/documentacoes/correspondent-presentation";
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await documentSession(); if (session.user.role !== "CORRESPONDENTE") throw new DocumentationError(403, "Acesso reservado ao correspondente.");
    const { id } = await context.params;
    const folder = await prisma.documentationFolder.findFirst({ where: { id, ...documentScope(session) }, select: { id: true, status: true, createdAt: true, updatedAt: true, responsiblePerson: { select: { name: true } }, broker: { select: { name: true } }, rounds: { orderBy: { sequence: "desc" }, take: 1, select: { id: true } }, people: { select: { id: true, name: true, cpf: true, relationship: true }, orderBy: { createdAt: "asc" } } } });
    if (!folder) throw new DocumentationError(404, "Pasta não encontrada ou não atribuída a você.");
    const paging = pagination(new URL(req.url).searchParams);
    const where = { tenantId: session.tenant.id, folderId: id };
    const [events, eventCount] = await Promise.all([
      prisma.documentationEvent.findMany({ where, select: { id: true, eventType: true, createdAt: true, actor: { select: { name: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: paging.take, skip: paging.skip }),
      prisma.documentationEvent.count({ where }),
    ]);
    return json({ folder: { ...folder, broker: folder.responsiblePerson ?? folder.broker, people: folder.people.map(({ cpf, ...person }) => ({ ...person, cpfDisplay: maskDocumentationCpf(cpf) })) }, events, eventCount, page: paging.page });
  } catch (error) { return failure(error); }
}
