import FinanceiroNav from "@/components/financeiro/FinanceiroNav";
import ParticipantForm from "@/components/financeiro/ParticipantForm";

import { requireFinanceAccess } from "@/lib/financeiro/access.server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NovoParticipantePage() {
  const session =
    await requireFinanceAccess();

  const users =
    await prisma.user.findMany({
      where: {
        tenantId:
          session.tenant.id,
        isActive: true,
      },

      orderBy: {
        name: "asc",
      },

      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          Novo participante
        </h1>

        <p className="mt-1 text-sm text-gray-500">
          Cadastre uma pessoa que poderá receber
          comissões, repasses, bônus ou outros valores.
        </p>

        <div className="mt-5">
          <FinanceiroNav />
        </div>
      </div>

      <ParticipantForm
        users={users}
      />
    </div>
  );
}