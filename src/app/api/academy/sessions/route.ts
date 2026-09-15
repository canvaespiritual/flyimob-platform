import { NextRequest } from "next/server";
import { academyError, academyJson, assertCollectorOrigin, assertFunnelAllowed, readLimitedJson } from "@/lib/academy/http.server";
import { bearerToken, visitorCookieName, visitorCookieOptions } from "@/lib/academy/identity.server";
import { startSession } from "@/lib/academy/sessions.server";
import { validateSession } from "@/lib/academy/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertCollectorOrigin(request);
    const resumeToken = bearerToken(request, false);
    const input = validateSession(await readLimitedJson(request));
    assertFunnelAllowed(input.funnelKey);
    const { visitorToken, ...result } = await startSession(input, request.cookies.get(visitorCookieName)?.value, resumeToken);
    const response = academyJson({ ok: true, ...result }, result.resumed ? 200 : 201);
    response.cookies.set(visitorCookieName, visitorToken, visitorCookieOptions);
    return response;
  } catch (error) { return academyError(error); }
}
