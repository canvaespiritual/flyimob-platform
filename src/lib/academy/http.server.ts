import { NextResponse } from "next/server";
import { AcademyError, LIMITS } from "./limits";

export function assertCollectorOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const configured = process.env.ACADEMY_ALLOWED_ORIGINS;
  const allowed = configured ? configured.split(",").map((item) => item.trim()) : [new URL(request.url).origin];
  if (!origin || origin === "null" || !allowed.includes(origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new AcademyError(403, "origin_not_allowed");
  }
  // No permissive CORS. This hook is also the entry point for future shared throttling.
}

export function assertFunnelAllowed(funnelKey: string) {
  const allowed = (process.env.ACADEMY_FUNNEL_KEYS ?? "corretor-academy,corretor-de-imoveis").split(",").map((item) => item.trim());
  if (!allowed.includes(funnelKey)) throw new AcademyError(400, "unknown_funnel");
}

export async function readLimitedJson(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new AcademyError(415, "json_required");
  }
  const encoding = request.headers.get("content-encoding");
  if (encoding && encoding !== "identity") throw new AcademyError(415, "unsupported_encoding");
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > LIMITS.bodyBytes)) throw new AcademyError(413, "body_too_large");
  if (!request.body) throw new AcademyError(400, "invalid_json");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LIMITS.bodyBytes) {
        await reader.cancel();
        throw new AcademyError(413, "body_too_large");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer)) as unknown; }
  catch { throw new AcademyError(400, "invalid_json"); }
}

export function academyJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", "Vary": "Cookie, Authorization, Origin" } });
}
export function academyError(error: unknown) {
  if (error instanceof AcademyError) return academyJson({ ok: false, error: error.code }, error.status);
  // Deliberately omit request bodies, tokens, URLs and database error messages.
  console.error("[academy] collector request failed");
  return academyJson({ ok: false, error: "internal_error" }, 500);
}
