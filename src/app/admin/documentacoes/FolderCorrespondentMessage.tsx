"use client";
import { useState, type FormEvent } from "react";

export default function FolderCorrespondentMessage({ folderId, version, value, onSaved }: { folderId: string; version: number; value: string | null; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(`/api/documentacoes/pastas/${folderId}/mensagem-correspondente`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version, correspondentMessage: draft }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível salvar a mensagem.");
      setEditing(false); onSaved();
    } catch (error) { setError(error instanceof Error ? error.message : "Não foi possível salvar a mensagem."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 rounded-xl border bg-white p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Mensagem para o correspondente</h2>{!editing && <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => { setDraft(value ?? ""); setError(""); setEditing(true); }}>{value ? "Editar mensagem" : "Adicionar mensagem"}</button>}</div>
    <p className="text-sm text-gray-600">Visível ao correspondente atribuído. Pode ser atualizada em qualquer etapa da pasta.</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {editing ? <form onSubmit={save} className="space-y-3"><label className="block text-sm">Mensagem<textarea className="mt-1 w-full rounded-lg border p-3" rows={4} maxLength={3000} value={draft} onChange={event => setDraft(event.target.value)} placeholder="Profissão, dependentes e outras informações úteis para a análise." /></label><div className="flex gap-2"><button disabled={busy} className="rounded-lg bg-blue-700 px-3 py-2 text-white disabled:opacity-50">{busy ? "Salvando…" : "Salvar mensagem"}</button><button type="button" disabled={busy} className="rounded-lg border px-3 py-2" onClick={() => setEditing(false)}>Cancelar</button></div></form> : <p className="whitespace-pre-wrap break-words text-sm">{value || "Nenhuma mensagem cadastrada."}</p>}
  </section>;
}
