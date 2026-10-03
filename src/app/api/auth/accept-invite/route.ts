import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, createSessionToken, sessionCookieName } from "@/lib/auth.server";
import { postAuthDestination } from "@/lib/auth-policy";
import { Prisma } from "@prisma/client";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token = String(body?.token ?? "").trim();
  const password = String(body?.password ?? "");

  if (!token || password.length < 8 || password.length > 256) {
    return NextResponse.json({ ok: false, error: "Token e senha de 8 a 256 caracteres são obrigatórios." }, { status: 400 });
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

  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
      const claimed = await tx.userInviteToken.updateMany({
        where: { id: inv.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) return null;
      return tx.user.create({
        data: {
          tenantId: inv.tenantId,
          email: inv.email,
          name: String(body?.name ?? "").trim() || inv.email.split("@")[0],
          role: inv.role,
          passwordHash,
          supervisorId: inv.invitedById ?? null,
        },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ ok: false, error: "Já existe usuário com esse email." }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: "Não foi possível ativar o acesso." }, { status: 500 });
  }
  if (!user) return NextResponse.json({ ok: false, error: "Convite utilizado ou expirado." }, { status: 409 });

  // auto-login
  const sessToken = createSessionToken({ uid: user.id, tid: user.tenantId, role: user.role, sv: user.sessionVersion });
  const res = NextResponse.json({ ok: true, redirectTo: postAuthDestination(user.role, undefined, "/admin/dashboard") });

  res.cookies.set(sessionCookieName, sessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return res;
}
