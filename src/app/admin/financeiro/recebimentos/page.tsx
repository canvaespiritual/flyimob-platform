import FinanceiroNav from "@/components/financeiro/FinanceiroNav";
import ReceiptRemittanceCenter from "@/components/financeiro/ReceiptRemittanceCenter";
import { requireFinanceAccess } from "@/lib/financeiro/access.server";
import { availableGroupedAllocations, availableIndividualInvoices } from "@/lib/financeiro/receipt-remittances.server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function RecebimentosPage() {
  const session = await requireFinanceAccess();
  const tenantId = session.tenant.id;
  const [entries, grouped, accounts, remittances] = await Promise.all([
    availableIndividualInvoices(prisma, tenantId),
    availableGroupedAllocations(prisma, tenantId),
    prisma.financialAccount.findMany({ where: { tenantId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, bankName: true } }),
    prisma.financialReceiptRemittance.findMany({ where: { tenantId }, orderBy: { receivedAt: "desc" }, take: 100,
      include: { construtora: { select: { name: true } }, _count: { select: { receipts: true } } } }),
  ]);
  const invoices = [...entries.map(({ invoice, gross, withheld, balance }) => ({
    id: invoice.id, key: invoice.id, grouped: false, number: invoice.number, stageId: invoice.stageId,
    stageType: invoice.stage.type, stageLabel: invoice.stage.label,
    saleId: invoice.stage.saleId, clientName: invoice.stage.sale.clientName,
    construtoraId: invoice.stage.sale.construtoraId!, construtora: invoice.stage.sale.construtora?.name ?? "",
    empreendimento: invoice.stage.sale.empreendimento?.name ?? invoice.stage.sale.empreendimentoNameManual ?? "",
    gross: gross.toString(), withheld: withheld.toString(), balance: balance.toString(),
  })), ...grouped.map(({ invoice, allocation, gross, withheld, balance }) => ({
    id: invoice.id, key: `${invoice.id}:${allocation.stageId}`, grouped: true,
    number: invoice.number, stageId: allocation.stageId, stageType: allocation.stage.type,
    stageLabel: allocation.stage.label, saleId: allocation.stage.saleId,
    clientName: allocation.stage.sale.clientName, construtoraId: invoice.construtoraId!,
    construtora: invoice.construtora?.name ?? "",
    empreendimento: allocation.stage.sale.empreendimento?.name ?? allocation.stage.sale.empreendimentoNameManual ?? "",
    gross: gross.toString(), withheld: withheld.toString(), balance: balance.toString(),
  }))];
  return <div className="mx-auto max-w-7xl space-y-6 p-6">
    <FinanceiroNav />
    <div><h1 className="text-2xl font-semibold">Recebimentos</h1><p className="text-sm text-gray-600">Notas a receber e PIX recebidos das construtoras.</p></div>
    <ReceiptRemittanceCenter invoices={invoices} accounts={accounts} remittances={remittances.map((item) => ({
      id: item.id, receivedAt: item.receivedAt.toISOString(), construtora: item.construtora.name,
      count: item._count.receipts, amount: item.amount.toString(), status: item.status,
    }))} />
  </div>;
}
