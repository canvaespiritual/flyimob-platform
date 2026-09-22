import FinanceiroNav from "@/components/financeiro/FinanceiroNav";
import GroupedInvoicingCenter from "@/components/financeiro/GroupedInvoicingCenter";
import { requireFinanceAccess } from "@/lib/financeiro/access.server";
import { billableStages } from "@/lib/financeiro/grouped-invoicing.server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const invoiceInclude = { stage: { include: { sale: { select: { clientName: true } } } },
  taxEntries: true, construtora: { select: { name: true } },
  allocations: { include: { stage: { include: { sale: { select: { clientName: true } } } } } },
} satisfies Prisma.FinancialInvoiceInclude;

export default async function FaturamentoPage({ searchParams }: { searchParams: Promise<{ invoiceId?: string }> }) {
  const session = await requireFinanceAccess();
  const tenantId = session.tenant.id;
  const { invoiceId } = await searchParams;
  const [entries, recentInvoices, selectedInvoice] = await Promise.all([
    billableStages(prisma, tenantId),
    prisma.financialInvoice.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 200, include: invoiceInclude }),
    invoiceId ? prisma.financialInvoice.findFirst({ where: { id: invoiceId, tenantId }, include: invoiceInclude }) : Promise.resolve(null),
  ]);
  const invoices = selectedInvoice && !recentInvoices.some((item) => item.id === selectedInvoice.id)
    ? [selectedInvoice, ...recentInvoices] : recentInvoices;
  return <div className="mx-auto max-w-7xl space-y-6 p-6">
    <FinanceiroNav />
    <div><h1 className="text-2xl font-semibold">Faturamento</h1><p className="text-sm text-gray-600">Componha uma NF com etapas da mesma construtora e consulte as notas emitidas.</p></div>
    <GroupedInvoicingCenter stages={entries.filter((entry) => entry.economics.billableBalance.gt(0)
      && !entry.stage.receipts.some((receipt) => receipt.status === "CONFIRMED" && !receipt.invoiceId)).map(({ stage, economics }) => ({
      id: stage.id, saleId: stage.saleId, clientName: stage.sale.clientName,
      construtoraId: stage.sale.construtoraId!, construtora: stage.sale.construtora?.name ?? "",
      empreendimento: stage.sale.empreendimento?.name ?? stage.sale.empreendimentoNameManual ?? "",
      type: stage.type, label: stage.label, balance: economics.billableBalance.toString(),
    }))} invoices={invoices.map((invoice) => ({ id: invoice.id, number: invoice.number,
      gross: invoice.grossAmount?.toString() ?? "0", status: invoice.status,
      issuedAt: invoice.issuedAt?.toISOString() ?? null,
      grouped: invoice.stageId === null, construtora: invoice.construtora?.name ?? "",
      taxes: invoice.taxEntries.map((tax) => ({ id: tax.id, invoiceId: tax.invoiceId,
        name: tax.name, kind: tax.kind, rate: tax.rate ? Number(tax.rate) : null,
        amount: tax.amount ? Number(tax.amount) : null, status: tax.status })),
      composition: invoice.stage ? [{ stageId: invoice.stage.id, saleId: invoice.stage.saleId, clientName: invoice.stage.sale.clientName,
        label: invoice.stage.label ?? invoice.stage.type, amount: invoice.grossAmount?.toString() ?? "0" }]
        : invoice.allocations.map((item) => ({ stageId: item.stageId, saleId: item.stage.saleId, clientName: item.stage.sale.clientName,
          label: item.stage.label ?? item.stage.type, amount: item.amount.toString() })),
    }))} />
  </div>;
}
