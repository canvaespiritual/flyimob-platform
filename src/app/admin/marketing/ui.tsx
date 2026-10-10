"use client";
import { MultiFilter } from "./multi-filter";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { civilToday, purposes, trackingStatuses } from "@/lib/marketing/policy";
import { operationalRoles } from "@/lib/team/policy";
import CostValidityCorrection from "./cost-validity-correction";
import { MetaStatusBadge } from "./meta-status";
import { CampaignGrid, type GridRow } from "./grid";

const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-50";
const buttonClass = "rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
const primaryClass = "rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50";
const panelClass = "rounded-xl border border-slate-200 bg-white p-5";
const tableClass = "w-full text-left text-sm [&_th]:whitespace-nowrap [&_th]:px-4 [&_th]:py-3 [&_th]:font-medium [&_th]:text-slate-500 [&_td]:px-4 [&_td]:py-4 [&_tr]:border-b [&_tr]:border-slate-100";

async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, { method, cache: "no-store", headers: body === undefined ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({ error: "Resposta indisponível. Tente novamente." }));
  if (!res.ok) throw new Error(data.error ?? "Não foi possível concluir a operação.");
  return data;
}
function useData<T>(url: string) {
  const [result, setResult] = useState<{ url: string; data?: T; error?: string }>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    api<T>(url).then(data => { if (active) setResult({ url, data }); }).catch(error => { if (active) setResult({ url, error: error.message }); });
    return () => { active = false; };
  }, [url, revision]);
  return { data: result?.url === url ? result.data : undefined, error: result?.url === url ? result.error : undefined, reload: () => setRevision(r => r + 1) };
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block min-w-0 space-y-1.5 text-sm"><span className="font-medium text-slate-700">{label}</span>{children}</label>; }
function Message({ children, error = false }: { children: ReactNode; error?: boolean }) { return <p role={error ? "alert" : "status"} className={`rounded-lg border p-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-800" : "border-teal-200 bg-teal-50 text-teal-900"}`}>{children}</p>; }
function Empty({ title, children }: { title: string; children: ReactNode }) { return <div className="rounded-xl border border-dashed bg-slate-50 px-6 py-12 text-center"><h2 className="font-semibold text-slate-800">{title}</h2><div className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">{children}</div></div>; }
function Loading() { return <p role="status" className="py-8 text-sm text-slate-500">Carregando Marketing…</p>; }
function date(value: string | null) { return value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(value)) : "Em diante"; }
function timestamp(value: string | null) { return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "Ainda não realizada"; }
function money(value: string | null, currency: string) {
  if (value === null) return "—";
  // Decimal arithmetic stays on the server; localized presentation preserves exact cents.
  const [whole, cents = "00"] = value.split(".");
  const amount = `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${cents.padEnd(2, "0")}`;
  return `${currency === "BRL" ? "R$" : currency} ${amount}`;
}
type Options = { accounts: { id: string; name: string; currency: string; timezone: string }[]; brokers: { id: string; name: string; isActive: boolean; operationalRole: keyof typeof operationalRoles }[] };
type Totals = { currency: string; metaSpend: string; effectiveSpend: string; leads: number; cpl: string | null; cplMeta: string | null; rows: number };
type Overview = { totals: Totals[]; brokers: (Totals & { id: string | null; name: string })[]; campaigns: GridRow[];
  canSync: boolean; preferenceKey: string; unavailable: number; from: string; to: string; lastSyncedAt: string | null; timezoneNote: string };

