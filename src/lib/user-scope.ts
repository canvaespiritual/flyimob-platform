import { Prisma } from "@prisma/client";
import { UserRole } from "@prisma/client";

export async function usersScopeWhere(
  prisma: Prisma.TransactionClient | Prisma.DefaultPrismaClient,
  viewer: {
    id: string;
    role: UserRole;
    tenantId: string;
  }
): Promise<Prisma.UserWhereInput> {

  // OWNER vê todo mundo do tenant
  if (viewer.role === "OWNER") {
    return { tenantId: viewer.tenantId };
  }

  // DIRECTOR: vê quem responde a ele + nível abaixo
  if (viewer.role === "DIRECTOR") {
    const managers = await prisma.user.findMany({
      where: { supervisorId: viewer.id },
      select: { id: true },
    });

    const managerIds = managers.map(m => m.id);

    return {
      tenantId: viewer.tenantId,
      OR: [
        { supervisorId: viewer.id },            // managers/brokers diretos
        { supervisorId: { in: managerIds } },   // brokers dos managers
      ],
    };
  }

  // MANAGER: só os corretores dele
  if (viewer.role === "MANAGER") {
    return {
      tenantId: viewer.tenantId,
      supervisorId: viewer.id,
    };
  }

  // BROKER / DATA_ENTRY: só ele mesmo
  return {
    tenantId: viewer.tenantId,
    id: viewer.id,
  };
}
