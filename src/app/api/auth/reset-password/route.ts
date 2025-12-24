// src/app/api/auth/reset-password/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth.server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token = String(body?.token ?? "").trim();
  const password = String(body?.password ?? "");

  if (!token || password.length < 8) {
    return NextResponse.json(
      { ok: false, error: "Token inválido ou senha muito curta (mín. 8)." },
      { status: 400 }
    );
  }

  const prt = await prisma.passwordResetToken.findFirst({
    where: {
      token,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { user: true },
  });

  if (!prt || !prt.user?.isActive) {
    return NextResponse.json(
      { ok: false, error: "Token inválido/expirado." },
      { status: 400 }
    );
  }

  const newHash = await hashPassword(password);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: prt.userId },
      data: { passwordHash: newHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: prt.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
