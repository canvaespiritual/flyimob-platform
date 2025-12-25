import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/authz.server";
import { usersScopeWhere } from "@/lib/user-scope";

export async function GET() {
  const s = await requirePermission("users:read");

  const where = await usersScopeWhere(prisma, {
    id: s.user.id,
    role: s.user.role,
    tenantId: s.tenant.id,
  });

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      brokerLevel: true,
      supervisorId: true,
      isActive: true,
      createdAt: true,
      whatsapp: true,
      telefone: true,
      creci: true,
      observacao: true,
    },
  });

  return NextResponse.json({ ok: true, users });
}
