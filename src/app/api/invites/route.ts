import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requirePermission, assertCanInvite } from "@/lib/authz.server";
import { UserRole } from "@prisma/client";
import { sendInviteEmail } from "@/lib/email/brevo";

function roleLabel(role: UserRole) {
  return {
    OWNER: "Owner",
    DIRECTOR: "Diretor",
    MANAGER: "Gerente",
    BROKER: "Corretor",
    DATA_ENTRY: "Operador de Cadastro",
  }[role];
}

function b64url(buf: Buffer) {
  return buf.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function POST(req: NextRequest) {
  const s = await requirePermission("users:invite");

  const body = await req.json().catch(() => ({}));
  const email = String(body?.email ?? "").trim().toLowerCase();
  const role = String(body?.role ?? "") as UserRole;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
  }

  if (!["DIRECTOR", "MANAGER", "BROKER", "DATA_ENTRY"].includes(role)) {
    return NextResponse.json({ error: "Role inválido." }, { status: 400 });
  }

  // regra cascata (OWNER/DIRECTOR/MANAGER)
  assertCanInvite(s.user.role as UserRole, role);

  // não convida email já cadastrado
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return NextResponse.json({ error: "Já existe usuário com esse e-mail." }, { status: 409 });

  const token = b64url(crypto.randomBytes(32));
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h

  await prisma.invite.create({
    data: {
      email,
      token,
      role,
      tenantId: s.tenant.id,       // IMPORTANTÍSSIMO: amarra no tenant atual
      invitedById: s.user.id,
      expiresAt,
    },
  });

  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const inviteUrl = `${appUrl}/invite/${token}`;

  await sendInviteEmail({
    toEmail: email,
    tenantName: s.tenant.name,
    inviterName: s.user.name,
    inviteUrl,
    roleLabel: roleLabel(role),
  });

  return NextResponse.json({ ok: true });
}
