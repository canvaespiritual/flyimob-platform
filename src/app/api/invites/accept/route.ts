import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, createSessionToken, sessionCookieName } from "@/lib/auth.server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token = String(body?.token ?? "").trim();
  const name = String(body?.name ?? "").trim();
  const password = String(body?.password ?? "");

  if (!token || name.length < 2 || password.length < 8) {
    return NextResponse.json(
      { error: "Token, nome (mín. 2) e senha (mín. 8) são obrigatórios." },
      { status: 400 }
    );
  }

  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite) return NextResponse.json({ error: "Convite inválido." }, { status: 404 });
  if (invite.acceptedAt) return NextResponse.json({ error: "Convite já utilizado." }, { status: 410 });
  if (invite.expiresAt.getTime() < Date.now()) return NextResponse.json({ error: "Convite expirado." }, { status: 410 });

  // Por enquanto: só aceitamos invite de USUÁRIO (tenantId obrigatório).
  // (Depois eu te passo o “invite de tenant” do owner global, com migração opcional.)
  if (!invite.tenantId) {
    return NextResponse.json(
      { error: "Este convite é de tenant (plataforma) e ainda não está habilitado neste endpoint." },
      { status: 400 }
    );
  }

  const exists = await prisma.user.findUnique({ where: { email: invite.email } });
  if (exists) {
    return NextResponse.json({ error: "Já existe usuário com esse e-mail." }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      tenantId: invite.tenantId,
      email: invite.email,
      name,
      role: invite.role,
      passwordHash,
    },
  });

  await prisma.invite.update({
    where: { token },
    data: { acceptedAt: new Date() },
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
