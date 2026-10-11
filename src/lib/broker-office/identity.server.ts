import { prisma } from "@/lib/prisma";
import { resolveOperationalIdentity } from "@/lib/marketing/finance-calculations";
import { authorizeOffice, type OfficeViewer } from "./policy";
import type { OfficeDb } from "./db.server";

export async function officeIdentity(viewer: OfficeViewer, db: OfficeDb = prisma) {
  authorizeOffice(viewer);
  const tenantId = viewer.tenant.id;
  const user = await db.user.findFirst({ where: { id: viewer.user.id, tenantId, role: "BROKER", isActive: true }, select: { id: true, personId: true } });
  if (!user) throw new Error("Login indisponível.");
  const people = await db.operationPerson.findMany({ where: { tenantId }, select: { id: true, mergedIntoId: true, user: { select: { id: true } } } });
  const canonical = user.personId ? resolveOperationalIdentity(people, user.personId) : null;
  const root = people.find(p => p.id === canonical);
  // A merged person with a different explicit login is not our identity.
  const personIds = canonical && (!root?.user || root.user.id === user.id) ? people.filter(p => (!p.user || p.user.id === user.id) && resolveOperationalIdentity(people, p.id) === canonical).map(p => p.id) : [];
  const participants = await db.financialParticipant.findMany({ where: { tenantId, AND: [
    { OR: [{ userId: user.id }, { personId: { in: personIds } }] },
    { OR: [{ userId: null }, { userId: user.id }] },
    ...(user.personId ? [{ OR: [{ personId: null }, { personId: { in: personIds } }] }] : [{ personId: null }]),
  ] }, select: { id: true } });
  return { tenantId, userId: user.id, personIds, canonical: canonical && personIds.length ? canonical : user.id, participantIds: participants.map(p => p.id) };
}
export type OfficeIdentity = Awaited<ReturnType<typeof officeIdentity>>;
