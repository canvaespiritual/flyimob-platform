"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { documentationDate, correspondentStatus } from "@/lib/documentacoes/correspondent-presentation";

type Item = { id: string; title: string; eventType: string; correspondent: string; client: string; createdAt: string; readAt: string | null; href: string };
type Feed = { items: Item[]; unreadCount: number; total: number; page: number };
const endpoint = "/api/documentacoes/notificacoes";
const tones: Record<string, string> = { DOCUMENT_REVIEW_APPROVED: "APROVADO", DOCUMENT_REVIEW_REJECTED: "REPROVADO", DOCUMENT_REVIEW_CONDITIONED: "CONDICIONADO", DOCUMENT_REVIEW_CHANGES_REQUESTED: "PENDENCIA_DOCUMENTAL" };

export default function DocumentationNotifications() {
  const pathname = usePathname();
  const eligible = ["/admin", "/documentacoes", "/academy-admin", "/corretor-academy"].some(prefix => pathname === prefix || pathname.startsWith(prefix + "/"));
  const [open, setOpen] = useState(false); const [count, setCount] = useState(0);
  const [feed, setFeed] = useState<Feed>(); const [filter, setFilter] = useState("unread"); const [page, setPage] = useState(1);
  const [enabled, setEnabled] = useState(false); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Item>(); const seen = useRef(new Set<string>()); const watermark = useRef(0);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(endpoint, { cache: "no-store", signal });
      if ([401, 403].includes(response.status)) { setEnabled(false); setOpen(false); setToast(undefined); return; }
      setEnabled(true);
      if (!response.ok) throw new Error("Não foi possível atualizar as notificações. Tente novamente.");
      const summary: Feed = await response.json(); setCount(summary.unreadCount);
      const newest = summary.items.find(item => !seen.current.has(item.id) && new Date(item.createdAt).getTime() >= watermark.current);
      if (newest) setToast(newest);
      else setToast(current => current && summary.items.some(item => item.id === current.id) ? current : undefined);
      for (const item of summary.items) seen.current.add(item.id);
      watermark.current = Math.max(watermark.current, ...summary.items.map(item => new Date(item.createdAt).getTime()));
      if (filter === "unread" && page === 1) setFeed(summary);
      else {
        const detail = await fetch(`${endpoint}?filter=${filter}&page=${page}`, { cache: "no-store", signal });
        if (!detail.ok) throw new Error("Não foi possível carregar as notificações.");
        setFeed(await detail.json());
      }
      setError("");
    } catch (cause) { if (!signal?.aborted) setError((cause as Error).message); }
  }, [filter, page]);
  useEffect(() => {
    if (!eligible) return;
    const controller = new AbortController();
    const update = () => { if (document.visibilityState !== "hidden") void refresh(controller.signal); };
    update(); const timer = window.setInterval(update, 20000);
    window.addEventListener("focus", update); document.addEventListener("visibilitychange", update);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); };
  }, [eligible, refresh]);
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [open]);
  async function markRead(item: Item) {
    setBusy(true);
    try {
      const result = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: item.id }) });
      if (!result.ok) throw new Error("Não foi possível marcar como lida.");
      if (toast?.id === item.id) setToast(undefined);
      await refresh();
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }
  if (!eligible || !enabled) return null;
  return <aside aria-label="Notificações documentais" className="fixed bottom-5 right-4 z-[90] max-w-[calc(100vw-2rem)] text-sm">
    {toast && !open && <div role="status" className="mb-3 w-80 max-w-full rounded-xl border border-blue-200 bg-white p-4 shadow-xl"><div className="flex items-start justify-between gap-3"><strong>Resposta do correspondente</strong><button aria-label="Dispensar aviso sem marcar como lido" onClick={() => setToast(undefined)}>✕</button></div><p className="mt-2">{toast.correspondent} · {toast.client}</p><p className="mt-1 font-semibold">{toast.title}</p><div className="mt-3 flex gap-3"><Link className="underline" href={toast.href}>Ver pasta</Link><button disabled={busy} className="underline" onClick={() => void markRead(toast)}>Marcar como lida</button></div></div>}
    {open && <section aria-label="Respostas do correspondente" className="mb-3 flex max-h-[70vh] w-96 max-w-full flex-col rounded-2xl border bg-white shadow-2xl"><header className="flex items-start justify-between border-b p-4"><div><h2 className="font-bold">Respostas do correspondente</h2><p className="mt-1 text-xs text-slate-600">A leitura só muda ao marcar como lida.</p></div><button aria-label="Fechar notificações" onClick={() => setOpen(false)}>✕</button></header><div className="flex gap-2 border-b p-3">{[["unread", "Não lidas"], ["all", "Todas"]].map(([value, title]) => <button key={value} aria-pressed={filter === value} className={`rounded-lg border px-3 py-2 ${filter === value ? "bg-blue-100 text-blue-950" : ""}`} onClick={() => { setPage(1); setFilter(value); }}>{title}</button>)}<button className="ml-auto underline" onClick={() => void refresh()}>Atualizar</button></div>
      {error && <p role="alert" className="p-3 text-red-700">{error}</p>}
      <div className="overflow-y-auto p-3">{feed?.items.map(item => <article key={item.id} className={`mb-3 space-y-2 rounded-xl border p-3 ${item.readAt ? "border-slate-200 bg-slate-50 text-slate-600" : "border-blue-300 bg-blue-50 text-slate-950"}`}><p className="font-semibold">{item.correspondent} · {item.client}</p><p><span className={`inline-block rounded-lg border px-2 py-1 ${correspondentStatus(tones[item.eventType] ?? "EM_ANALISE").tone}`}>{item.title}</span></p><p className="text-xs">{documentationDate(item.createdAt)} · {item.readAt ? "Lida" : "Não lida"}</p><div className="flex flex-wrap gap-3"><Link className="underline" href={item.href}>Ver pasta</Link>{!item.readAt && <button disabled={busy} className="font-semibold underline disabled:opacity-50" onClick={() => void markRead(item)}>Marcar como lida</button>}</div></article>)}{feed && !feed.total && <p className="p-3">{filter === "unread" ? "Nenhuma resposta não lida." : "Nenhuma resposta recebida."}</p>}</div>
      <footer className="flex items-center justify-between border-t p-3"><button disabled={page === 1} onClick={() => setPage(value => value - 1)}>Anterior</button><span>Página {page}</span><button disabled={!feed || page * 20 >= feed.total} onClick={() => setPage(value => value + 1)}>Próxima</button></footer></section>}
    {!open && error && <p role="alert" className="mb-2 max-w-80 rounded-lg border bg-white p-3 text-red-700">{error}</p>}
    <button aria-expanded={open} aria-label={`Respostas do correspondente: ${count} não lidas`} className={`ml-auto flex items-center gap-2 rounded-full border px-4 py-3 font-semibold shadow-lg ${count ? "border-blue-300 bg-blue-700 text-white" : "border-slate-300 bg-white text-slate-700"}`} onClick={() => { setOpen(value => !value); void refresh(); }}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg> Respostas {count > 0 && <span className="rounded-full bg-white px-2 py-0.5 text-blue-800">{count}</span>}</button>
  </aside>;
}
