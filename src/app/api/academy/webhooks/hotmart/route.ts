import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const sensitive = new Set(["authorization", "cookie", "set-cookie", "x-hotmart-hottok", "hottok"]);
  const headerNames = Array.from(request.headers.keys()).filter((name) => !sensitive.has(name.toLowerCase())).sort();
  const hasHotmartHottok = request.headers.has("x-hotmart-hottok");
  console.info("[academy-hotmart] webhook header names", { headerNames, hasHotmartHottok });
  return NextResponse.json({ ok: false, error: "hotmart_contract_unconfirmed" }, { status: 503, headers: { "Cache-Control": "no-store" } });
}
