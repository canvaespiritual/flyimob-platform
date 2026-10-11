import { assertionHeaders, TrainingError } from "./contract";

export function trainingConfig() {
  if (process.env.HORIZONTE_ENABLED !== "true") throw new TrainingError(503, "not_configured");
  let origin: URL;
  try { origin = new URL(process.env.HORIZONTE_ORIGIN ?? ""); }
  catch { throw new TrainingError(503, "configuration"); }
  if ((origin.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && origin.protocol === "http:" && origin.hostname === "localhost")) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash)
    throw new TrainingError(503, "configuration");
  const clientId = process.env.HORIZONTE_CLIENT_ID, key = process.env.HORIZONTE_PRIVATE_KEY;
  if (!clientId || !key) throw new TrainingError(503, "configuration");
  return { origin: origin.origin, clientId, key };
}
// References only: the education catalog and progress remain in Horizonte.
export function configuredCourseIds() { return (process.env.HORIZONTE_COURSE_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean); }
async function request(path: string, init: RequestInit) {
  const config = trainingConfig();
  let response: Response;
  try { response = await fetch(config.origin + path, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000) }); }
  catch { throw new TrainingError(503, "unavailable"); }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    // Translate only known upstream errors; never expose arbitrary upstream text or signed URLs.
    const upstream = payload?.code ?? payload?.error;
    const codes: Record<string, string> = {
      SESSION_LIMIT: "session_limit",
      "Há cinco reproduções abertas. Aguarde sua expiração ou feche as sessões anteriores.": "session_limit",
      SESSION_EXPIRED: "session_expired", STALE_SESSION: "stale_session", INVALID_SESSION: "invalid_session", TOO_FREQUENT: "too_frequent",
      NOT_READY: "media_not_ready", "O vídeo ainda não está pronto para reprodução.": "media_not_ready",
      INVALID_PROGRESS: "invalid_progress",
    };
    const code = codes[upstream] ?? (response.status === 401 ? "upstream_authorization" : [403, 404].includes(response.status) ? "access_or_lesson_unavailable" : response.status === 429 ? "too_frequent" : path.endsWith("/progress") && response.status === 400 ? "progress_rejected" : "upstream_error");
    const status = response.status === 401 ? 502 : [400, 403, 404, 409, 422, 429].includes(response.status) ? response.status : 502;
    console.warn("training_upstream_failure", { path, status: response.status, code, requestId: response.headers.get("x-railway-request-id") });
    throw new TrainingError(status, code);
  }
  try { return await response.json(); } catch { throw new TrainingError(502, "invalid_response"); }
}
export async function exchange(user: { id: string; tenantId: string; name: string }, courseIds: string[]) {
  const config = trainingConfig();
  const body = JSON.stringify({ subject: `${user.tenantId}:${user.id}`, name: user.name.slice(0, 200), courses: courseIds.map(id => ({ id, expiresAt: new Date(Date.now() + 23 * 3600000).toISOString() })) });
  if (Buffer.byteLength(body) > 16384) throw new TrainingError(400, "too_many_courses");
  const result = await request("/api/integrations/v1/exchange", { method: "POST", headers: assertionHeaders(body, config.clientId, config.key), body });
  const remaining = Date.parse(result.expiresAt) - Date.now();
  if (typeof result.token !== "string" || !/^[\w-]{43}$/.test(result.token) || result.tokenType !== "Bearer" || !Number.isFinite(remaining) || remaining <= 0 || remaining > 330000) throw new TrainingError(502, "invalid_response");
  return result.token as string;
}
export async function learnerRequest(token: string, path: string, method = "GET", body?: unknown) {
  return request(path, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
