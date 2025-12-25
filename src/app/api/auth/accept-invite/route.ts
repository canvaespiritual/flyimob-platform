import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, createSessionToken, sessionCookieName } from "@/lib/auth.server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token = String(body?.token ?? "").trim();
  const password = String(body?.password ?? "");

  if (!token || !password) {
    return NextResponse.json({ ok: false, error: "Token e senha são obrigatórios." }, { status: 400 });
  }

  const inv = await prisma.userInviteToken.findUnique({ where: { token } });
  if (!inv) return NextResponse.json({ ok: false, error: "Convite inválido." }, { status: 404 });
  if (inv.usedAt) return NextResponse.json({ ok: false, error: "Convite já utilizado." }, { status: 409 });
  if (inv.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ ok: false, error: "Convite expirado." }, { status: 410 });
  }

  // já existe user com esse email?
  const exists = await prisma.user.findUnique({ where: { email: inv.email } });
  if (exists) {
    return NextResponse.json({ ok: false, error: "Já existe usuário com esse email." }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      tenantId: inv.tenantId,
      email: inv.email,
      name: String(body?.name ?? "").trim() || inv.email.split("@")[0],
      role: inv.role,
      passwordHash,
      supervisorId: inv.invitedById,
    },
  });

  await prisma.userInviteToken.update({
    where: { token },
    data: { usedAt: new Date() },
  });

  // auto-login
  const sessToken = createSessionToken({ uid: user.id, tid: user.tenantId, role: user.role });
  const res = NextResponse.json({ ok: true });

  res.cookies.set(sessionCookieName, sessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return res;
}
