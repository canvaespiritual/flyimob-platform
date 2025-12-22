// src/lib/auth.edge.ts
import { NextRequest, NextResponse } from "next/server";

export const SESSION_COOKIE = "flyimob_session";

export function getSessionIdFromReq(req: NextRequest) {
  return req.cookies.get(SESSION_COOKIE)?.value ?? null;
}

export function redirectToLogin(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("returnTo", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}
