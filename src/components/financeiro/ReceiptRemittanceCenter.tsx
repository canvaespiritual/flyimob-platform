"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Invoice = { id: string; number: string | null; stageId: string; stageType: string; stageLabel: string | null;
  saleId: string; clientName: string; construtoraId: string; construtora: string; empreendimento: string;
  gross: string; withheld: string; balance: string };
type Account = { id: string; name: string; bankName: string | null };
type Remittance = { id: string; receivedAt: string; construtora: string; count: number; amount: string; status: string };

function cents(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}
function brl(value: string) { return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

export default function ReceiptRemittanceCenter({ invoices, accounts, remittances }: {
  invoices: Invoice[]; accounts: Account[]; remittances: Remittance[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [builder, setBuilder] = useState("");
  const [project, setProject] = useState("");
  const [search, setSearch] = useState("");
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selectedInvoices = invoices.filter((invoice) => selected[invoice.id] !== undefined);
  const selectedBuilder = selectedInvoices[0]?.construtoraId;
  const visible = invoices.filter((invoice) => (!builder || invoice.construtoraId === builder)
    && (!project || invoice.empreendimento === project)
    && (!search || `${invoice.number} ${invoice.clientName} ${invoice.construtora} ${invoice.empreendimento} ${invoice.stageType}`.toLowerCase().includes(search.toLowerCase())));
  const total = useMemo(() => Object.values(selected).reduce<bigint | null>((sum, value) => {
    const valueCents = cents(value);
    return sum === null || valueCents === null ? null : sum + valueCents;
  }, 0n), [selected]);
  const totalString = total === null ? "" : `${total / 100n}.${String(total % 100n).padStart(2, "0")}`;
  const validItems = selectedInvoices.length > 0 && selectedInvoices.every((invoice) => {
    const value = cents(selected[invoice.id]);
    return value !== null && value > 0n && value <= cents(invoice.balance)!;
  });
  const canSubmit = validItems && !!accountId && !!date && cents(amount) !== null && cents(amount) === total && !saving;

  async function confirm() {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/financeiro/remessas-recebimento", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: selectedInvoices.map((invoice) => ({ invoiceId: invoice.id, amount: selected[invoice.id] })),
          financialAccountId: accountId, receivedAt: `${date}T12:00:00.000Z`, amount, reference, notes }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Erro ao confirmar recebimento.");
      router.push(`/admin/financeiro/recebimentos/${result.id}`);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao confirmar recebimento."); setSaving(false); }
  }

  return <div className="space-y-8">
    <section className="rounded-lg border bg-white p-5 space-y-4">
      <div><h2 className="text-lg font-semibold">A receber</h2><p className="text-sm text-gray-600">Selecione NFs da mesma construtora. Vendas cadastradas apenas com nome manual ou com recebimentos antigos sem NF vinculada não aparecem aqui.</p></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <select aria-label="Construtora" className="rounded border p-2" value={builder} onChange={(e) => setBuilder(e.target.value)}><option value="">Todas as construtoras</option>{Array.from(new Map(invoices.map((item) => [item.construtoraId, item.construtora])).entries()).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
        <select aria-label="Empreendimento" className="rounded border p-2" value={project} onChange={(e) => setProject(e.target.value)}><option value="">Todos os empreendimentos</option>{Array.from(new Set(invoices.map((item) => item.empreendimento).filter(Boolean))).sort().map((name) => <option key={name}>{name}</option>)}</select>
        <input aria-label="Buscar NF, cliente ou etapa" className="rounded border p-2" placeholder="Buscar NF, cliente ou etapa" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="max-h-[28rem] overflow-auto divide-y border rounded">{visible.map((invoice) => <label key={invoice.id} className="flex items-start gap-3 p-3 hover:bg-gray-50">
        <input type="checkbox" className="mt-1" checked={selected[invoice.id] !== undefined} disabled={!!selectedBuilder && selectedBuilder !== invoice.construtoraId && selected[invoice.id] === undefined}
          onChange={(e) => setSelected((current) => { const next = { ...current }; if (e.target.checked) next[invoice.id] = invoice.balance; else delete next[invoice.id]; return next; })} />
        <span className="flex-1"><strong>NF {invoice.number ?? "sem número"}</strong> · {invoice.clientName} · {invoice.stageType}{invoice.stageLabel ? ` (${invoice.stageLabel})` : ""}<span className="block text-sm text-gray-600">{invoice.construtora} · {invoice.empreendimento || "Sem empreendimento"} · Bruto {brl(invoice.gross)} · Retenção {brl(invoice.withheld)}</span></span>
        <span className="font-medium whitespace-nowrap">Saldo {brl(invoice.balance)}</span>
      </label>)}{visible.length === 0 && <p className="p-4 text-sm text-gray-500">Nenhuma NF com saldo disponível para os filtros.</p>}</div>
    </section>
    {selectedInvoices.length > 0 && <section className="rounded-lg border bg-white p-5 space-y-4"><h2 className="text-lg font-semibold">Nova remessa · {selectedInvoices[0].construtora}</h2>
      <div className="space-y-2">{selectedInvoices.map((invoice) => <div key={invoice.id} className="flex flex-wrap items-center gap-3 border-b pb-2 text-sm"><span className="flex-1">NF {invoice.number ?? "sem número"} · {invoice.clientName} · {invoice.stageType} · saldo {brl(invoice.balance)}</span><input aria-label={`Parcela da NF ${invoice.number ?? invoice.id}`} type="number" min="0.01" max={invoice.balance} step="0.01" className="w-36 rounded border p-2" value={selected[invoice.id]} onChange={(e) => setSelected((current) => ({ ...current, [invoice.id]: e.target.value }))} /></div>)}</div>
      <p className="font-medium">Soma das parcelas: {totalString ? brl(totalString) : "Valor inválido"}</p>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Conta de destino<select className="mt-1 block w-full rounded border p-2" value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">Selecione</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.bankName ? ` · ${account.bankName}` : ""}</option>)}</select></label>
        <label className="text-sm">Data recebida<input type="date" className="mt-1 block w-full rounded border p-2" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="text-sm">Valor efetivamente recebido<input type="number" min="0.01" step="0.01" className="mt-1 block w-full rounded border p-2" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={totalString} /></label>
        <label className="text-sm">Referência<input className="mt-1 block w-full rounded border p-2" value={reference} onChange={(e) => setReference(e.target.value)} /></label></div>
      <label className="block text-sm">Observações<textarea className="mt-1 block w-full rounded border p-2" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <button className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50" disabled={!canSubmit} onClick={confirm}>{saving ? "Confirmando..." : "Confirmar recebimento"}</button>
      <p className="text-xs text-gray-600">O comprovante único será anexado na página da remessa após a confirmação.</p>
    </section>}
    <section className="rounded-lg border bg-white p-5 space-y-3"><h2 className="text-lg font-semibold">Remessas recebidas</h2>{remittances.map((item) => <Link key={item.id} href={`/admin/financeiro/recebimentos/${item.id}`} className="flex flex-wrap justify-between gap-2 rounded border p-3 hover:bg-gray-50"><span>{new Date(item.receivedAt).toLocaleDateString("pt-BR", { timeZone: "UTC" })} · {item.construtora} · {item.count} operações</span><span>{brl(item.amount)} · {item.status === "CONFIRMED" ? "Confirmada" : item.status}</span></Link>)}{remittances.length === 0 && <p className="text-sm text-gray-500">Nenhuma remessa cadastrada.</p>}</section>
  </div>;
}
