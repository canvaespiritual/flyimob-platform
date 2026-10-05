"use client";
import { useEffect, useState, type FormEvent } from "react";

type Rule = { id: string; percentage: string; validFrom: string };
type Review = { reviewToken: string; percentage: string; oldStart: string; newStart: string; affectedFrom: string; affectedTo: string; reason: string };
type History = { items: { id: string; createdAt: string; actor: { id: string; name: string }; metadata: { percentage: string; before: { validFrom: string }; after: { validFrom: string; reason: string } } }[]; total: number; page: number };
const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm read-only:bg-slate-50";
const button = "rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50";
const date = (value: string) => new Date(value).toLocaleDateString("pt-BR", { timeZone: "UTC" });
async function request<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, { method, cache: "no-store", headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Não foi possível concluir a correção.");
  return result;
}
export default function CostValidityCorrection({ rule, onSaved, onCancel }: { rule: Rule; onSaved: () => void; onCancel: () => void }) {
  const [review, setReview] = useState<Review>(); const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [start, setStart] = useState(rule.validFrom.slice(0, 10)); const [reason, setReason] = useState("");
  const [showHistory, setShowHistory] = useState(false); const [page, setPage] = useState(1); const [history, setHistory] = useState<History>();
  const url = `/api/marketing/settings/cost-rules/${rule.id}/validity`;
  useEffect(() => {
    if (!showHistory) return;
    let live = true;
    request<History>(`${url}?page=${page}`).then(data => { if (live) setHistory(data); }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [showHistory, page, url]);
  async function revise(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { setReview(await request<Review>(url, "POST", { validFrom: start, reason })); setConfirmed(false); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível revisar."); }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!confirmed || !review) return;
    setBusy(true); setError("");
    try { await request(url, "PATCH", { reviewToken: review.reviewToken, confirmed: true }); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  }
  const affectedEnd = review ? new Date(new Date(review.affectedTo).getTime() - 86400000).toISOString() : "";
  return <div className="space-y-4 rounded-lg border border-amber-200 bg-amber-50/40 p-4">
    <h4 className="font-semibold">Corrigir vigência</h4>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {!review ? <form onSubmit={revise} className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-1 text-sm">Percentual<input className={input} value={`${rule.percentage.replace(".", ",")}%`} readOnly /></label>
      <label className="space-y-1 text-sm">Início atual<input className={input} type="date" value={rule.validFrom.slice(0, 10)} readOnly /></label>
      <label className="space-y-1 text-sm">Novo início *<input className={input} type="date" required value={start} onChange={e => setStart(e.target.value)} /></label>
      <label className="space-y-1 text-sm">Motivo da correção *<textarea className={input} required maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <div className="flex gap-2 sm:col-span-2"><button className={button} disabled={busy}>Revisar correção</button><button type="button" className={button} disabled={busy} onClick={onCancel}>Cancelar</button></div>
    </form> : <form onSubmit={save} className="space-y-3 text-sm">
      <p>Percentual: <strong>{review.percentage.replace(".", ",")}%</strong> · Início atual: {date(review.oldStart)} · Novo início: <strong>{date(review.newStart)}</strong></p>
      <p className="rounded-lg border border-amber-300 bg-amber-50 p-3">Esta correção alterará o cálculo do gasto efetivo entre <strong>{date(review.affectedFrom)}</strong> e <strong>{date(affectedEnd)}</strong>. Os valores originais da Meta não serão alterados.</p>
      <p className="whitespace-pre-wrap">Motivo: {review.reason}</p>
      <label className="flex items-start gap-2"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Confirmo a correção da vigência e seu impacto nos relatórios históricos.</label>
      <div className="flex gap-2"><button className={`${button} bg-teal-700 text-white`} disabled={busy || !confirmed}>Confirmar correção</button><button type="button" className={button} disabled={busy} onClick={() => { setReview(undefined); setConfirmed(false); setError(""); }}>Voltar à revisão</button><button type="button" className={button} disabled={busy} onClick={onCancel}>Cancelar</button></div>
    </form>}
    <details onToggle={e => setShowHistory(e.currentTarget.open)} className="text-sm"><summary className="cursor-pointer">Histórico de correções</summary>
      {showHistory && (history ? <div className="mt-3 space-y-3">{history.items.map(item => <div key={item.id} className="rounded border bg-white p-3"><p>{date(item.metadata.before.validFrom)} → {date(item.metadata.after.validFrom)} · {item.metadata.percentage.replace(".", ",")}%</p><p>{item.actor.name} · {new Date(item.createdAt).toLocaleString("pt-BR")}</p><p className="whitespace-pre-wrap">{item.metadata.after.reason}</p></div>)}{!history.total && <p>Nenhuma correção registrada.</p>}<div className="flex gap-2"><button className={button} disabled={page <= 1} onClick={() => { setHistory(undefined); setPage(p => p - 1); }}>Anterior</button><span>Página {page} · {history.total} correções</span><button className={button} disabled={page * 20 >= history.total} onClick={() => { setHistory(undefined); setPage(p => p + 1); }}>Próxima</button></div></div> : <p className="mt-2">Carregando histórico…</p>)}
    </details>
  </div>;
}