export function OverviewScreen() {
  const [query, setQuery] = useState("period=month");
  const [campaignSearch, setCampaignSearch] = useState("");
  const { data, error, reload } = useData<Overview>(`/api/marketing/overview?${query}`);
  const [syncing, setSyncing] = useState(false), [syncNotice, setSyncNotice] = useState(""), [syncError, setSyncError] = useState("");
  async function sync() {
    setSyncing(true); setSyncError(""); setSyncNotice("");
    try {
      const response = await api<{ results: { status: string }[] }>("/api/marketing/sync", "POST", {});
      const failures = response.results.filter(r => r.status === "FAILED").length;
      if (failures) setSyncError(`${failures} conta(s) não puderam ser atualizadas. Os dados anteriores foram preservados. Confira as conexões e tente novamente após alguns minutos.`);
      else setSyncNotice(response.results.some(r => r.status === "PENDING") ? "Há sincronização em andamento ou aguardando nova tentativa. Atualize novamente após alguns minutos." : "Sincronização concluída.");
      reload(); choices.reload(); campaignChoices.reload();
    } catch (e) { setSyncError(e instanceof Error ? e.message : "Não foi possível atualizar."); } finally { setSyncing(false); }
  }
  const choices = useData<Options>("/api/marketing/options");
  const campaignChoices = useData<CampaignList>(`/api/marketing/campaigns?q=${encodeURIComponent(campaignSearch)}`);
  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const params = new URLSearchParams();
    for (const [key, value] of form) if (typeof value === "string" && value) params.append(key, value);
    setQuery(params.toString());
  }
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold text-slate-900">Visão geral</h2>
      {data?.canSync && <button className={buttonClass} disabled={syncing} onClick={() => void sync()}>{syncing ? "Sincronizando Meta..." : "↻ Atualizar"}</button>}</div>
    {syncNotice && <Message>{syncNotice}</Message>}{syncError && <Message error>{syncError}</Message>}
    <form onSubmit={filter} className={`${panelClass} grid gap-4 sm:grid-cols-2 lg:grid-cols-4`}>
      <Field label="Período"><select name="period" className={inputClass} defaultValue="month"><option value="today">Hoje</option><option value="yesterday">Ontem</option><option value="week">Últimos 7 dias</option><option value="month">Este mês</option><option value="previous">Mês anterior</option><option value="custom">Personalizado</option></select></Field>
      <Field label="Finalidade"><select name="purpose" className={inputClass} defaultValue="CLIENTES">{Object.entries(purposes).map(([id, name]) => <option key={id} value={id}>{name}</option>)}<option value="ALL">Todas as finalidades</option></select></Field>
      <MultiFilter name="accountId" label="Conta Meta" kind="contas" options={choices.data?.accounts.map(a=>({id:a.id,name:`${a.name} · ${a.currency}`}))??[]}/>
      <MultiFilter name="brokerId" label="Responsável" kind="responsáveis" options={[{id:"unassigned",name:"Não atribuídas"},...(choices.data?.brokers.map(b=>({id:b.id,name:`${b.name}${b.isActive?"":" (inativo)"}`}))??[])]}/>
      <Field label="Início personalizado"><input className={inputClass} type="date" name="from" /></Field>
      <Field label="Fim personalizado"><input className={inputClass} type="date" name="to" /></Field>
      <Field label="Campanha"><input className={inputClass} value={campaignSearch} onChange={e => setCampaignSearch(e.target.value)} maxLength={160} aria-label="Buscar campanha para filtrar" placeholder="Buscar pelo nome" /><select name="campaignId" aria-label="Campanha" className={inputClass}><option value="">Todas as campanhas</option>{campaignChoices.data?.items.map(c => <option key={c.id} value={c.id}>{c.name} · {c.account.name}</option>)}</select></Field>
      <div className="flex items-end"><button className={primaryClass}>Aplicar filtros</button></div>
    </form>
    <Message>Conversas iniciadas / Leads Meta usam a action de conversas iniciadas em 7 dias. Hoje até o momento da última atualização. Filtros consultam apenas dados confirmados no banco.</Message>
    {choices.error && <Message error>{choices.error}</Message>}{campaignChoices.error && <Message error>{campaignChoices.error}</Message>}{error && <Message error>{error}</Message>}
    {!data && !error && <Loading />}
    {data && <>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500"><span>{date(data.from)} a {date(data.to)}</span><span>{data.lastSyncedAt ? `Atualizado às ${new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(data.lastSyncedAt))} · ${timestamp(data.lastSyncedAt)}` : "Nenhuma atualização confirmada"}</span></div>
      <p className="text-xs text-slate-500">{data.timezoneNote} Moedas diferentes são exibidas separadamente.</p>
      {data.unavailable > 0 && <Message>{data.unavailable} registro(s) sem confirmação foram excluídos dos totais. A ausência de dados não representa gasto ou leads iguais a zero.</Message>}
      {!data.totals.length ? <Empty title="Nenhuma métrica confirmada neste período">Os indicadores aparecerão após a integração e a primeira sincronização. Revise também a finalidade e os filtros selecionados.</Empty> : data.totals.map(total => <section key={total.currency} className="space-y-3" aria-label={`Indicadores ${total.currency}`}>
        <h3 className="text-sm font-medium text-slate-600">Indicadores · {total.currency}</h3><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[["Investimento Meta", money(total.metaSpend, total.currency)], ["Gasto efetivo", money(total.effectiveSpend, total.currency)], ["Conversas iniciadas", total.leads.toLocaleString("pt-BR")], ["CPL Meta", money(total.cplMeta, total.currency)]].map(([label, value]) => <div key={label} className={panelClass}><p className="text-sm text-slate-500">{label}</p><p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{value}</p></div>)}
        </div></section>)}
      <section className={panelClass}><h3 className="mb-3 font-semibold">Por responsável</h3><p className="mb-4 text-xs text-slate-500">Participação determinada pela atribuição da campanha vigente em cada dia.</p>
        {!data.brokers.length ? <p className="text-sm text-slate-500">Nenhuma participação confirmada.</p> : <div className="overflow-x-auto"><table className={tableClass}><thead><tr><th>Responsável</th><th>Moeda</th><th>Investimento efetivo</th><th>Leads</th><th>CPL</th></tr></thead><tbody>{data.brokers.map(b => <tr key={`${b.id}:${b.currency}`}><td className="font-medium">{b.name}</td><td>{b.currency}</td><td>{money(b.effectiveSpend, b.currency)}</td><td>{b.leads}</td><td>{money(b.cpl, b.currency)}</td></tr>)}</tbody></table></div>}
      </section>
      <CampaignGrid rows={data.campaigns} preferenceKey={data.preferenceKey} />
    </>}
  </div>;
}

