import { prisma } from "@/lib/prisma";
import { brokerLoginStatus } from "./access-policy";

const accessSelect = { courseIds: true, syncPending: true, syncedAt: true } as const;
const loginSelect = { id: true, name: true, role: true, isActive: true, passwordHash: true, trainingAccess: { select: accessSelect } } as const;

// Same operational identity as Users / Team. Only explicit personId links count.
// Legacy logins without a person remain visible; names/emails never join identities.
export async function trainingBrokers(tenantId: string) {
  const [people, legacy] = await Promise.all([
    prisma.operationPerson.findMany({ where: { tenantId, mergedIntoId: null, OR: [{ operationalRole: "BROKER" }, { user: { role: "BROKER" } }] }, select: { id: true, name: true, active: true, mergedIntoId: true, user: { select: loginSelect } } }),
    prisma.user.findMany({ where: { tenantId, personId: null, role: "BROKER" }, select: loginSelect }),
  ]);
  const rows = people.map(person => {
    const user = person.user;
    const status = brokerLoginStatus(user ? { role: user.role, isActive: user.isActive, passwordConfigured: !!user.passwordHash } : null, person);
    return { id: `person:${person.id}`, userId: user?.id ?? null, name: person.name, status, eligible: status === "eligible", trainingAccess: user?.trainingAccess ?? null };
  });
  for (const user of legacy) {
    const status = brokerLoginStatus({ role: user.role, isActive: user.isActive, passwordConfigured: !!user.passwordHash });
    rows.push({ id: `user:${user.id}`, userId: user.id, name: user.name, status, eligible: status === "eligible", trainingAccess: user.trainingAccess });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.id.localeCompare(b.id));
}
