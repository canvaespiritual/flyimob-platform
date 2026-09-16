import { NextRequest, NextResponse } from "next/server";
import { academyAccessResponse } from "@/lib/academy/admin-access.server";
import { academyCentralSummary } from "@/lib/academy/central.server";

function filters(req: NextRequest) {
  const p = req.nextUrl.searchParams; const to = p.get("to") ? new Date(p.get("to")!) : new Date(); const from = p.get("from") ? new Date(p.get("from")!) : new Date(to.getTime() - 7 * 86400000);
  return { from, to, funnelKey: p.get("funnelKey") || undefined, vslKey: p.get("vslKey") || undefined, source: p.get("source") || undefined, utmCampaign: p.get("utmCampaign") || undefined, adsetId: p.get("adsetId") || undefined, adId: p.get("adId") || undefined };
}
export async function GET(req: NextRequest) { const denied = await academyAccessResponse(); if (denied) return denied; const f = filters(req); if (Number.isNaN(f.from.getTime()) || Number.isNaN(f.to.getTime()) || f.from >= f.to) return NextResponse.json({ error: "invalid_period" }, { status: 400 }); return NextResponse.json(await academyCentralSummary(f)); }