type Campaign = { id: string; externalId: string; name: string; purpose: keyof typeof purposes; trackingStatus: keyof typeof trackingStatuses; sourceStatus: string | null; effectiveStatus: string | null; version: number; updatedAt: string; lastSyncedAt: string | null;
  account: { id: string; name: string; externalId: string; currency: string; timezone: string; businessName: string | null; businessExternalId: string | null };
  assignments: { brokerId: string; broker: { name: string } }[] };
type CampaignList = { items: Campaign[]; page: number; total: number; pageSize: number };
type AssignmentList = { total: number; page: number; assignments: { id: string; validFrom: string; validTo: string | null; cancelledAt: string | null; reason: string | null; broker: { name: string }; createdBy: { name: string } }[] };

function CampaignEditor({ campaign, brokers, close, saved }: { campaign: Campaign; brokers: Options["brokers"]; close: () => void; saved: () => void }) {
  const [historyPage, setHistoryPage] = useState(1);
  const history = useData<AssignmentList>(`/api/marketing/campaigns/${campaign.id}?page=${historyPage}`);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = new FormData(event.currentTarget); setBusy(true); setError("");
    try {
      const assignment = values.get("changeAssignment") === "on" ? { personId: values.get("personId") || null, validFrom: values.get("validFrom"), reason: values.get("reason") || undefined } : undefined;
      await api(`/api/marketing/campaigns/${campaign.id}`, "PATCH", { version: campaign.version, purpose: values.get("purpose"), trackingStatus: values.get("trackingStatus"), assignment });
      saved();
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao salvar."); } finally { setBusy(false); }
  }
  return <section className={`${panelClass} space-y-5`} aria-label="Gerenciar campanha">
    <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{campaign.name}</h3><p className="mt-1 text-xs text-slate-500">Conta {campaign.account.name} · {campaign.account.currency} · {campaign.account.timezone}</p></div><button className={buttonClass} onClick={close}>Fechar</button></div>
    <dl className="grid gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">ID externo da campanha</dt><dd className="break-all font-mono">{campaign.externalId}</dd></div><div><dt className="text-slate-500">ID externo da conta</dt><dd className="break-all font-mono">{campaign.account.externalId}</dd></div><div><dt className="text-slate-500">BM/empresa informada na origem</dt><dd>{campaign.account.businessName || campaign.account.businessExternalId || "Não informada"}</dd></div><div><dt className="text-slate-500">Status Meta</dt><dd><MetaStatusBadge status={campaign.effectiveStatus ?? campaign.sourceStatus} /></dd></div></dl>
    <p className="text-sm text-slate-600">Responsável atual: {campaign.assignments[0]?.broker.name ?? "Não atribuída"}</p><form onSubmit={save} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="Finalidade"><select name="purpose" className={inputClass} defaultValue={campaign.purpose}>{Object.entries(purposes).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></Field><Field label="Acompanhamento"><select className={inputClass} name="trackingStatus" defaultValue={campaign.trackingStatus}>{Object.entries(trackingStatuses).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></Field></div>
      <label className="flex gap-2 text-sm"><input type="checkbox" name="changeAssignment" />Alterar ou encerrar atribuição a partir de uma data</label>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Novo responsável"><select className={inputClass} name="personId" defaultValue={campaign.assignments[0]?.brokerId ?? ""}><option value="">Sem responsável / encerrar atribuição</option>{brokers.filter(b => b.isActive).map(b => <option key={b.id} value={b.id}>{b.name} · {operationalRoles[b.operationalRole]}</option>)}</select></Field><Field label="Início da nova vigência"><input className={inputClass} type="date" name="validFrom" defaultValue={civilToday()} /></Field><Field label="Motivo (opcional)"><input className={inputClass} name="reason" maxLength={500} /></Field></div>
      <p className="text-xs leading-5 text-slate-500">A data é inclusiva e a atribuição anterior termina nessa data. Períodos anteriores permanecem preservados. Atribuições posteriores já agendadas continuam válidas. Para cancelar uma atribuição futura, selecione sem responsável e informe a data inicial dela. O cancelamento permanece no histórico. Datas passadas representam uma correção explícita da atribuição nesse período.</p>
      {error && <Message error>{error}</Message>}<button className={primaryClass} disabled={busy}>{busy ? "Salvando…" : "Salvar alterações"}</button>
    </form>
    <div><h4 className="mb-3 text-sm font-semibold">Histórico de atribuições</h4>{history.error && <Message error>{history.error}</Message>}{!history.data && !history.error && <Loading />}
      {history.data && (!history.data.assignments.length ? <p className="text-sm text-slate-500">Campanha ainda sem atribuição.</p> : <><div className="overflow-x-auto"><table className={tableClass}><thead><tr><th>Responsável</th><th>Início</th><th>Fim exclusivo</th><th>Registrado por</th><th>Motivo / estado</th></tr></thead><tbody>{history.data.assignments.map(a => <tr key={a.id}><td>{a.broker.name}</td><td>{date(a.validFrom)}</td><td>{date(a.validTo)}</td><td>{a.createdBy.name}</td><td>{a.cancelledAt ? `Cancelada · ${timestamp(a.cancelledAt)}` : a.reason || "—"}</td></tr>)}</tbody></table></div><Pager page={historyPage} total={history.data.total} change={setHistoryPage} /></>)}
    </div>
  </section>;
}
function Pager({ page, total, change }: { page: number; total: number; change: (page: number) => void }) { return <div className="mt-4 flex flex-wrap items-center gap-3 text-sm"><button className={buttonClass} disabled={page <= 1} onClick={() => change(page - 1)}>Anterior</button><span>Página {page} · {total} registros</span><button className={buttonClass} disabled={page * 20 >= total} onClick={() => change(page + 1)}>Próxima</button></div>; }
export function CampaignsScreen() {
  const initialSearch = useSearchParams().get("q") ?? "";
  const [metaChoice, setMetaChoice] = useState(initialSearch ? "ALL" : "ACTIVE");
  const [query, setQuery] = useState(() => new URLSearchParams({ q: initialSearch, metaStatus: initialSearch ? "ALL" : "ACTIVE" }).toString()); const [page, setPage] = useState(1); const [editing, setEditing] = useState<Campaign>();
  const list = useData<CampaignList>(`/api/marketing/campaigns?${query}&page=${page}`); const choices = useData<Options>("/api/marketing/options");
  const [notice, setNotice] = useState("");
  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const params = new URLSearchParams(); for (const [key, value] of new FormData(event.currentTarget)) if (typeof value === "string" && value) params.append(key, value);
    if (params.get("q")) { params.set("metaStatus", "ALL"); setMetaChoice("ALL"); }
    setQuery(params.toString()); setPage(1); setEditing(undefined);
  }
  return <div className="space-y-5"><h2 className="text-xl font-semibold">Campanhas</h2>
    <form className={`${panelClass} grid gap-4 sm:grid-cols-2 lg:grid-cols-3`} onSubmit={filter}><Field label="Buscar campanha"><input className={inputClass} name="q" defaultValue={initialSearch} maxLength={160} placeholder="Nome da campanha" /></Field><MultiFilter name="accountId" label="Conta Meta" kind="contas" options={choices.data?.accounts.map(a=>({id:a.id,name:`${a.name} · ${a.currency}`}))??[]}/><MultiFilter name="brokerId" label="Responsável" kind="responsáveis" options={[{id:"unassigned",name:"Não atribuídas"},...(choices.data?.brokers.map(b=>({id:b.id,name:`${b.name}${b.isActive?"":" (inativo)"}`}))??[])]}/><Field label="Finalidade"><select className={inputClass} name="purpose"><option value="">Todas</option>{Object.entries(purposes).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></Field><Field label="Status Meta"><select className={inputClass} name="metaStatus" value={metaChoice} onChange={e => setMetaChoice(e.target.value)}><option value="ACTIVE">Ativas</option><option value="PAUSED">Pausadas</option><option value="OTHER">Inativas / arquivadas / outros</option><option value="ALL">Todas</option></select></Field><Field label="Acompanhamento"><select className={inputClass} name="status"><option value="">Todos</option>{Object.entries(trackingStatuses).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></Field><div className="flex items-end"><button className={primaryClass}>Filtrar campanhas</button></div></form>
    {new URLSearchParams(query).get("q") && <p className="text-xs text-slate-500">A busca por nome considera todos os estados Meta.</p>}{notice && <Message>{notice}</Message>}{choices.error && <Message error>{choices.error}</Message>}{list.error && <Message error>{list.error}</Message>}{!list.data && !list.error && <Loading />}
    {editing && <CampaignEditor key={editing.id} campaign={editing} brokers={choices.data?.brokers ?? []} close={() => setEditing(undefined)} saved={() => { setEditing(undefined); setNotice("Alterações salvas e registradas no histórico."); list.reload(); }} />}
    {list.data && (!list.data.items.length ? <Empty title="Nenhuma campanha encontrada">As campanhas serão disponibilizadas pela integração Meta. Quando existirem, você poderá classificar a finalidade e atribuir responsáveis com vigência.</Empty> : <section className={panelClass}><div className="overflow-x-auto"><table className={tableClass}><thead><tr><th>Campanha</th><th>Conta</th><th>Status Meta</th><th>Finalidade</th><th>Responsável atual</th><th>Acompanhamento</th><th>Última atualização</th><th>Ação</th></tr></thead><tbody>{list.data.items.map(c => <tr key={c.id}><td className="font-medium">{c.name}</td><td>{c.account.name}</td><td><MetaStatusBadge status={c.effectiveStatus ?? c.sourceStatus} /></td><td>{purposes[c.purpose]}</td><td>{c.assignments[0]?.broker.name ?? "Não atribuída"}</td><td>{trackingStatuses[c.trackingStatus]}</td><td>{timestamp(c.updatedAt)}</td><td><button className={buttonClass} onClick={() => { setEditing(c); setNotice(""); }}>Gerenciar</button></td></tr>)}</tbody></table></div><Pager page={page} total={list.data.total} change={setPage} /></section>)}
  </div>;
}

type Settings = { configured: boolean; today: string; connections: { id: string; label: string; status: string; lastSyncedAt: string | null; safeErrorCode: string | null;
  accounts: { id: string; selected: boolean; accessible: boolean; account: { sourceAccountStatus: number | null; id: string; name: string; externalId: string; currency: string; timezone: string; businessName: string | null } }[] }[];
  rules: { id: string; percentage: string; validFrom: string; validTo: string | null }[] };
const connectionStates: Record<string, string> = { NOT_CONFIGURED: "Não autorizada", AUTHORIZED: "Autorizada", EXPIRED: "Autorização expirada", REVOKED: "Autorização revogada", ERROR: "Requer atenção" };
export function SettingsScreen() {
  const [correctingRule, setCorrectingRule] = useState<Settings["rules"][number]>();
  const authorizationOutcome = useSearchParams().get("meta");
  const settings = useData<Settings>("/api/marketing/settings"); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [showConnection, setShowConnection] = useState(false);
  async function mutation(url: string, method: string, body: unknown, message: string) {
    setBusy(true); setError(""); setNotice("");
    try { await api(url, method, body); setNotice(message); settings.reload(); return true; }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar."); return false; }
    finally { setBusy(false); }
  }
  async function connect(connectionId: string) {
    setBusy(true); setError("");
    try { const result = await api<{ url: string }>("/api/marketing/meta/connect", "POST", { connectionId }); window.location.assign(result.url); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível conectar."); setBusy(false); }
  }
  async function connection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const label = new FormData(form).get("label");
    if (await mutation("/api/marketing/connections", "POST", { label }, "Cadastro de conexão criado. Use Conectar Meta para autorizar a nova conexão.")) { form.reset(); setShowConnection(false); }
  }
  async function rule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const values = new FormData(form);
    if (await mutation("/api/marketing/settings", "POST", { percentage: values.get("percentage"), validFrom: values.get("validFrom") }, "Nova regra de custo cadastrada com vigência. Histórico preservado.")) form.reset();
  }
  return <div className="space-y-6"><h2 className="text-xl font-semibold">Configurações</h2>{authorizationOutcome === "connected" && <Message>Meta conectada. Selecione as contas que deseja acompanhar e use Atualizar.</Message>}{authorizationOutcome === "discovery_pending" && <Message>Autorização concluída. Use Descobrir contas para concluir a leitura das contas.</Message>}{authorizationOutcome === "error" && <Message error>Autorização não concluída ou expirada. Confira a configuração do app e reconecte a Meta.</Message>}{error && <Message error>{error}</Message>}{notice && <Message>{notice}</Message>}{settings.error && <Message error>{settings.error}</Message>}{!settings.data && !settings.error && <Loading />}
    <section className={`${panelClass} space-y-4`}><div className="flex flex-wrap justify-between gap-3"><h3 className="font-semibold">Integrações Meta</h3><button className={buttonClass} onClick={() => setShowConnection(true)} disabled={busy}>Conectar Meta</button></div>
      <p className="text-sm leading-6 text-slate-600">Cada conexão representa uma autorização e pode disponibilizar várias contas. Somente as contas selecionadas e ativas serão sincronizadas. A leitura não altera anúncios na Meta.</p>
      {settings.data && !settings.data.configured && <Message>OAuth pendente de configuração no servidor: App ID, App Secret, configuração de Login para Empresas, callback e chave de criptografia. Não informe secrets nesta página.</Message>}
      {settings.data && !settings.data.connections.length && <Empty title="Nenhuma conexão cadastrada">Dê um nome à autorização e conecte sua conta pela Meta.</Empty>}
      {showConnection && <form onSubmit={connection} className="flex flex-wrap items-end gap-3"><Field label="Nome da conexão"><input className={inputClass} name="label" required maxLength={160} placeholder="Nome da pessoa ou autorização" /></Field><button className={primaryClass} disabled={busy}>Criar conexão</button><button type="button" className={buttonClass} onClick={() => setShowConnection(false)}>Cancelar</button></form>}
      {settings.data?.connections.map(c => <article key={c.id} className="space-y-4 rounded-lg border bg-slate-50 p-4"><div className="flex flex-wrap justify-between gap-2"><div><h4 className="font-semibold">{c.label}</h4><p className="mt-1 text-sm text-slate-600">{connectionStates[c.status] ?? "Requer atenção"} · {c.accounts.filter(a => a.selected).length} conta(s) selecionada(s)</p></div><p className="text-xs text-slate-500">Última sincronização: {timestamp(c.lastSyncedAt)}</p></div>
        <div className="flex flex-wrap gap-2"><button className={primaryClass} disabled={busy || !settings.data?.configured} onClick={() => void connect(c.id)}>{c.status === "NOT_CONFIGURED" ? "Conectar Meta" : "Reconectar Meta"}</button><button className={buttonClass} disabled={busy || c.status !== "AUTHORIZED"} onClick={() => void mutation(`/api/marketing/connections/${c.id}/discover`, "POST", {}, "Contas redescobertas. A seleção anterior foi preservada.")}>Descobrir contas</button></div>
        {(c.status === "EXPIRED" || c.status === "REVOKED") && <Message error>Conexão precisa ser renovada. Reconecte a Meta para continuar. Seu histórico permanece preservado.</Message>}
        {c.safeErrorCode && c.status === "AUTHORIZED" && <Message error>A última leitura não foi concluída. Aguarde e tente descobrir contas novamente.</Message>}
        <details><summary className="cursor-pointer text-sm font-medium text-teal-700">Gerenciar conexão e contas</summary><div className="mt-4 space-y-4"><form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); void mutation(`/api/marketing/connections/${c.id}`, "PATCH", { label: new FormData(e.currentTarget).get("label") }, "Nome da conexão atualizado."); }}><Field label="Nome"><input className={inputClass} name="label" required maxLength={160} defaultValue={c.label} /></Field><button className={buttonClass} disabled={busy}>Salvar nome</button></form>
          {!c.accounts.length ? <p className="text-sm text-slate-500">Nenhuma conta descoberta. A descoberta dependerá da autorização real.</p> : c.accounts.map(a => <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-3"><div><p className="text-sm font-medium">{a.account.name}</p><p className="text-xs text-slate-500">{a.account.externalId} · {a.account.sourceAccountStatus === 1 ? "Ativa" : `Status Meta ${a.account.sourceAccountStatus ?? "desconhecido"}`} · {a.account.currency} · {a.account.timezone}{a.account.businessName ? ` · ${a.account.businessName}` : ""}</p></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={a.selected} disabled={busy || (!a.selected && (!a.accessible || a.account.sourceAccountStatus !== 1))} onChange={e => void mutation(`/api/marketing/connections/${c.id}`, "PUT", { accountId: a.account.id, selected: e.target.checked }, "Seleção atualizada. Use ↻ Atualizar para importar o histórico.")} />{a.accessible ? "Acompanhar esta conta" : "Acesso indisponível"}</label></div>)}
        </div></details>
      </article>)}
    </section>
    <section className={`${panelClass} space-y-4`}><h3 className="font-semibold">Regra de custo de mídia</h3><p className="text-sm leading-6 text-slate-600">Uma regra para toda a operação. Gasto efetivo = gasto Meta × (1 + percentual / 100). O valor bruto permanece preservado. Sem regra, o acréscimo é zero.</p>
      <form onSubmit={rule} className="grid items-end gap-4 sm:grid-cols-3"><Field label="Acréscimo (%)"><input className={inputClass} name="percentage" required inputMode="decimal" placeholder="Informe o percentual" maxLength={12} /></Field><Field label="Início da vigência"><input className={inputClass} type="date" name="validFrom" required defaultValue={civilToday()} /></Field><button className={primaryClass} disabled={busy}>Criar nova vigência</button></form>
      <p className="text-xs text-slate-500">A nova data deve ser posterior à última regra cadastrada e aos dias já confirmados. Não é possível sobrescrever percentuais históricos.</p>
      {settings.data && (!settings.data.rules.length ? <p className="text-sm text-slate-500">Nenhuma regra cadastrada. O gasto efetivo utiliza o gasto bruto, sem acréscimo.</p> : <div className="overflow-x-auto"><table className={tableClass}><thead><tr><th>Percentual</th><th>Início</th><th>Fim exclusivo</th><th>Status</th><th></th></tr></thead><tbody>{settings.data.rules.map(r => { const today = settings.data!.today; const start = r.validFrom.slice(0, 10); const end = r.validTo?.slice(0, 10); const status = start > today ? "Agendada" : end && end <= today ? "Encerrada" : "Vigente"; return <tr key={r.id}><td>{r.percentage.replace(".", ",")}%</td><td>{date(r.validFrom)}</td><td>{date(r.validTo)}</td><td>{status}</td><td><button className="text-teal-700 underline disabled:opacity-50" disabled={busy} onClick={() => { setCorrectingRule(r); setError(""); setNotice(""); }}>Corrigir vigência</button></td></tr>; })}</tbody></table></div>)}
      {correctingRule && <CostValidityCorrection key={correctingRule.id} rule={correctingRule} onCancel={() => setCorrectingRule(undefined)} onSaved={() => { setCorrectingRule(undefined); setNotice("Vigência corrigida e auditada. Relatórios históricos refletem a correção; os dados Meta foram preservados."); settings.reload(); }} />}
    </section>
    <section className={`${panelClass} space-y-4`}><h3 className="font-semibold">Importar período específico</h3><p className="text-sm text-slate-600">A primeira atualização importa mês atual e anterior; as seguintes reconciliam os últimos 7 dias e hoje. Para outro período, selecione datas (até 367 dias). Todas as contas ativas selecionadas serão lidas.</p><form className="grid items-end gap-4 sm:grid-cols-3" onSubmit={async e => { e.preventDefault(); const form = new FormData(e.currentTarget); setBusy(true); setError(""); setNotice(""); try { const response = await api<{ results: { status: string }[] }>("/api/marketing/sync", "POST", { from: form.get("from"), to: form.get("to") }); if (response.results.some(r => r.status === "FAILED")) setError("Uma ou mais contas falharam. Dados anteriores preservados; tente novamente após alguns minutos."); else setNotice(response.results.some(r => r.status === "PENDING") ? "Sincronização pendente ou em andamento. Tente novamente após alguns minutos." : "Período importado."); settings.reload(); } catch (e) { setError(e instanceof Error ? e.message : "Falha ao importar."); } finally { setBusy(false); } }}><Field label="Início"><input className={inputClass} name="from" type="date" required /></Field><Field label="Fim"><input className={inputClass} name="to" type="date" required /></Field><button className={primaryClass} disabled={busy}>{busy ? "Sincronizando Meta..." : "Importar período"}</button></form></section>
  </div>;
}
