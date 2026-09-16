import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/authz.server";
import { academyCentralLeads } from "@/lib/academy/central.server";
export async function GET(req: NextRequest) { await requireUser(); const p = req.nextUrl.searchParams; const to = p.get("to") ? new Date(p.get("to")!) : new Date(); const from = p.get("from") ? new Date(p.get("from")!) : new Date(to.getTime() - 7 * 86400000); return NextResponse.json({ leads: await academyCentralLeads({ from, to, funnelKey: p.get("funnelKey") || undefined, vslKey: p.get("vslKey") || undefined, source: p.get("source") || undefined, utmCampaign: p.get("utmCampaign") || undefined, adsetId: p.get("adsetId") || undefined, adId: p.get("adId") || undefined }, p.get("search") || undefined) }); }
