import { DocumentationFolderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DocumentationError, date, text } from "./validation";
import { folderListSelect } from "./folders.server";

export function pagination(params: URLSearchParams) {
  const page = Number(params.get("page") ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new DocumentationError(400, "Página inválida.");
  return { page, skip: (page - 1) * 20, take: 20 };
}
export function folderFilters(tenantId: string, params: URLSearchParams): Prisma.DocumentationFolderWhereInput {
  const where: Prisma.DocumentationFolderWhereInput = { tenantId };
  const q = text(params.get("q"), "Busca", false, 160);
  if (q) where.people = { some: { tenantId, OR: [{ name: { contains: q, mode: "insensitive" } }, { cpf: { contains: q.replace(/\D/g, "") || q } }] } };
  const status = params.get("status");
  if (status) {
    if (!Object.values(DocumentationFolderStatus).includes(status as DocumentationFolderStatus)) throw new DocumentationError(400, "Status inválido.");
    where.status = status as DocumentationFolderStatus;
  }
  for (const key of ["brokerId", "correspondentId"] as const) {
    const value = text(params.get(key), "Responsável");
    if (value) where[key] = value;
  }
  const from = date(params.get("from")); const to = date(params.get("to"));
  if (from && to && from > to) throw new DocumentationError(400, "Período inválido.");
  // Calendar days in America/Sao_Paulo (UTC-03), inclusive end day.
  if (from || to) where.createdAt = { ...(from ? { gte: new Date(from.getTime() + 10800000) } : {}), ...(to ? { lt: new Date(to.getTime() + 97200000) } : {}) };
  return where;
}
export async function listFolders(tenantId: string, params: URLSearchParams) {
  const paging = pagination(params); const where = folderFilters(tenantId, params);
  const [items, total, groups] = await Promise.all([
    prisma.documentationFolder.findMany({ where, select: folderListSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: paging.skip, take: paging.take }),
    prisma.documentationFolder.count({ where }),
    prisma.documentationFolder.groupBy({ by: ["status"], orderBy: { status: "asc" }, where, _count: { _all: true } }),
  ]);
  return { items, total, page: paging.page, pageSize: paging.take, groups };
}
export async function folderDetail(tenantId: string, id: string, params: URLSearchParams) {
  const paging = pagination(params);
  const folder = await prisma.documentationFolder.findFirst({ where: { tenantId, id }, include: {
    people: { orderBy: { createdAt: "asc" } }, broker: { select: { id: true, name: true } }, correspondent: { select: { id: true, name: true, email: true, isActive: true, updatedAt: true } },
    construtora: { select: { id: true, name: true } }, empreendimento: { select: { id: true, name: true } },
  } });
  if (!folder) throw new DocumentationError(404, "Pasta não encontrada.");
  const [events, eventCount, types] = await prisma.$transaction([
    prisma.documentationEvent.findMany({ where: { tenantId, folderId: id }, select: { id: true, eventType: true, createdAt: true, actor: { select: { name: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: paging.skip, take: paging.take }),
    prisma.documentationEvent.count({ where: { tenantId, folderId: id } }),
    prisma.documentationDocumentType.findMany({ where: { tenantId, isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  const documentCount = await prisma.documentationDocument.count({ where: { tenantId, folderId: id, status: "ACTIVE" } });
  return { folder, events, eventCount, types, documentCount, page: paging.page };
}
