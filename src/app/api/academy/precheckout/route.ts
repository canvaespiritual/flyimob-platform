import { NextRequest } from "next/server";
import { academyError, academyJson, assertCollectorOrigin, readLimitedJson } from "@/lib/academy/http.server";
import { bearerToken, visitorCookieName } from "@/lib/academy/identity.server";
import { upsertLead, validateLead } from "@/lib/academy/leads.server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertCollectorOrigin(request);
    const collectorToken = bearerToken(request, true)!;
    const lead = validateLead(await readLimitedJson(request));
    const visitorToken = request.cookies.get(visitorCookieName)?.value;
    const result = await upsertLead({ lead, visitorToken: visitorToken ?? "", collectorToken });
    return academyJson({ ok: true, lead: { id: result.lead.id, name: result.lead.name, email: result.lead.email, phone: result.lead.phone }, created: result.created }, result.created ? 201 : 200);
  } catch (error) { return academyError(error); }
}
