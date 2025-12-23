// src/app/api/auth/logout/route.ts
import { NextRequest, NextResponse } from "next/server";
import { sessionCookieName } from "@/lib/auth"; // ajuste se no seu projeto estiver em "@/lib/auth.server"

function clearSessionCookie(res: NextResponse) {
  res.cookies.set(sessionCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  // opcional: se quiser respeitar ?returnTo=...
  const returnTo = url.searchParams.get("returnTo") || "/login";

  const res = NextResponse.redirect(new URL(returnTo, url.origin));
  clearSessionCookie(res);
  return res;
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);

  // para POST, também redireciona (evita tela JSON)
  const returnTo = url.searchParams.get("returnTo") || "/login";

  const res = NextResponse.redirect(new URL(returnTo, url.origin));
  clearSessionCookie(res);
  return res;
}
