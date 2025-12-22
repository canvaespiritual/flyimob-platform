// middleware.ts
// src/middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionIdFromReq, redirectToLogin } from "./lib/auth.edge";


export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  console.log("MIDDLEWARE HIT:", pathname);

  // liberar rotas públicas essenciais
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/invite") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/users/invite")
  ) {
    return NextResponse.next();
  }

  // proteger /admin
  if (pathname.startsWith("/admin")) {
    const sid = getSessionIdFromReq(req);
    if (!sid) return redirectToLogin(req);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};