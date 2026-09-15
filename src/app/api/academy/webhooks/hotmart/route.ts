import { NextResponse } from "next/server";
import { processHotmartWebhook, hotmartProcessingIsConfigured } from "@/lib/academy/hotmart.server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hotmartProcessingIsConfigured()) return NextResponse.json({ ok: false, error: "hotmart_not_configured" }, { status: 503 });
  const received = request.headers.get("x-hotmart-hottok");
  const expected = process.env.HOTMART_HOTTOK!;
  const { timingSafeEqual } = await import("node:crypto");
  if (!received || Buffer.byteLength(received) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let payload: unknown;
  try { payload = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  try { return NextResponse.json({ ok: true, ...(await processHotmartWebhook(payload)) }, { status: 200, headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error && error.message === "invalid_hotmart_payload" ? "invalid_payload" : "internal_error" }, { status: error instanceof Error && error.message === "invalid_hotmart_payload" ? 400 : 500 }); }
}
