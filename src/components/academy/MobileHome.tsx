"use client";

import { useEffect, useState } from "react";
import type { MobileOverview } from "@/lib/academy/mobile.server";
import { duration } from "@/lib/academy/push-policy";
import PwaControls from "./PwaControls";

const money = (value: string | number, currency: string | null) => currency
  ? new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(Number(value))
  : `${value} (moeda não informada)`;

export default function MobileHome() {
  const [data, setData] = useState<MobileOverview | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController;
    async function refresh() {
      controller = new AbortController();
      try {
        const response = await fetch("/api/admin/academy/mobile", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 401 ? "Sessão expirada. Entre novamente." : "Não foi possível atualizar os dados.");
        const result = await response.json() as MobileOverview;
        if (!disposed) { setData(result); setError(""); }
      } catch (failure) {
        if (!disposed) setError(failure instanceof Error ? failure.message : "Falha de conexão.");
      } finally { if (!disposed) timer = setTimeout(() => void refresh(), 20_000); }
    }
    void refresh();
    return () => { disposed = true; clearTimeout(timer); controller?.abort(); };
  }, []);

  const cards = data ? [
    ["Visitantes", data.metrics.visitors], ["Iniciaram VSL", data.metrics.started],
    ["Chegaram ao pitch", data.metrics.pitch], ["Checkouts", data.metrics.checkouts],
    ["Vendas", data.metrics.sales],
    ["Receita bruta", Object.entries(data.metrics.revenue).map(([currency, value]) => money(value, currency)).join(" · ") || "Sem receita informada"],
  ] : [];

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 pb-12">
      <header><p className="text-xs font-semibold uppercase tracking-widest text-orange-400">Corretor Academy</p><h1 className="mt-1 text-2xl font-bold">Hoje</h1><p className="mt-2 text-xs text-slate-400">America/Sao_Paulo · atualização a cada 20 segundos</p></header>
      <PwaControls />
      {error && <p role="alert" className="rounded-xl border border-amber-600 p-3 text-sm text-amber-200">{error} {data && "Os números abaixo são da última atualização."}</p>}
      {!data && !error && <p role="status">Carregando o funil…</p>}
      <section className="grid grid-cols-2 gap-3" aria-label="Resumo de hoje">
        {cards.map(([label, value]) => <article key={label} className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-400">{label}</p><p className="mt-2 break-words text-2xl font-bold">{value}</p></article>)}
      </section>
      {data && <p className="text-xs leading-5 text-slate-500">VSL iniciada: reprodução registrada ou trecho observado. Player carregado: {data.metrics.ready}. Visitantes/VSL/pitch consideram sessões iniciadas hoje; checkouts e vendas consideram o dia do evento. Receita considera vendas aprovadas/completas.</p>}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Atividade recente</h2>
        {data?.feed.length === 0 && <p className="rounded-xl border border-slate-800 p-5 text-sm text-slate-400">Nenhum checkout ou venda encontrado.</p>}
        {data?.feed.map((entry) => (
          <article key={`${entry.kind}:${entry.id}`} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="flex items-start justify-between gap-3"><span className="text-xs font-semibold text-orange-300">{entry.kind === "checkout" ? "Checkout" : "Venda"}</span><time className="text-xs text-slate-400">{new Date(entry.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</time></div>
            <h3 className="mt-2 break-words font-semibold">{entry.name}</h3>
            <p className="mt-1 text-sm text-emerald-300">{entry.status}{entry.amount !== null && ` · ${money(entry.amount, entry.currency)}`}</p>
            {entry.phone && <p className="mt-2 text-sm"><a href={`https://wa.me/${entry.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="text-teal-300">{entry.phone}</a></p>}
            {entry.email && <p className="break-all text-sm text-slate-300">{entry.email}</p>}
            {entry.session && <div className="mt-3 space-y-1 border-t border-slate-800 pt-3 text-xs text-slate-400"><p className="break-words">{[entry.session.source || entry.session.utmSource, entry.session.utmCampaign || entry.session.campaignId, entry.session.adId || entry.session.utmContent].filter(Boolean).join(" • ") || "Origem não identificada"}</p><p>Assistido: {duration(entry.session.watchedSeconds)} · Tempo único: {duration(entry.session.uniqueWatchedSeconds)}</p></div>}
          </article>
        ))}
      </section>
    </main>
  );
}
