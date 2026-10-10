"use client";
import { useEffect, useState } from "react";
import { trainingFetch } from "./Training";
import { brokerLoginLabels, trainingCourseTitle, type BrokerLoginStatus } from "@/lib/training/access-policy";
type Broker = { id: string; userId: string | null; name: string; status: BrokerLoginStatus; eligible: boolean; trainingAccess: { courseIds: string[]; syncPending: boolean; syncedAt: string | null } | null };
type Course = { id: string; title: string };
export default function AccessManager() {
  const [brokers, setBrokers] = useState<Broker[]>([]), [available, setAvailable] = useState<Course[]>([]), [selected, setSelected] = useState(""), [courses, setCourses] = useState<string[]>([]), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false);
  const broker = brokers.find(b => b.id === selected);
  const load = async () => { const d = await trainingFetch("/api/admin/training/access"); setBrokers(d.brokers); setAvailable(d.courses); setLoaded(true); };
  useEffect(() => { let active = true; trainingFetch("/api/admin/training/access").then(d => { if (active) { setBrokers(d.brokers); setAvailable(d.courses); setLoaded(true); } }).catch(e => { if (active) setMessage(e.message); }); return () => { active = false; }; }, []);
  async function save() {
    if (!broker?.eligible || !broker.userId) return;
    setBusy(true);
    try { const d = await trainingFetch("/api/admin/training/access", "PUT", { brokerId: broker.userId, courseIds: courses }); setMessage(d.syncPending ? "Permissões locais salvas. Sincronização pendente; tente novamente quando a Horizonte estiver disponível." : "Permissões salvas e sincronizadas."); await load(); }
    catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="space-y-4 max-w-3xl">
    <h1 className="text-2xl font-semibold">Acesso aos treinamentos</h1>
    <p>Escolha um corretor com login habilitado para conceder acesso aos cursos.</p>
    {message && <p role="status" className="border rounded p-3">{message}</p>}
    <label className="block">Corretor<select className="block border rounded p-3 w-full" disabled={busy} value={selected} onChange={e => { setSelected(e.target.value); setCourses(brokers.find(b => b.id === e.target.value)?.trainingAccess?.courseIds ?? []); }}>
      <option value="">{loaded ? "Selecione" : "Carregando…"}</option>
      {brokers.map(b => <option key={b.id} value={b.id}>{b.name} — {brokerLoginLabels[b.status]}{b.trainingAccess?.syncPending ? " · sincronização pendente" : ""}</option>)}
    </select></label>
    {loaded && !brokers.length && <p>Nenhum corretor cadastrado nesta unidade.</p>}
    {loaded && brokers.length > 0 && !brokers.some(b => b.eligible) && <p>Nenhum corretor desta unidade está com login pronto para receber treinamentos.</p>}
    {broker && !broker.eligible && <p role="status" className="border rounded p-3">{broker.name}: {brokerLoginLabels[broker.status]}. A concessão está bloqueada. Revise o cadastro e o vínculo de acesso em <a className="underline" href="/admin/usuarios">Usuários / Equipe</a>. Habilitar login e conceder curso são ações separadas.</p>}
    {loaded && !available.length && <p>Nenhum curso configurado para esta integração.</p>}
    <fieldset disabled={busy || !broker?.eligible} className="space-y-2"><legend>Cursos permitidos</legend>
      {Array.from(new Set([...available.map(c => c.id), ...courses])).map(id => <label key={id} className="flex items-center gap-3 border rounded p-3"><input type="checkbox" checked={courses.includes(id)} onChange={e => setCourses(old => e.target.checked ? [...old, id] : old.filter(c => c !== id))} />{available.find(c => c.id === id)?.title ?? trainingCourseTitle(id)}</label>)}
      <button className="border rounded p-3" onClick={save} disabled={busy || !broker?.eligible}>{busy ? "Salvando…" : "Salvar / sincronizar"}</button><button className="border rounded p-3 ml-2" onClick={() => setCourses([])}>Desmarcar todos</button>
    </fieldset>
    <p className="text-sm">Desmarcar e salvar revoga o acesso. A Flyimob bloqueia imediatamente novas operações; uma URL de vídeo já emitida pode continuar válida até expirar.</p>
  </div>;
}
