import { prisma } from "@/lib/prisma";
import { trainingSession, response, failure, smallBody } from "@/lib/training/http.server";
import { configuredCourseIds } from "@/lib/training/horizonte.server";
import { setAccess } from "@/lib/training/service.server";
import { TrainingError } from "@/lib/training/contract";
export async function GET(request: Request) {
  try { const s = await trainingSession(request, true); return response({ courseIds: configuredCourseIds(), brokers: await prisma.user.findMany({ where: { tenantId: s.tenant.id, role: "BROKER", isActive: true }, select: { id: true, name: true, trainingAccess: { select: { courseIds: true, syncPending: true, syncedAt: true } } }, orderBy: { name: "asc" } }) }); } catch (e) { return failure(e); }
}
export async function PUT(request: Request) {
  try { const s = await trainingSession(request, true), body = await smallBody(request); if (!body || typeof body.brokerId !== "string") throw new TrainingError(400, "invalid_body"); return response(await setAccess(s.user, body.brokerId, body.courseIds)); } catch (e) { return failure(e); }
}
