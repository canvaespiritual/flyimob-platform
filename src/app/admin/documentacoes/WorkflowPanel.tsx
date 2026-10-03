"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { workflowView, WorkflowAction } from "@/lib/documentacoes/workflow.server";
type Data = Awaited<ReturnType<typeof workflowView>>;
const box = "rounded-xl border bg-white p-4 space-y-3";
const control = "w-full rounded border p-2 text-sm";
const button = "rounded border px-3 py-2 text-sm disabled:opacity-50";
const label = (value: string) => ({ AGUARDANDO_CORRESPONDENTE: "Aguardando primeira análise", EM_REANALISE: "Aguardando reanálise", EM_ANALISE: "Em análise", PENDENCIA_DOCUMENTAL: "Pendências" }[value] ?? value.toLowerCase().replaceAll("_", " "));
const date = (value: Date | string | null | undefined) => value ? new Date(String(value)).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
export default function WorkflowPanel({ folderId, onChange }: { folderId: string; onChange?: () => void }) {
  const [data, setData] = useState<Data>(); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1); const [issuePage, setIssuePage] = useState(1); const [roundId, setRoundId] = useState("");
  const [observation, setObservation] = useState(""); const draftRound = useRef<string | undefined>(undefined);
  const [editing, setEditing] = useState<Data["issues"][number] | null>(null);
  const base = `/api/documentacoes/pastas/${folderId}/workflow`;
  const load = useCallback(async () => {
    const response = await fetch(`${base}?page=${page}&issuePage=${issuePage}&roundId=${roundId}`, { cache: "no-store" }); const value = await response.json();
    if (!response.ok) throw new Error(value.error ?? "Não foi possível carregar o workflow.");
    const next = value as Data; setData(next);
    if (draftRound.current !== next.latest?.id) { draftRound.current = next.latest?.id; setObservation(next.note); }
  }, [base, page, issuePage, roundId]);
  useEffect(() => { const timer = setTimeout(() => { void load().catch(error => setMessage(error.message)); }, 0); return () => clearTimeout(timer); }, [load]);
  async function mutate(action: WorkflowAction, values: Record<string, unknown> = {}) {
    if (!data) return; setBusy(true); setMessage("");
    try {
      const response = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, version: data.folder.version, roundId: data.latest?.id, ...values }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Não foi possível concluir a ação.");
      if (action === "submit") { setRoundId(""); setIssuePage(1); }
      setEditing(null); await load(); onChange?.(); setMessage("Operação concluída.");
    } catch (error) { setMessage((error as Error).message); await load().catch(() => undefined); }
    finally { setBusy(false); }
  }
  function issueSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void mutate(editing ? "editIssue" : "issue", { ...Object.fromEntries(new FormData(event.currentTarget)), ...(editing ? { issueId: editing.id } : {}) }); }
  if (!data) return <p role="status">{message || "Carregando análise…"}</p>;
  const current = data.selectedId === data.latest?.id;
  return <section className="space-y-4" aria-label="Workflow documental">
    <div className={box}><h2 className="font-semibold">Análise documental · {label(data.folder.status)}</h2><p>Rodada atual: {data.latest?.sequence ?? "Ainda não enviada"} · Total: {data.total} · Pendências abertas: {data.openIssues}</p><p>Responsável: {data.folder.broker.name}</p>
      <div className="flex flex-wrap gap-2">{data.canSubmit && <button disabled={busy || data.openIssues > 0} className={button} onClick={() => { if (window.confirm(data.latest ? "Reenviar esta pasta e criar nova rodada?" : "Enviar esta pasta para análise?")) void mutate("submit"); }}>{data.latest ? "Reenviar para análise" : "Enviar para análise"}</button>}{data.canStart && <button disabled={busy} className={button} onClick={() => void mutate("start")}>Iniciar análise</button>}<button disabled={busy} className={button} onClick={() => void load().catch(error => setMessage(error.message))}>Atualizar análise</button></div>
      {message && <p role="status" className="rounded bg-amber-50 p-3 text-sm">{message}</p>}
      <p className="text-sm text-gray-600">Documentos ficam bloqueados durante espera, análise e após conclusão. Correções são permitidas enquanto houver pendências; resolva todas antes de reenviar.</p>
    </div>
    {data.canAnalyze && <div className={box}><label className="block">Parecer / condições / motivo<textarea value={observation} maxLength={10000} className={control} rows={4} onChange={event => setObservation(event.target.value)} /></label><div className="flex flex-wrap gap-2"><button disabled={busy || !observation.trim()} className={button} onClick={() => void mutate("note", { observation })}>Salvar parecer</button>{[["PENDENCIA_DOCUMENTAL", "Solicitar correções"], ["APROVADO", "Aprovar"], ["CONDICIONADO", "Aprovar condicionado"], ["REPROVADO", "Reprovar"]].map(([result, title]) => <button key={result} disabled={busy} className={button} onClick={() => { if (window.confirm(`Concluir esta rodada: ${title}?`)) void mutate("finish", { result, observation }); }}>{title}</button>)}</div></div>}
    {data.canAnalyze && <form key={editing?.id ?? `new-${data.folder.version}`} className={box} onSubmit={issueSubmit}><h3 className="font-semibold">{editing ? "Revisar pendência" : "Criar pendência"}</h3><label className="block">Descrição<textarea name="message" className={control} required maxLength={3000} defaultValue={editing?.message ?? ""} /></label><div className="grid gap-3 sm:grid-cols-3">
      <label>Pessoa<select name="personId" className={control} defaultValue={editing?.personId ?? ""}><option value="">Geral da pasta</option>{data.folder.people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      <label>Tipo documental<select name="documentTypeId" className={control} defaultValue={editing?.documentTypeId ?? ""}><option value="">Sem tipo específico</option>{data.types.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
      <label>Documento<select name="documentId" className={control} defaultValue={editing?.documentId ?? ""}><option value="">Sem documento específico</option>{data.documents.map(document => <option key={document.id} value={document.id}>{document.originalFileName}</option>)}</select></label>
    </div><p className="text-sm">Se vincular pessoa/tipo e documento, as referências precisam corresponder. A lista mostra os 100 documentos ativos mais recentes.</p><button disabled={busy} className={button}>Salvar pendência</button>{editing && <button type="button" className={button} onClick={() => setEditing(null)}>Cancelar edição</button>}</form>}
    <div className={box}><h3 className="font-semibold">Rodadas e histórico</h3>{data.rounds.map(round => <article key={round.id} className="border-b pb-3 text-sm"><button className="underline font-semibold" onClick={() => { setRoundId(round.id); setIssuePage(1); setEditing(null); }}>Rodada {round.sequence} · {round.analysis ? label(round.analysis.result) : "Em andamento"}</button><p>Enviada: {date(round.sentAt)} · Correspondente: {round.correspondent.name}</p>{round.events.map((event, index) => <p key={index}>{event.eventType === "DOCUMENT_REVIEW_STARTED" ? "Iniciada" : "Enviada"} por {event.actor?.name ?? "Sistema"} · {date(event.createdAt)}</p>)}<p>Concluída: {date(round.closedAt)} · {round._count.documents} documentos no snapshot · {round._count.pendingItems} pendências registradas</p>{round.analysis?.observation && <p className="whitespace-pre-wrap">Parecer: {round.analysis.observation}</p>}</article>)}{!data.total && <p>Nenhuma rodada criada.</p>}<div className="flex gap-3"><button className={button} disabled={page === 1 || busy} onClick={() => setPage(page - 1)}>Rodadas anteriores</button><span>Página {page}</span><button className={button} disabled={page * 10 >= data.total || busy} onClick={() => setPage(page + 1)}>Mais rodadas</button><button className={button} onClick={() => { setRoundId(""); setIssuePage(1); }}>Rodada atual</button></div></div>
    {data.selectedId && <div className={box}><h3 className="font-semibold">Pendências da rodada {current ? "atual" : "selecionada"}</h3>{data.issues.map(issue => <article key={issue.id} className="space-y-1 border-b py-3 text-sm"><strong>{issue.status === "OPEN" ? "Aberta" : issue.status === "RESOLVED" ? "Resolvida" : "Cancelada"}</strong><p className="whitespace-pre-wrap">{issue.message}</p><p>{issue.person?.name ?? "Geral da pasta"} · {issue.documentType?.name ?? "Sem tipo"} · {issue.document?.originalFileName ?? "Sem documento"}</p><p>{issue.createdBy.name} · {date(issue.createdAt)}{issue.resolvedAt && ` · Resolvida por ${issue.resolvedBy?.name ?? "—"} em ${date(issue.resolvedAt)}`}</p>{current && issue.status === "OPEN" && <div className="flex gap-2">{data.canResolve && <button disabled={busy} className={button} onClick={() => void mutate("resolve", { issueId: issue.id })}>Marcar como resolvida</button>}{data.canAnalyze && <><button disabled={busy} className={button} onClick={() => setEditing(issue)}>Revisar</button><button disabled={busy} className={button} onClick={() => { if (window.confirm("Cancelar esta pendência preservando o histórico?")) void mutate("cancelIssue", { issueId: issue.id }); }}>Cancelar pendência</button></>}</div>}</article>)}{!data.issues.length && <p>Nenhuma pendência nesta página.</p>}<div className="flex gap-3"><button className={button} disabled={issuePage === 1 || busy} onClick={() => setIssuePage(issuePage - 1)}>Pendências anteriores</button><span>Página {issuePage}</span><button className={button} disabled={issuePage * 20 >= data.issueTotal || busy} onClick={() => setIssuePage(issuePage + 1)}>Mais pendências</button></div></div>}
  </section>;
}
