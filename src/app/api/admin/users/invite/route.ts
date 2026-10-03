import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { assertCanInvite } from "@/lib/authz.server";
import { getPermissionApiSession } from "@/lib/api-access.server";
import { UserRole } from "@prisma/client";
import { sendInviteEmail } from "@/lib/email/brevo";

function b64url(buf: Buffer) {
  return buf.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function roleLabel(role: UserRole) {
  return {
    OWNER: "Owner",
    DIRECTOR: "Diretor",
    MANAGER: "Gerente",
    BROKER: "Corretor",
    DATA_ENTRY: "Operador de Cadastro",
    CORRESPONDENTE: "Correspondente Bancário",
  }[role];
}

export async function POST(req: Request) {
  // precisa estar logado e ter users:invite
  const auth = await getPermissionApiSession("users:invite");
  if (!auth.ok) return auth.response;
  const s = auth.session;

  const body = await req.json().catch(() => ({}));
  const email = String(body?.email ?? "").trim().toLowerCase();
  const role = String(body?.role ?? "") as UserRole;

  if (!email) return NextResponse.json({ ok: false, error: "Email obrigatório." }, { status: 400 });
  if (!["DIRECTOR","MANAGER","BROKER","DATA_ENTRY","CORRESPONDENTE"].includes(role)) {
    return NextResponse.json({ ok: false, error: "Role inválido." }, { status: 400 });
  }
  if (role === "CORRESPONDENTE" && s.tenant.isPlatform) {
    return NextResponse.json({ ok: false, error: "Correspondentes pertencem a uma operação." }, { status: 403 });
  }

  // regra de quem pode convidar quem
  assertCanInvite(s.user.role as UserRole, role);

  // já existe usuário?
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    return NextResponse.json({ ok: false, error: "Já existe usuário com esse email." }, { status: 409 });
  }

  // token
  const token = b64url(crypto.randomBytes(32));
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.userInviteToken.create({
    data: {
      token,
      tenantId: s.user.tenantId,
      email,
      role,
      expiresAt,
      invitedById: s.user.id,
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
