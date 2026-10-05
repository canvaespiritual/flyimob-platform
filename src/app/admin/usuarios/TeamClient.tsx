"use client";
import { useEffect, useState, type FormEvent } from "react";
import { operationalRoles } from "@/lib/team/policy";

type Person = { id: string; name: string; email: string | null; operationalRole: keyof typeof operationalRoles; active: boolean; eligible: boolean;
  user: { id: string; email: string; role: string; isActive: boolean } | null; financialParticipant: { id: string; name: string; active: boolean } | null };
type Data = { rows: Person[]; participants: { id: string; name: string; userId: string | null; personId: string | null }[]; users: { id: string; name: string; email: string; personId: string | null }[] };
const control = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
const button = "rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50";
async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, { method, cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json(); if (!res.ok) throw new Error(data.error || "Não foi possível concluir."); return data;
}
export default function TeamClient() {
  const [data, setData] = useState<Data>(), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Person | "new">(), [access, setAccess] = useState<Person>(), [link, setLink] = useState("");
  async function load() { try { setData(await api<Data>("/api/team")); } catch (e) { setError(e instanceof Error ? e.message : "Falha ao carregar."); } }
  useEffect(() => { let active = true; api<Data>("/api/team").then(d => { if (active) setData(d); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = new FormData(event.currentTarget); setBusy(true); setError("");
    try { await api(editing === "new" ? "/api/team" : `/api/team/${editing?.id}`, editing === "new" ? "POST" : "PATCH", {
      name: values.get("name"), email: values.get("email"), operationalRole: values.get("operationalRole"), active: values.get("active") === "on",
      participantId: values.get("participantId") || null, userId: values.get("userId") || null,
    }); setEditing(undefined); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Falha ao salvar."); } finally { setBusy(false); }
  }
  async function enable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = new FormData(event.currentTarget); setBusy(true); setError(""); setLink("");
    try { const result = await api<{ path: string }>(`/api/team/${access?.id}/access`, "POST", { email: values.get("email"), systemRole: values.get("systemRole") }); setLink(new URL(result.path, window.location.origin).href); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Falha ao habilitar acesso."); } finally { setBusy(false); }
  }
  const person = editing && editing !== "new" ? editing : null;
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-600">{data ? `${data.rows.length} pessoas · função operacional e acesso são independentes` : "Carregando equipe…"}</p><button className={button} onClick={() => { setEditing("new"); setAccess(undefined); setLink(""); }}>Cadastrar pessoa</button></div>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {editing && <form key={typeof editing === "string" ? editing : editing.id} onSubmit={save} className="grid gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2">
      <h2 className="font-semibold sm:col-span-2">{person ? "Editar pessoa / vincular identidade existente" : "Cadastrar pessoa sem acesso obrigatório"}</h2>
      <label>Nome<input className={control} name="name" required maxLength={160} defaultValue={person?.name} /></label>
      <label>E-mail (opcional)<input className={control} name="email" type="email" maxLength={254} defaultValue={person?.email ?? ""} /></label>
      <label>Função operacional<select className={control} name="operationalRole" defaultValue={person?.operationalRole ?? "OTHER"}>{Object.entries(operationalRoles).map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select></label>
      <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={person?.active ?? true} />Operacionalmente ativa</label>
      <label>Participante financeiro existente<select className={control} name="participantId" defaultValue={person?.financialParticipant?.id ?? ""}><option value="">Manter vínculo atual / sem vínculo</option>{data?.participants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Acesso existente (vínculo explícito)<select className={control} name="userId" defaultValue={person?.user?.id ?? ""}><option value="">Manter vínculo atual / sem acesso</option>{data?.users.map(u => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}</select></label>
      <p className="text-xs text-slate-500 sm:col-span-2">Selecione somente registros que representam a mesma pessoa. O vínculo reúne a identidade operacional e mantém os IDs e históricos financeiros. Cadastros de participantes existentes são reutilizados. Vínculos conflitantes são recusados.</p>
      <div className="flex gap-2 sm:col-span-2"><button className={button} disabled={busy}>Salvar pessoa</button><button type="button" className={button} onClick={() => setEditing(undefined)}>Cancelar</button></div>
    </form>}
    {access && <form key={access.id} onSubmit={enable} className="space-y-3 rounded-xl border bg-white p-5"><h2 className="font-semibold">{access.user ? "Definir/resetar senha" : "Habilitar acesso"} · {access.name}</h2>
      <p className="text-sm text-slate-600">A função operacional não concede permissões. O link de definição de senha expira em 60 minutos e só pode ser usado uma vez. Envie-o à pessoa por um canal privado.</p>
      <label className="block">E-mail<input className={control} name="email" type="email" required readOnly={!!access.user} defaultValue={access.user?.email ?? access.email ?? ""} /></label>
      <label className="block">Permissão de sistema<select className={control} name="systemRole" defaultValue={access.user?.role ?? "BROKER"}>{(access.user ? [access.user.role] : ["BROKER", "MANAGER", "DIRECTOR", "DATA_ENTRY", "CORRESPONDENTE"]).map(role => <option key={role}>{role}</option>)}</select></label>
      <div className="flex gap-2"><button className={button} disabled={busy}>Gerar link de definição de senha</button><button type="button" className={button} onClick={() => { setAccess(undefined); setLink(""); }}>Fechar</button></div>
      {link && <div role="status" className="rounded-lg bg-teal-50 p-3"><p className="text-sm">Link privado, válido por 60 minutos:</p><input className={control} readOnly value={link} aria-label="Link privado de definição de senha" onFocus={e => e.currentTarget.select()} /></div>}
    </form>}
    <div className="overflow-x-auto rounded-xl border"><table className="w-full text-left text-sm [&_th]:p-3 [&_td]:p-3"><thead className="bg-slate-50"><tr><th>Pessoa</th><th>Função</th><th>Acesso</th><th>Financeiro</th><th>Status</th><th>Ações</th></tr></thead><tbody>
      {data?.rows.map(p => <tr key={p.id} className="border-t"><td>{p.name}<p className="text-xs text-slate-500">{p.email}</p></td><td>{operationalRoles[p.operationalRole]}</td><td>{p.user ? `${p.user.role}${p.user.isActive ? "" : " · acesso inativo"}` : "Sem acesso"}</td><td>{p.financialParticipant ? <a className="text-teal-700 underline" href={`/admin/financeiro/participantes/${p.financialParticipant.id}`}>{p.financialParticipant.name}{p.financialParticipant.active ? "" : " (inativo)"}</a> : "Não vinculado"}</td><td>{p.active ? "Ativa" : "Inativa"}{p.active && !p.eligible && <p className="text-xs text-slate-500">Origem inativa</p>}</td><td><div className="flex flex-wrap gap-2"><button className={button} onClick={() => { setEditing(p); setAccess(undefined); setLink(""); }}>Editar / vincular</button>{p.active && p.user?.role !== "OWNER" && <button className={button} onClick={() => { setAccess(p); setEditing(undefined); setLink(""); }}>{p.user ? "Definir senha" : "Habilitar acesso"}</button>}</div></td></tr>)}
    </tbody></table></div>
  </div>;
}
