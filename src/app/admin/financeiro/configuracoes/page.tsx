import FinanceiroNav from "@/components/financeiro/FinanceiroNav";
import FinancialAccountsManager from "@/components/financeiro/FinancialAccountsManager";
import { requireFinanceAccess } from "@/lib/financeiro/access.server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function FinanceiroConfiguracoesPage() {
  const session = await requireFinanceAccess();
  const accounts = await prisma.financialAccount.findMany({
    where: { tenantId: session.tenant.id },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      type: true,
      bankName: true,
      agency: true,
      account: true,
      pixType: true,
      pixKey: true,
      notes: true,
      active: true,
    },
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <FinanceiroNav />
      <div>
        <h1 className="text-2xl font-semibold">Configurações financeiras</h1>
        <p className="text-sm text-gray-600">Contas utilizadas nos movimentos financeiros da Flyimob.</p>
      </div>
      <FinancialAccountsManager accounts={accounts} />
    </div>
  );
}
