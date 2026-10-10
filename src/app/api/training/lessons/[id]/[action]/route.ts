import { trainingSession, response, failure, smallBody } from "@/lib/training/http.server";
import { operate } from "@/lib/training/service.server";
import { TrainingError } from "@/lib/training/contract";
async function handle(request: Request, context: { params: Promise<{ id: string; action: string }> }) {
  try {
    const s = await trainingSession(request), { id, action } = await context.params;
    if (!id || id.length > 100 || !["playback", "progress"].includes(action) || (request.method === "PATCH" && action !== "playback")) throw new TrainingError(404, "not_found");
    let body: unknown;
    if (action === "progress") {
      const raw = await smallBody(request);
      if (!raw || typeof raw.sessionId !== "string" || raw.sessionId.length > 100 || !Number.isSafeInteger(raw.sequence) || raw.sequence < 1 || !Number.isFinite(raw.position) || raw.position < 0 || raw.position > 7200 || typeof raw.playing !== "boolean" || ![1, 1.25, 1.5, 2].includes(raw.rate)) throw new TrainingError(400, "invalid_progress");
      body = { sessionId: raw.sessionId, sequence: raw.sequence, position: raw.position, playing: raw.playing, rate: raw.rate };
    }
    return response(await operate(s.user, action === "progress" ? "progress" : request.method === "PATCH" ? "refresh" : "playback", id, body));
  } catch (e) { return failure(e); }
}
export const POST = handle;
export const PATCH = handle;
