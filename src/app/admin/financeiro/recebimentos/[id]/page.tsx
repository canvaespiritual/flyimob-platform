import Link from "next/link";
import { notFound } from "next/navigation";
import FinanceiroNav from "@/components/financeiro/FinanceiroNav";
import FinancialAttachmentsManager from "@/components/financeiro/FinancialAttachmentsManager";
import { requireFinanceAccess } from "@/lib/financeiro/access.server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const brl = (value: unknown) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function ReceiptRemittancePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireFinanceAccess();
  const { id } = await params;
  const item = await prisma.financialReceiptRemittance.findFirst({ where: { id, tenantId: session.tenant.id },
    include: { construtora: { select: { name: true } }, financialAccount: { select: { name: true, bankName: true } },
      receipts: { include: { invoice: { select: { number: true } }, stage: { include: { sale: { select: { id: true, clientName: true } } } } }, orderBy: { createdAt: "asc" } } } });
  if (!item) notFound();
  const creator = await prisma.user.findFirst({ where: { id: item.createdById, tenantId: session.tenant.id }, select: { name: true } });
  const total = item.receipts.reduce((sum, receipt) => sum + Number(receipt.amount ?? 0), 0);
  return <div className="mx-auto max-w-5xl space-y-6 p-6"><FinanceiroNav />
    <div><Link href="/admin/financeiro/recebimentos" className="text-sm underline">← Recebimentos</Link><h1 className="mt-2 text-2xl font-semibold">Remessa de recebimento #{item.id.slice(-8)}</h1></div>
    <section className="grid gap-3 rounded-lg border bg-white p-5 sm:grid-cols-2">
      <p><strong>Construtora:</strong> {item.construtora.name}</p><p><strong>Status:</strong> {item.status === "CONFIRMED" ? "Confirmada" : item.status}</p>
      <p><strong>Conta:</strong> {item.financialAccount.name} {item.financialAccount.bankName ?? ""}</p><p><strong>Data recebida:</strong> {item.receivedAt.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</p>
      <p><strong>Valor recebido:</strong> {brl(item.amount)}</p><p><strong>Saldo esperado das NFs na criação:</strong> {brl(item.expectedAmount)}</p>
      <p><strong>Referência:</strong> {item.reference ?? "—"}</p><p><strong>Criado por:</strong> {creator?.name ?? item.createdById}</p>
      <p><strong>Criado em:</strong> {item.createdAt.toLocaleString("pt-BR")}</p><p><strong>Observações:</strong> {item.notes ?? "—"}</p>
    </section>
    <section className="rounded-lg border bg-white p-5"><h2 className="mb-3 text-lg font-semibold">Composição</h2><div className="divide-y">{item.receipts.map((receipt) => <div key={receipt.id} className="flex justify-between gap-3 py-3"><span>NF {receipt.invoice?.number ?? "sem número"} · <Link className="underline" href={`/admin/financeiro/vendas/${receipt.stage.sale.id}`}>{receipt.stage.sale.clientName}</Link> · {receipt.stage.type}{receipt.stage.label ? ` (${receipt.stage.label})` : ""}</span><strong>{brl(receipt.amount)}</strong></div>)}</div><div className="flex justify-between border-t pt-3 font-semibold"><span>Total das parcelas</span><span>{brl(total)}</span></div></section>
    <FinancialAttachmentsManager entityType="RECEIPT_REMITTANCE" entityId={item.id} attachmentType="BUILDER_RECEIPT" title="Comprovante único do PIX" />
    <p className="text-sm text-gray-600">Remessas confirmadas não podem ser editadas ou excluídas nesta fase.</p>
  </div>;
}
