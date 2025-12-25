import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requirePlatformOwner } from "@/lib/authz.server";
import { TenantType, UserRole } from "@prisma/client";
import { sendInviteEmail } from "@/lib/email/brevo";

function b64url(buf: Buffer) {
  return buf.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function POST(req: Request) {
  const s = await requirePlatformOwner();

  const body = await req.json().catch(() => ({}));
  const tenantName = String(body?.tenantName ?? "").trim();
  const tenantSlug = String(body?.tenantSlug ?? "").trim().toLowerCase();
  const tenantType = String(body?.tenantType ?? "IMOBILIARIA") as TenantType;

  const ownerEmail = String(body?.ownerEmail ?? "").trim().toLowerCase();
  const ownerRole = (String(body?.ownerRole ?? "OWNER") as UserRole);

  if (!tenantName || !tenantSlug) {
    return NextResponse.json({ ok:false, error:"tenantName e tenantSlug são obrigatórios." }, { status: 400 });
  }
  if (!ownerEmail.includes("@")) {
    return NextResponse.json({ ok:false, error:"ownerEmail inválido." }, { status: 400 });
  }
  if (!["OWNER","DIRECTOR"].includes(ownerRole)) {
    return NextResponse.json({ ok:false, error:"ownerRole inválido (OWNER/DIRECTOR)." }, { status: 400 });
  }

  // 1) cria tenant filho do tenant plataforma
  const tenant = await prisma.tenant.create({
    data: {
      name: tenantName,
      slug: tenantSlug,
      type: tenantType,
      isPlatform: false,
      parentId: s.tenant.id,
    },
  });

  // 2) impede convidar email que já é user no sistema
  const existsUser = await prisma.user.findUnique({ where: { email: ownerEmail } });
  if (existsUser) {
    return NextResponse.json({ ok:false, error:"Já existe usuário com esse e-mail." }, { status: 409 });
  }

  // 3) cria token de invite do owner do tenant
  const token = b64url(crypto.randomBytes(32));
  const expiresAt = new Date(Date.now() + 7*24*60*60*1000);

  await prisma.userInviteToken.create({
    data: {
      token,
      tenantId: tenant.id,
      email: ownerEmail,
      role: ownerRole,
      expiresAt,
    },
  });

  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const inviteUrl = `${appUrl}/invite/${token}`;

  await sendInviteEmail({
    toEmail: ownerEmail,
    tenantName: tenant.name,
    inviterName: s.user.name,
    inviteUrl,
    roleLabel: ownerRole === "OWNER" ? "Owner" : "Diretor",
  });

  return NextResponse.json({ ok:true, tenantId: tenant.id });
}
