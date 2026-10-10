import { getSessionUser } from "@/lib/session.server";
import { TrainingError } from "./contract";
export function assertTrainingOrigin(request: Request, publicOrigin = process.env.NODE_ENV === "production" ? process.env.APP_URL : undefined) {
  if (process.env.NODE_ENV === "production" && !publicOrigin) throw new TrainingError(503, "configuration");
  let expected: URL;
  try { expected = new URL(publicOrigin ?? request.url); }
  catch { throw new TrainingError(503, "configuration"); }
  if (publicOrigin && (expected.protocol !== "https:" || expected.username || expected.password || expected.pathname !== "/" || expected.search || expected.hash)) throw new TrainingError(503, "configuration");
  if (request.headers.get("origin") !== expected.origin || request.headers.get("sec-fetch-site") === "cross-site") throw new TrainingError(403, "origin");
}
export async function trainingSession(request: Request, admin = false) {
  const session = await getSessionUser();
  if (!session) throw new TrainingError(401, "login_required");
  if (session.tenant.isPlatform || (admin ? !["OWNER", "DIRECTOR"].includes(session.user.role) : session.user.role !== "BROKER")) throw new TrainingError(403, "forbidden");
  if (request.method !== "GET") {
    assertTrainingOrigin(request);
  }
  return session;
}
export async function smallBody(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new TrainingError(415, "content_type");
  const reader = request.body?.getReader();
  if (!reader) throw new TrainingError(400, "invalid_body");
  const chunks: Uint8Array[] = []; let length = 0;
  for (;;) { const { value, done } = await reader.read(); if (done) break; length += value.length; if (length > 16384) { await reader.cancel(); throw new TrainingError(413, "body_too_large"); } chunks.push(value); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new TrainingError(400, "invalid_body"); }
}
export function response(data: unknown, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } }); }
export function failure(error: unknown) { return response({ error: error instanceof TrainingError ? error.code : "unavailable" }, error instanceof TrainingError ? error.status : 503); }
