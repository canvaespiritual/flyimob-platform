import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { marketingSession } from "@/lib/marketing/http.server";
import { completeAuthorization, discoverAccounts } from "@/lib/marketing/connections.server";
export async function GET(req: Request) {
  // Fixed redirect; neither provider errors nor codes/tokens are reflected in UI or application logs.
  let outcome = "error";
  try {
    const viewer = await marketingSession(true), query = new URL(req.url).searchParams;
    const state = query.get("state") ?? "", bound = (await cookies()).get("flyimob_meta_state")?.value ?? "";
    if (!bound || !state || Buffer.byteLength(bound) !== Buffer.byteLength(state) || !timingSafeEqual(Buffer.from(bound), Buffer.from(state))) throw new Error();
    const { connectionId } = await completeAuthorization(viewer, state, query.has("error") ? null : query.get("code"));
    outcome = "connected";
    try { await discoverAccounts(viewer, connectionId); } catch { outcome = "discovery_pending"; }
  } catch { /* sanitized outcome only */ }
  const response = NextResponse.redirect(`https://flyimob.com/admin/marketing/configuracoes?meta=${outcome}`, 303);
  response.cookies.set("flyimob_meta_state", "", { httpOnly: true, secure: true, sameSite: "lax", path: "/api/integrations/meta/callback", maxAge: 0 });
  response.headers.set("Cache-Control", "no-store"); response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
