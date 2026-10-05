import { prisma } from "@/lib/prisma";
import type { DocumentationViewer } from "./access-policy";
import { documentScope } from "./document-access.server";
import { DocumentationError } from "./validation";
import { folderFilters, pagination } from "./queries.server";
import { correspondentQueues, maskDocumentationCpf } from "./correspondent-presentation";

export async function correspondentFolders(session: DocumentationViewer, params: URLSearchParams, db = prisma) {
  if (session.user.role !== "CORRESPONDENTE") throw new DocumentationError(403, "Acesso reservado ao correspondente.");
  const scope = documentScope(session);
  const clean = new URLSearchParams();
  for (const key of ["q", "from", "to"]) if (params.get(key)) clean.set(key, params.get(key)!);
  const queue = correspondentQueues.find(queue => queue.value === (params.get("queue") === "again" ? "issues" : params.get("queue")));
  if (params.get("queue") && !queue) throw new DocumentationError(400, "Fila inválida.");
  const base = { ...folderFilters(session.tenant.id, clean), ...scope };
  const where = { ...base, ...(queue ? { status: { in: queue.statuses } } : {}) };
  const paging = pagination(params);
  const [rows, total, groups] = await Promise.all([
    db.documentationFolder.findMany({ where, select: {
      id: true, status: true, createdAt: true, updatedAt: true, responsiblePerson: { select: { name: true } }, broker: { select: { name: true } },
      people: { where: { relationship: "TITULAR" }, select: { name: true, cpf: true }, take: 1 },
      rounds: { orderBy: { sequence: "desc" }, take: 1, select: { sentAt: true } },
      _count: { select: { documents: { where: { status: "ACTIVE" } }, pendingItems: { where: { status: "OPEN" } } } },
    }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: paging.skip, take: paging.take }),
    db.documentationFolder.count({ where }),
    db.documentationFolder.groupBy({ by: ["status"], orderBy: { status: "asc" }, where: base, _count: { _all: true } }),
  ]);
  return { items: rows.map(row => ({ ...row, broker: row.responsiblePerson ?? row.broker, people: row.people.map(person => ({ name: person.name, cpfDisplay: maskDocumentationCpf(person.cpf) })) })), total, groups, page: paging.page, pageSize: paging.take };
}
