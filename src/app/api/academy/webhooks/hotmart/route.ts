import { NextResponse } from "next/server";
import { HOTMART_WEBHOOK_CONTRACT, hotmartProcessingIsConfigured } from "@/lib/academy/hotmart.server";

export const runtime = "nodejs";

export async function POST() {
  if (!hotmartProcessingIsConfigured()) return NextResponse.json({ ok: false, error: "hotmart_contract_unconfirmed" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ ok: false, error: "hotmart_payload_contract_unconfirmed", provider: HOTMART_WEBHOOK_CONTRACT.provider }, { status: 501, headers: { "Cache-Control": "no-store" } });
}
