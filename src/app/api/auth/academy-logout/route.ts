import { NextResponse } from "next/server";
import { sessionCookieName } from "@/lib/auth.server";

export async function POST() {
  const response = new NextResponse(null, {
    status: 303,
    headers: {
      Location: "/login?returnTo=%2Facademy-admin",
      "Cache-Control": "no-store",
    },
  });
  response.cookies.set(sessionCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
