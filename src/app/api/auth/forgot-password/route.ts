// src/app/api/auth/forgot-password/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendBrevoTemplateEmail } from "@/lib/brevo.server";

export const dynamic = "force-dynamic";

function getAppUrl() {
  const url = process.env.APP_URL?.trim();
  if (!url) throw new Error("Missing env: APP_URL");
  return url.replace(/\/+$/, "");
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body?.email ?? "").trim().toLowerCase();

  // Sempre responde OK (evita enumeração de e-mails)
  if (!email) return NextResponse.json({ ok: true });

  const user = await prisma.user.findFirst({
    where: { email },
    select: { id: true, name: true, email: true, isActive: true },
  });

  // Se não existe ou está inativo: não envia, mas responde OK
  if (!user || !user.isActive) return NextResponse.json({ ok: true });

  // Invalida tokens anteriores não usados (opcional, mas ajuda)
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1h

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      token,
      expiresAt,
    },
  });

  const resetLink = `${getAppUrl()}/reset-password/${token}`;
  const templateId = Number(process.env.BREVO_TEMPLATE_RESET_ID);

  await sendBrevoTemplateEmail({
    toEmail: user.email,
    toName: user.name ?? undefined,
    templateId,
    params: {
      name: user.name ?? "usuário",
      reset_link: resetLink,
    },
  });

  return NextResponse.json({ ok: true });
}
