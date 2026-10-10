import { prisma } from "@/lib/prisma";
import { exchange, learnerRequest, configuredCourseIds } from "./horizonte.server";
import { TrainingError, validateCourseIds, type Course } from "./contract";
import { brokerLoginStatus } from "./access-policy";

type User = { id: string; tenantId: string; name: string };
// All app instances serialize changes and upstream operations for the same identity.
// Tokens live only for the duration of the request; no token enters the client or DB.
export async function operate(user: User, action: "courses" | "playback" | "refresh" | "progress", lessonId?: string, body?: unknown) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"training:" + user.id}))`;
    const current = await tx.user.findFirst({ where: { id: user.id, tenantId: user.tenantId, role: "BROKER", isActive: true } });
    if (!current) throw new TrainingError(403, "forbidden");
    const access = await tx.trainingAccess.findUnique({ where: { userId: user.id } });
    if (!access?.courseIds.length) {
      if (access?.syncPending && action === "courses") {
        await exchange(user, []);
        await tx.trainingAccess.update({ where: { userId: user.id }, data: { syncPending: false, syncedAt: new Date() } });
      }
      if (action === "courses") return { data: [] };
      throw new TrainingError(403, "access_revoked");
    }
    const token = await exchange(user, access.courseIds);
    const catalog = await learnerRequest(token, "/api/v1/courses") as { data: Course[] };
    if (!Array.isArray(catalog.data)) throw new TrainingError(502, "invalid_response");
    catalog.data = catalog.data.filter(course => access.courseIds.includes(course.id));
    let result: unknown = { ...catalog, lastLessonId: access.lastLessonId };
    if (action !== "courses") {
      if (!catalog.data.some(c => access.courseIds.includes(c.id) && c.modules.some(m => m.lessons.some(l => l.id === lessonId)))) throw new TrainingError(403, "access_revoked");
      result = await learnerRequest(token, `/api/lessons/${encodeURIComponent(lessonId!)}/${action === "progress" ? "progress" : "playback"}`, action === "refresh" ? "PATCH" : "POST", body);
    }
    await tx.trainingAccess.update({ where: { userId: user.id }, data: { syncPending: false, syncedAt: new Date(), ...(action === "playback" ? { lastLessonId: lessonId } : {}) } });
    return result;
  }, { timeout: 30000, maxWait: 10000 });
}

export async function setAccess(admin: User, brokerId: string, raw: unknown) {
  const ids = validateCourseIds(raw, configuredCourseIds());
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"training:" + brokerId}))`;
    const broker = await tx.user.findFirst({ where: { id: brokerId, tenantId: admin.tenantId, role: "BROKER", isActive: true }, select: { id: true, tenantId: true, name: true, role: true, isActive: true, passwordHash: true, person: { select: { active: true, mergedIntoId: true } } } });
    if (!broker) throw new TrainingError(404, "broker_not_found");
    if (ids.length && brokerLoginStatus({ role: broker.role, isActive: broker.isActive, passwordConfigured: !!broker.passwordHash }, broker.person) !== "eligible") throw new TrainingError(409, "broker_login_required");
    const data = { tenantId: admin.tenantId, courseIds: ids, updatedBy: admin.id, syncPending: true };
    await tx.trainingAccess.upsert({ where: { userId: brokerId }, create: { ...data, userId: brokerId }, update: data });
    try {
      await exchange(broker, ids);
      await tx.trainingAccess.update({ where: { userId: brokerId }, data: { syncPending: false, syncedAt: new Date() } });
      return { ok: true, syncPending: false };
    } catch {
      // Desired permissions remain authoritative even when Horizonte is unavailable.
      return { ok: true, syncPending: true };
    }
  }, { timeout: 20000, maxWait: 10000 });
}
