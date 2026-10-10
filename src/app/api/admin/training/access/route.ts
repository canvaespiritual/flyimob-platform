import { trainingBrokers } from "@/lib/training/brokers.server";
import { trainingCourseTitle } from "@/lib/training/access-policy";
import { trainingSession, response, failure, smallBody } from "@/lib/training/http.server";
import { configuredCourseIds } from "@/lib/training/horizonte.server";
import { setAccess } from "@/lib/training/service.server";
import { TrainingError } from "@/lib/training/contract";
export async function GET(request: Request) {
  try { const s = await trainingSession(request, true), courseIds = configuredCourseIds(); return response({ courseIds, courses: courseIds.map(id => ({ id, title: trainingCourseTitle(id) })), brokers: await trainingBrokers(s.tenant.id) }); } catch (e) { return failure(e); }
}
export async function PUT(request: Request) {
  try { const s = await trainingSession(request, true), body = await smallBody(request); if (!body || typeof body.brokerId !== "string") throw new TrainingError(400, "invalid_body"); return response(await setAccess(s.user, body.brokerId, body.courseIds)); } catch (e) { return failure(e); }
}
