import { trainingSession, response, failure, smallBody } from "@/lib/training/http.server";
import { operate } from "@/lib/training/service.server";
import { TrainingError } from "@/lib/training/contract";
async function handle(request: Request, context: { params: Promise<{ id: string; action: string }> }) {
  try {
    const s = await trainingSession(request), { id, action } = await context.params;
    if (!id || id.length > 100 || !["playback", "progress"].includes(action) || (["PATCH", "DELETE"].includes(request.method) && action !== "playback")) throw new TrainingError(404, "not_found");
    let body: unknown;
    if (action === "progress") {
      const raw = await smallBody(request);
      if (!raw || typeof raw.sessionId !== "string" || raw.sessionId.length > 100 || !Number.isSafeInteger(raw.sequence) || raw.sequence < 1 || !Number.isFinite(raw.position) || raw.position < 0 || raw.position > 7200 || typeof raw.playing !== "boolean" || ![1, 1.25, 1.5, 2].includes(raw.rate)) throw new TrainingError(400, "invalid_progress");
      if (raw.segments !== undefined && (!Array.isArray(raw.segments) || raw.segments.length > 128 || raw.segments.some((s: { start: number; end: number; seconds: number; rate: number } | null) => !s || ![s.start, s.end, s.seconds].every(Number.isFinite) || s.start < 0 || s.end > 7200 || s.seconds <= 0 || s.seconds > 45 || ![1, 1.25, 1.5, 2].includes(s.rate)))) throw new TrainingError(422, "invalid_progress");
      body = { sessionId: raw.sessionId, sequence: raw.sequence, position: raw.position, playing: raw.playing, rate: raw.rate, ...(raw.segments === undefined ? {} : { segments: raw.segments.map((s: { start: number; end: number; seconds: number; rate: number }) => ({ start: s.start, end: s.end, seconds: s.seconds, rate: s.rate })) }) };
    } else if (request.method === "DELETE") {
      const raw = await smallBody(request);
      if (!raw || typeof raw.sessionId !== "string" || !raw.sessionId.length || raw.sessionId.length > 100) throw new TrainingError(400, "invalid_session");
      body = { sessionId: raw.sessionId };
    } else if (request.method === "POST" && request.body) {
      const raw = await smallBody(request);
      if (!raw || typeof raw.contextId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(raw.contextId) || !Number.isSafeInteger(raw.generation) || raw.generation < 1) throw new TrainingError(400, "invalid_session");
      body = { contextId: raw.contextId, generation: raw.generation };
    }
    return response(await operate(s.user, action === "progress" ? "progress" : request.method === "PATCH" ? "refresh" : request.method === "DELETE" ? "close" : "playback", id, body));
  } catch (e) { return failure(e); }
}
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
