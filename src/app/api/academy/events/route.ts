import { NextRequest } from "next/server";
import { academyError, academyJson, assertCollectorOrigin, readLimitedJson } from "@/lib/academy/http.server";
import { bearerToken, visitorCookieName } from "@/lib/academy/identity.server";
import { collectEvents } from "@/lib/academy/events.server";
import { validateEvents } from "@/lib/academy/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertCollectorOrigin(request);
    const token = bearerToken(request, true)!;
    const events = validateEvents(await readLimitedJson(request));
    return academyJson({ ok: true, ...await collectEvents(events, token, request.cookies.get(visitorCookieName)?.value) });
  } catch (error) { return academyError(error); }
}
