import { NextRequest, NextResponse } from "next/server";
import { sessionCookieName } from "@/lib/auth";

const APP_URL = process.env.APP_URL || "http://localhost:3000";

function clearSessionCookie(res: NextResponse) {
  res.cookies.set(sessionCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function GET(_req: NextRequest) {
  const res = NextResponse.redirect(`${APP_URL}/login`);
  clearSessionCookie(res);
  return res;
}

export async function POST(_req: NextRequest) {
  const res = NextResponse.redirect(`${APP_URL}/login`);
  clearSessionCookie(res);
  return res;
}
