// src/app/api/invites/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/authz.server";
import { assertCanInvite } from "@/lib/authz.server";
import { randomBytes } from "crypto";
import { UserRole } from "@prisma/client";

export async function POST(req: NextRequest) {
  const s = await requirePermission("users:invite");

  const body = await req.json();
  const email = String(body?.email || "").trim().toLowerCase();
  const role = body?.role as UserRole;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
  }

  if (!role) {
    return NextResponse.json({ error: "Role inválido." }, { status: 400 });
  }

  // Garante a regra de cascata (OWNER/DIRECTOR/MANAGER etc)
  assertCanInvite(s.user.role, role);

  const token = randomBytes(32).toString("hex");

  await prisma.invite.create({
    data: {
      email,
      token,
      role,
      tenantId: s.tenant.id,
      invitedById: s.user.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 48), // 48h
    },
  });

  // (seu envio de e-mail com Brevo entra aqui depois — ou já está em outro lugar)

  return NextResponse.json({ ok: true });
}
