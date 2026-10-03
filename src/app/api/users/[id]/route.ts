import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { UserRole, BrokerLevel } from "@prisma/client";
import { getPermissionApiSession } from "@/lib/api-access.server";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await getPermissionApiSession("users:invite");
  if (!auth.ok) return auth.response;
  const s = auth.session;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const { isActive, role, supervisorId, brokerLevel } = body as {
    isActive?: boolean;
    role?: UserRole;
    supervisorId?: string | null;
    brokerLevel?: BrokerLevel;
  };

  const target = await prisma.user.findFirst({
    where: { id, tenantId: s.tenant.id },
  });

  if (!target) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  }
  if (role !== undefined && !Object.values(UserRole).includes(role)) {
    return NextResponse.json({ error: "Role inválido." }, { status: 400 });
  }
  if (role === "CORRESPONDENTE" && s.tenant.isPlatform) {
    return NextResponse.json({ error: "Correspondentes pertencem a uma operação." }, { status: 403 });
  }
  if (supervisorId && !await prisma.user.findFirst({ where: { id: supervisorId, tenantId: s.tenant.id }, select: { id: true } })) {
    return NextResponse.json({ error: "Supervisor inválido." }, { status: 400 });
  }

  // ❌ não pode mexer em DIRECTOR se não for OWNER
  if (target.role === "DIRECTOR" && s.user.role !== "OWNER") {
    return NextResponse.json(
      { error: "Você não pode alterar um diretor." },
      { status: 403 }
    );
  }

  // ❌ MANAGER não edita ninguém
  if (s.user.role === "MANAGER") {
    return NextResponse.json(
      { error: "Gerente não pode editar usuários." },
      { status: 403 }
    );
  }

  // ❌ não se auto-inativar
  if (target.id === s.user.id && isActive === false) {
    return NextResponse.json(
      { error: "Você não pode inativar a si mesmo." },
      { status: 400 }
    );
  }

  await prisma.user.update({
    where: { id: target.id },
    data: {
      ...(typeof isActive === "boolean" ? { isActive } : {}),
      ...(role ? { role } : {}),
      ...(supervisorId !== undefined ? { supervisorId } : {}),
      ...(brokerLevel ? { brokerLevel } : {}),
      ...((isActive === false || (role && role !== target.role)) ? { sessionVersion: { increment: 1 } } : {}),
    },
  });

  return NextResponse.json({ ok: true });
}
