"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import DocumentsPanel from "@/app/admin/documentacoes/DocumentsPanel";
import WorkflowPanel from "@/app/admin/documentacoes/WorkflowPanel";
import { correspondentStatus, documentationDate, documentationEventLabels } from "@/lib/documentacoes/correspondent-presentation";

type Folder = { id: string; status: string; broker: { name: string }; rounds: { id: string }[]; people: { id: string; name: string; relationship: string; cpfDisplay: string }[] };
type Detail = { folder: Folder; events: { id: string; eventType: string; createdAt: string; actor: { name: string } | null }[]; eventCount: number; page: number };
export default function FolderDocuments({ id }: { id: string }) {
  const search = useSearchParams();
  const [data, setData] = useState<Detail>(); const [error, setError] = useState("");
  const [revision, setRevision] = useState(0); const [historyPage, setHistoryPage] = useState(1);
  const [tab, setTab] = useState(search.get("tab") === "pendencias" ? "pendencias" : search.get("tab") === "historico" ? "historico" : "documentos");
  const [correction, setCorrection] = useState<{ id: string; personId: string | null; documentTypeId: string | null }>();
  useEffect(() => {
    let live = true;
    fetch(`/api/documentacoes/correspondente/pastas/${id}?page=${historyPage}`, { cache: "no-store" }).then(async response => { const value = await response.json(); if (!response.ok) throw new Error(value.error ?? "Não foi possível abrir os documentos."); if (live) { setData(value); setError(""); } }).catch(error => { if (live) setError(error.message); });
    return () => { live = false; };
  }, [id, revision, historyPage]);
  const folder = data?.folder; const holder = folder?.people.find(person => person.relationship === "TITULAR"); const status = correspondentStatus(folder?.status ?? "");
  const refresh = () => setRevision(value => value + 1);
  return <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
    <Link className="inline-flex text-sm font-medium text-blue-700 hover:underline" href="/correspondente">← Voltar para clientes</Link>
    {error && <p role="alert" className="rounded-lg border bg-amber-50 p-3 text-sm">{error}</p>}
    {folder ? <>
      <header className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="break-words text-2xl font-bold">{holder?.name ?? "Cliente"}</h1><span className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${status.tone}`}>{status.title}</span></div><p className="mt-3 text-sm text-slate-600">CPF: {holder?.cpfDisplay ?? "Não informado"} · Responsável comercial: {folder.broker?.name ?? "Responsável legado"}</p></header>
      <nav className="flex gap-2 rounded-xl border border-slate-200 bg-white p-2" aria-label="Área do cliente" role="tablist">{[["documentos", "Documentos"], ["pendencias", "Análise e pendências"], ["historico", "Histórico"]].map(([key, title]) => <button key={key} role="tab" aria-selected={tab === key} aria-controls={"cliente-" + key} className={`flex-1 rounded-lg px-2 py-3 text-sm font-semibold ${tab === key ? "bg-blue-700 text-white" : "text-slate-600 hover:bg-slate-50"}`} onClick={() => setTab(key)}>{title}</button>)}</nav>
      <div id="cliente-documentos" role="tabpanel" hidden={tab !== "documentos"} className="space-y-6">
        <DocumentsPanel folderId={id} group="analysis" roundId={folder.rounds[0]?.id} revision={revision} onCorrection={folder.status === "EM_ANALISE" ? file => { setCorrection(file); setTab("pendencias"); requestAnimationFrame(() => document.getElementById(`correction-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })); } : undefined} />
        <DocumentsPanel folderId={id} group="correspondent" revision={revision} onChange={refresh} />
      </div>
      <div id="cliente-pendencias" role="tabpanel" hidden={tab !== "pendencias"}><WorkflowPanel folderId={id} correspondent correction={correction} revision={revision} onChange={() => { setCorrection(undefined); refresh(); }} /></div>
      <div id="cliente-historico" role="tabpanel" hidden={tab !== "historico"} className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-bold">O que aconteceu com a documentação</h2><ol className="mt-4 space-y-4">{data?.events.map(event => <li key={event.id} className="border-l-2 border-blue-100 pl-4"><time className="text-xs text-slate-500">{documentationDate(event.createdAt)}</time><p className="mt-1 text-sm font-semibold">{documentationEventLabels[event.eventType] ?? "Documentação atualizada"}</p><p className="text-sm text-slate-600">Por {event.actor?.name ?? "Sistema"}</p></li>)}</ol>{!data?.events.length && <p className="mt-3 text-sm text-slate-500">O histórico das ações aparecerá aqui.</p>}<div className="mt-5 flex flex-wrap items-center gap-3 text-sm"><button className="rounded-lg border px-3 py-2 disabled:opacity-40" disabled={historyPage <= 1} onClick={() => setHistoryPage(historyPage - 1)}>Mais recentes</button><span>Página {historyPage}</span><button className="rounded-lg border px-3 py-2 disabled:opacity-40" disabled={historyPage * 20 >= (data?.eventCount ?? 0)} onClick={() => setHistoryPage(historyPage + 1)}>Mais antigos</button></div></section>
        <WorkflowPanel folderId={id} correspondent view="history" revision={revision} />
      </div>
    </> : !error && <p role="status">Carregando cliente…</p>}
  </main>;
}
