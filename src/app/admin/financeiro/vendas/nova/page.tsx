import FinanceiroNav from "@/components/financeiro/FinanceiroNav";
import SaleForm from "@/components/financeiro/SaleForm";

import { requireFinanceAccess } from "@/lib/financeiro/access.server";
import { prisma } from "@/lib/prisma";

export const dynamic =
  "force-dynamic";

export default async function NovaVendaPage() {
  const session =
    await requireFinanceAccess();

  const tenantId =
    session.tenant.id;

  const [
    construtoras,
    empreendimentos,
  ] = await Promise.all([
    prisma.construtora.findMany({
      where: {
        tenantId,
      },

      orderBy: {
        name: "asc",
      },

      select: {
        id: true,
        name: true,
      },
    }),

    prisma.empreendimento.findMany({
      where: {
        tenantId,
      },

      orderBy: {
        name: "asc",
      },

      select: {
        id: true,
        name: true,
        construtoraId: true,
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          Nova venda
        </h1>

        <p className="mt-1 text-sm text-gray-500">
          Cadastre a operação e as
          etapas previstas de recebimento.
        </p>

        <div className="mt-5">
          <FinanceiroNav />
        </div>
      </div>

      <SaleForm
        construtoras={
          construtoras
        }
        empreendimentos={
          empreendimentos
        }
      />
    </div>
  );
}