import { prisma } from "@/lib/prisma";
import { documentationFolderScope } from "@/lib/documentacoes/access-policy";
import type { OfficeViewer, officePeriod } from "./policy";
import type { OfficeDb } from "./db.server";
export async function officeDashboard(viewer: OfficeViewer, range: ReturnType<typeof officePeriod>, db: OfficeDb = prisma) {
  const where = { tenantId: viewer.tenant.id, ownerId: viewer.user.id, createdAt: { gte: range.start, lte: range.end } };
  const scope = documentationFolderScope(viewer as Parameters<typeof documentationFolderScope>[0]);
  const [leads, folders, documents] = await Promise.all([
    db.cRMLead.groupBy({ by: ["status"], where, _count: true }),
    db.documentationFolder.groupBy({ by: ["status"], where: { ...scope, createdAt: { gte: range.start, lte: range.end } }, _count: true }),
    db.documentationDocument.count({ where: { tenantId: viewer.tenant.id, folder: scope, status: "ACTIVE", createdAt: { gte: range.start, lte: range.end } } }),
  ]);
  return { crm: leads.map(l => ({ status: l.status, count: l._count })), folders: folders.map(f => ({ status: f.status, count: f._count })), documents };
}
