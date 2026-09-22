"use client";

import Link from "next/link";
import FinancialAttachmentsManager from "./FinancialAttachmentsManager";
import TaxCard from "./TaxCard";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Stage = { id: string; saleId: string; clientName: string; construtoraId: string; construtora: string;
  empreendimento: string; type: string; label: string | null; balance: string };
type Invoice = { id: string; number: string | null; gross: string; status: string; issuedAt: string | null;
  grouped: boolean; construtora: string; composition: Array<{ stageId: string; saleId: string; clientName: string; label: string; amount: string }>;
  taxes: Array<{ id: string; invoiceId: string; name: string; kind: string; rate: number | null; amount: number | null; status: string }> };
const brl = (value: string) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
function cents(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

export default function GroupedInvoicingCenter({ stages, invoices }: { stages: Stage[]; invoices: Invoice[] }) {
  const router = useRouter();
  useEffect(() => {
    const target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    if (target instanceof HTMLDetailsElement) target.open = true;
  }, []);
  const [builder, setBuilder] = useState("");
  const [project, setProject] = useState("");
  const [client, setClient] = useState("");
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [number, setNumber] = useState("");
  const [issuedAt, setIssuedAt] = useState(new Date().toISOString().slice(0, 10));
  const [competence, setCompetence] = useState(new Date().toISOString().slice(0, 7));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const chosen = stages.filter((item) => selected[item.id] !== undefined);
  const chosenBuilder = chosen[0]?.construtoraId;
  const visible = stages.filter((item) => (!builder || item.construtoraId === builder)
    && (!project || item.empreendimento === project) && (!client || item.clientName === client)
    && (!type || item.type === type)
    && (!search || `${item.clientName} ${item.construtora} ${item.empreendimento} ${item.type} ${item.label ?? ""}`.toLowerCase().includes(search.toLowerCase())));
  const total = useMemo(() => Object.values(selected).reduce<bigint | null>((sum, value) => {
    const amount = cents(value);
    return sum === null || amount === null ? null : sum + amount;
  }, 0n), [selected]);
  const totalString = total === null ? "" : `${total / 100n}.${String(total % 100n).padStart(2, "0")}`;
  const valid = chosen.length > 0 && chosen.every((item) => {
    const value = cents(selected[item.id]);
    return value !== null && value > 0n && value <= cents(item.balance)!;
  });
  async function save() {
    setSaving(true); setError("");
    try {
      const [year, month] = competence.split("-").map(Number);
      const response = await fetch("/api/financeiro/faturamento", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ construtoraId: chosenBuilder, number, issuedAt: `${issuedAt}T12:00:00.000Z`,
          competenceYear: year, competenceMonth: month, grossAmount: totalString, notes,
          allocations: chosen.map((item) => ({ stageId: item.id, amount: selected[item.id] })) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Erro ao criar NF.");
      setSelected({}); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao criar NF."); }
    finally { setSaving(false); }
  }
  return <div className="space-y-8">
    <section className="space-y-4 rounded-lg border bg-white p-5"><h2 className="text-lg font-semibold">A faturar</h2>
      <div className="grid gap-2 md:grid-cols-5">
        <select aria-label="Construtora" className="rounded border p-2" value={builder} onChange={(event) => setBuilder(event.target.value)}><option value="">Todas as construtoras</option>{Array.from(new Map(stages.map((item) => [item.construtoraId, item.construtora])).entries()).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
        <select aria-label="Empreendimento" className="rounded border p-2" value={project} onChange={(event) => setProject(event.target.value)}><option value="">Todos os empreendimentos</option>{Array.from(new Set(stages.map((item) => item.empreendimento).filter(Boolean))).sort().map((name) => <option key={name}>{name}</option>)}</select>
        <select aria-label="Cliente" className="rounded border p-2" value={client} onChange={(event) => setClient(event.target.value)}><option value="">Todos os clientes</option>{Array.from(new Set(stages.map((item) => item.clientName))).sort().map((name) => <option key={name}>{name}</option>)}</select>
        <select aria-label="Tipo" className="rounded border p-2" value={type} onChange={(event) => setType(event.target.value)}><option value="">Todos os tipos</option>{Array.from(new Set(stages.map((item) => item.type))).sort().map((name) => <option key={name}>{name}</option>)}</select>
        <input aria-label="Buscar" className="rounded border p-2" placeholder="Buscar" value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
      <div className="max-h-96 divide-y overflow-auto rounded border">{visible.map((item) => <label key={item.id} className="flex items-center gap-3 p-3 text-sm hover:bg-gray-50">
        <input type="checkbox" checked={selected[item.id] !== undefined} disabled={!!chosenBuilder && chosenBuilder !== item.construtoraId && selected[item.id] === undefined}
          onChange={(event) => setSelected((current) => { const next = { ...current }; if (event.target.checked) next[item.id] = item.balance; else delete next[item.id]; return next; })} />
        <span className="flex-1">{item.clientName} · {item.type}{item.label ? ` (${item.label})` : ""}<span className="block text-gray-500">{item.construtora} · {item.empreendimento || "Sem empreendimento"}</span></span>
        <span>Saldo {brl(item.balance)}</span>
      </label>)}{visible.length === 0 && <p className="p-4 text-sm text-gray-500">Nenhuma etapa com saldo faturável.</p>}</div>
    </section>
    {chosen.length > 0 && <section className="space-y-4 rounded-lg border bg-white p-5"><h2 className="text-lg font-semibold">Nova NF agrupada · {chosen[0].construtora}</h2>
      {chosen.map((item) => <label key={item.id} className="flex items-center gap-3 border-b pb-2 text-sm"><span className="flex-1">{item.clientName} · {item.type} · saldo {brl(item.balance)}</span>
        <input aria-label={`Valor alocado para ${item.clientName} ${item.type}`} type="number" min="0.01" max={item.balance} step="0.01" className="w-36 rounded border p-2" value={selected[item.id]} onChange={(event) => setSelected((current) => ({ ...current, [item.id]: event.target.value }))} /></label>)}
      <p className="font-medium">Bruto da NF: {totalString ? brl(totalString) : "Valor inválido"}</p>
      <div className="grid gap-3 md:grid-cols-3"><label className="text-sm">Número da NF<input className="mt-1 block w-full rounded border p-2" value={number} onChange={(event) => setNumber(event.target.value)} /></label>
        <label className="text-sm">Emissão<input type="date" className="mt-1 block w-full rounded border p-2" value={issuedAt} onChange={(event) => setIssuedAt(event.target.value)} /></label>
        <label className="text-sm">Competência<input type="month" className="mt-1 block w-full rounded border p-2" value={competence} onChange={(event) => setCompetence(event.target.value)} /></label></div>
      <label className="block text-sm">Observações<textarea className="mt-1 block w-full rounded border p-2" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <button className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50" disabled={!valid || !number.trim() || !issuedAt || !competence || saving} onClick={save}>{saving ? "Salvando..." : "Criar NF agrupada"}</button>
      <p className="text-xs text-gray-500">O documento único da NF pode ser anexado na seção de documentos da nota.</p>
    </section>}
    <section className="space-y-3 rounded-lg border bg-white p-5"><h2 className="text-lg font-semibold">Notas emitidas</h2>
      {invoices.map((invoice) => <details id={`nf-${invoice.id}`} key={invoice.id} className="rounded border p-3 text-sm"><summary className="cursor-pointer font-medium">NF {invoice.number ?? "sem número"} · {invoice.grouped ? "Agrupada" : "Individual"} · {brl(invoice.gross)} · {invoice.status}</summary>
        <div className="mt-2 space-y-1">{invoice.composition.map((item) => <p key={item.stageId}>{item.clientName} · {item.label} · {brl(item.amount)}</p>)}
          {invoice.composition.map((item) => <Link key={`sale-${item.stageId}`} className="mr-3 text-blue-700 underline" href={`/admin/financeiro/vendas/${item.saleId}`}>Ver etapa</Link>)}
          {invoice.grouped && <FinancialAttachmentsManager entityType="INVOICE" entityId={invoice.id} attachmentType="INVOICE" title="Documento único da NF" compact />}
          {invoice.grouped && <TaxCard invoices={[{ id: invoice.id, label: `NF ${invoice.number ?? "sem número"}`, grossAmount: Number(invoice.gross) }]} taxes={invoice.taxes} />}
        </div>
      </details>)}{invoices.length === 0 && <p className="text-sm text-gray-500">Nenhuma NF cadastrada.</p>}</section>
  </div>;
}
