import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformOwner } from "@/lib/authz.server";

export async function GET() {
  const s = await requirePlatformOwner();

  const tenants = await prisma.tenant.findMany({
    where: {
      parentId: s.tenant.id,
      isPlatform: false,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      createdAt: true,
      _count: {
        select: {
          users: true,
          construtoras: true,
          empreendimentos: true,
          crmleads: true,
        },
      },
    },
  });

  return NextResponse.json({ ok: true, tenants });
}