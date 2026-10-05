import { NextResponse } from "next/server";
import { beginAuthorization } from "@/lib/marketing/connections.server";
import { bodyObject, text } from "@/lib/marketing/policy";
import { marketingSession, failure } from "@/lib/marketing/http.server";
export async function POST(req: Request) {
  try {
    const viewer = await marketingSession(true), body = bodyObject(await req.json(), ["connectionId"]);
    const result = await beginAuthorization(viewer, text(body.connectionId, "Conexão"));
    const response = NextResponse.json({ url: result.url }, { headers: { "Cache-Control": "no-store" } });
    // State is also bound to this browser, actor and tenant; no credentials in the cookie.
    response.cookies.set("flyimob_meta_state", result.state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/integrations/meta/callback", maxAge: 600 });
    return response;
  } catch (error) { return failure(error); }
}
