"use client";
import { useState, type FormEvent } from "react";
import { correspondentMessage } from "@/lib/documentacoes/correspondent-presentation";

type Correspondent = { id: string; name: string; email: string; isActive: boolean; updatedAt: string };
export default function CorrespondentMessage({ correspondent, clientName, documentCount, status, owner, onChange }: { correspondent: Correspondent; clientName: string; documentCount: number; status: string; owner: boolean; onChange: () => void }) {
  const [busy, setBusy] = useState(false); const [feedback, setFeedback] = useState(""); const [manual, setManual] = useState("");
  const ready = correspondent.isActive && ["AGUARDANDO_CORRESPONDENTE", "EM_REANALISE", "EM_ANALISE"].includes(status);
  async function copy(password?: string) {
    const message = correspondentMessage({ clientName, documentCount, email: correspondent.email, origin: window.location.origin, password, reanalysis: status === "EM_REANALISE", inProgress: status === "EM_ANALISE" });
    try { await navigator.clipboard.writeText(message); setManual(""); setFeedback("Mensagem copiada. Envie pelo seu WhatsApp."); }
    catch { setManual(message); setFeedback("O navegador não permitiu copiar. Selecione a mensagem abaixo e copie manualmente; depois clique em Limpar mensagem."); }
  }
  async function definePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const fields = new FormData(form);
    if (!window.confirm("Definir esta senha inicial? A senha atual será substituída e as sessões anteriores serão encerradas.")) return;
    setBusy(true); setFeedback(""); setManual("");
    try {
      const response = await fetch(`/api/documentacoes/correspondentes/${correspondent.id}/senha-inicial`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...Object.fromEntries(fields), updatedAt: correspondent.updatedAt }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Não foi possível definir a senha inicial.");
      await copy(String(fields.get("password"))); form.reset(); onChange();
    } catch (error) { setFeedback((error as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4" aria-label="Mensagem para o correspondente">
    <h2 className="font-semibold">{ready ? "✓ Documentação enviada ao correspondente" : "Mensagem para o correspondente"}</h2><p className="text-sm">Cliente: {clientName} · {documentCount} documentos · Correspondente: {correspondent.name}</p>
    {!ready && <p className="text-sm">Envie ou reenvie a pasta para análise e mantenha o correspondente ativo para copiar a mensagem.</p>}
    <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!ready || busy} onClick={() => { setManual(""); void copy(); }}>Copiar mensagem para WhatsApp</button>
    {owner && ready && <details className="rounded-lg border border-blue-200 bg-white p-3"><summary className="cursor-pointer text-sm font-semibold">Definir senha inicial e copiar acesso</summary><p className="my-3 text-sm text-slate-600">Use apenas quando precisar criar ou redefinir o acesso. A senha substitui a atual; o sistema salva somente o hash. Ela só aparece na mensagem desta interação e não será recuperável após atualizar a página.</p><form className="grid gap-3 sm:grid-cols-2" onSubmit={definePassword}><label className="text-sm">Senha inicial<input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={256} className="mt-1 w-full rounded-lg border p-2" /></label><label className="text-sm">Confirmar senha<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={256} className="mt-1 w-full rounded-lg border p-2" /></label><button disabled={busy} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Definir senha e copiar mensagem</button></form></details>}
    {feedback && <p role="status" className="text-sm">{feedback}</p>}
    {manual && <div className="space-y-2"><textarea aria-label="Mensagem pronta para copiar" readOnly value={manual} rows={12} className="w-full rounded-lg border p-3 text-sm" /><button className="rounded-lg border bg-white px-3 py-2 text-sm" onClick={() => { setManual(""); setFeedback("Mensagem descartada desta tela."); }}>Limpar mensagem</button></div>}
  </section>;
}
