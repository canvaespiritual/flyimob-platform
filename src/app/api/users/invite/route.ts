// src/app/api/users/invite/route.ts
import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import crypto from "crypto";
import { createSessionToken, hashPassword, sessionCookieName, verifySessionToken } from "@/lib/auth";

function randomToken() {
  return crypto.randomBytes(24).toString("hex"); // 48 chars
}

function getSessionFromReq(req: Request) {
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(/flyimob_session=([^;]+)/);
  if (!m) return null;
  return verifySessionToken(decodeURIComponent(m[1]));
}

async function sendBrevoInviteEmail(toEmail: string, inviteUrl: string) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || "FlyImob";

  if (!apiKey || !senderEmail) {
    throw new Error("BREVO_API_KEY/BREVO_SENDER_EMAIL não configurados");
  }

  const payload = {
    sender: { email: senderEmail, name: senderName },
    to: [{ email: toEmail }],
    subject: "Seu acesso ao FlyImob",
    htmlContent: `
      <div style="font-family:Arial,sans-serif;line-height:1.5">
        <h2>Bem-vindo ao FlyImob</h2>
        <p>Para ativar seu acesso, clique no link abaixo:</p>
        <p><a href="${inviteUrl}">${inviteUrl}</a></p>
        <p style="color:#666;font-size:12px">Se você não solicitou isso, ignore.</p>
      </div>
    `,
  };

  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Brevo error: ${r.status} ${txt}`);
  }
}

// POST = criar convite (OWNER/DIRECTOR/MANAGER)
export async function POST(req: Request) {
  try {
    const session = getSessionFromReq(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    // regras de quem pode convidar
    const inviterRole = session.role;
    const canInvite =
      inviterRole === "OWNER" || inviterRole === "DIRECTOR" || inviterRole === "MANAGER";

    if (!canInvite) {
      return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    const role = String(body?.role ?? "").trim();

    if (!email || !role) {
      return NextResponse.json({ ok: false, error: "email e role são obrigatórios." }, { status: 400 });
    }

    // MANAGER só convida BROKER / DATA_ENTRY
    if (inviterRole === "MANAGER" && !["BROKER", "DATA_ENTRY"].includes(role)) {
      return NextResponse.json({ ok: false, error: "Manager só pode convidar BROKER/DATA_ENTRY." }, { status: 403 });
    }

    // evita convidar um email que já existe
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      return NextResponse.json({ ok: false, error: "Este e-mail já possui usuário." }, { status: 400 });
    }

    const token = randomToken();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 dias

    await prisma.userInviteToken.create({
      data: {
        token,
        tenantId: session.tid,
        email,
        role: role as any,
        expiresAt,
      },
    });

    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const inviteUrl = `${appUrl}/invite/${token}`;

    await sendBrevoInviteEmail(email, inviteUrl);

    return NextResponse.json({ ok: true, inviteUrl });
  } catch (e) {
    console.error("POST /api/users/invite error:", e);
    return NextResponse.json({ ok: false, error: "Erro ao criar convite." }, { status: 500 });
  }
}

// PUT = aceitar convite (token + name + password)
export async function PUT(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token ?? "").trim();
    const name = String(body?.name ?? "").trim();
    const password = String(body?.password ?? "");

    if (!token || !name || !password) {
      return NextResponse.json(
        { ok: false, error: "token, name e password são obrigatórios." },
        { status: 400 }
      );
    }

    const invite = await prisma.userInviteToken.findUnique({ where: { token } });
    if (!invite) {
      return NextResponse.json({ ok: false, error: "Convite inválido." }, { status: 404 });
    }

    if (invite.usedAt) {
      return NextResponse.json({ ok: false, error: "Convite já utilizado." }, { status: 400 });
    }

    if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ ok: false, error: "Convite expirado." }, { status: 400 });
    }

    // cria usuário
    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        tenantId: invite.tenantId,
        email: invite.email,
        name,
        role: invite.role as any,
        passwordHash,
      },
    });

    // marca token como usado
    await prisma.userInviteToken.update({
      where: { token },
      data: { usedAt: new Date() },
    });

    // login automático
    const sessionToken = createSessionToken({ uid: user.id, tid: user.tenantId, role: user.role }, 30);

    const res = NextResponse.json({ ok: true });
    res.cookies.set(sessionCookieName, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return res;
  } catch (e) {
    console.error("PUT /api/users/invite error:", e);
    return NextResponse.json({ ok: false, error: "Erro ao aceitar convite." }, { status: 500 });
  }
}
