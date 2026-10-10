import { trainingSession, response, failure } from "@/lib/training/http.server";
import { operate } from "@/lib/training/service.server";
export async function GET(request: Request) {
  try { const s = await trainingSession(request); return response(await operate(s.user, "courses")); } catch (e) { return failure(e); }
}
