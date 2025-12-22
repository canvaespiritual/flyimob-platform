import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { createSessionToken, sessionCookieName, verifyPassword } from "@/lib/auth.server";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: "email e password são obrigatórios." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user?.passwordHash) {
      return NextResponse.json({ ok: false, error: "Credenciais inválidas." }, { status: 401 });
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ ok: false, error: "Credenciais inválidas." }, { status: 401 });
    }

    const token = createSessionToken(
      { uid: user.id, tid: user.tenantId, role: user.role },
      30
    );

    const res = NextResponse.json({ ok: true });

    res.cookies.set(sessionCookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return res;
  } catch (e) {
    console.error("POST /api/auth/login error:", e);
    return NextResponse.json({ ok: false, error: "Erro ao fazer login." }, { status: 500 });
  }
}
