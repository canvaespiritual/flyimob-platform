import { timingSafeEqual } from "node:crypto";
import { academyError, academyJson } from "@/lib/academy/http.server";
import { runPushWorker } from "@/lib/academy/push.server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const expected = process.env.ACADEMY_PUSH_WORKER_SECRET;
  const received = request.headers.get("authorization") ?? "";
  if (!expected || expected.length < 32) return academyJson({ error: "worker_not_configured" }, 503);
  const token = `Bearer ${expected}`;
  if (Buffer.byteLength(received) !== Buffer.byteLength(token) || !timingSafeEqual(Buffer.from(received), Buffer.from(token))) {
    return academyJson({ error: "unauthorized" }, 401);
  }
  try { return academyJson({ ok: true, ...await runPushWorker() }); }
  catch (error) { return academyError(error); }
}
