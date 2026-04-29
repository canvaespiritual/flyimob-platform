import { prisma } from "../../../../lib/prisma";
import { requireUser } from "@/lib/authz.server";

export async function GET() {
  const s = await requireUser();

  const list = await prisma.construtora.findMany({
    where: { tenantId: s.tenant.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true, observacao: true },
  });

  return Response.json(list);
}