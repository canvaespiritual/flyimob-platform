"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PLANO_VAZIO, TIPOS_GRUPO, alertasPlano, validarPlano, type PlanoPagamento, type GrupoPagamento, type ResumoCredito } from "@/lib/comparativos/plano";

type Anexo = { id: string; titulo: string; nomeOriginal: string; escopo: string };
type Tipologia = { id: string; nome: string; areaPrivativa: number | null; areaTerreno: number | null; vagas: number | null; empreendimento: { name: string } };
type Item = { id: string; revisao: number; estadoExtracao: string; planoRascunho: PlanoPagamento | null; planoPagamento: PlanoPagamento | null; anexos: Anexo[]; tipologia: Tipologia };
type Comparativo = { id: string; titulo: string; clienteNome: string; revisao: number; publicadoEm: string | null; showGeral?: boolean; showEntrada?: boolean; showFinanciamento?: boolean; items: Item[]; anexos: Anexo[]; resumoCredito: ResumoCredito | null };
const emptyCredit: ResumoCredito = { valorAprovado: null, parcela: null, recursosProprios: null, fgts: null, observacoes: "", proximosPassos: "" };
const numericFields = { valorTotal: "Preço da proposta", entradaTotalInformada: "Total de entrada declarado no documento", valorAvaliacao: "Avaliação / tabela", financiamento: "Valor financiado", parcelaBanco: "Parcela do banco", fgts: "FGTS", subsidioFederal: "Subsídio federal", subsidioEstadual: "Subsídio estadual" } as const;
const groupNames: Record<GrupoPagamento["tipo"], string> = { sinal: "Sinal", mensais_obra: "Mensais durante a obra", intermediarias: "Intermediárias", mensais_pos_chaves: "Mensais após as chaves", mensais_sem_fase: "Mensais (fase não informada)", outros: "Outros pagamentos" };
const inputClass = "w-full border rounded-lg px-3 py-2 bg-white";
function NumberField({ label, value, onChange, integer = false }: { label: string; value: number | null; onChange: (n: number | null) => void; integer?: boolean }) {
  return <label className="block text-sm space-y-1"><span>{label}</span><input className={inputClass} type="number" min="0" step={integer ? "1" : "0.01"} value={value ?? ""} placeholder="Não informado" onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))} /></label>;
}
async function request(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await response.json(); if (!response.ok || !json.ok) throw new Error(json.error || "Não foi possível concluir."); return json;
}
async function getComparativo(id: string): Promise<Comparativo> {
  const response = await fetch(`/api/comparativos/get?id=${encodeURIComponent(id)}`);
  const json = await response.json(); if (!response.ok || !json.comparativo) throw new Error(json.error || "Comparativo indisponível.");
  return json.comparativo;
}
export default function DirecionamentoEditor({ id }: { id: string }) {
  const [cmp, setCmp] = useState<Comparativo | null>(null);
  const [step, setStep] = useState(0);
  const [index, setIndex] = useState(0);
  const activeIndex = useRef(0);
  const [plan, setPlan] = useState<PlanoPagamento>(PLANO_VAZIO);
  const [title, setTitle] = useState("");
  const [customer, setCustomer] = useState("");
  const [credit, setCredit] = useState<ResumoCredito>(emptyCredit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Tipologia[]>([]);
  const [searching, setSearching] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [attachmentTitles, setAttachmentTitles] = useState(["Aprovação de crédito", "Simulação Caixa"]);
  const apply = useCallback((c: Comparativo) => {
    setCmp(c); setTitle(c.titulo); setCustomer(c.clienteNome); setCredit(c.resumoCredito ?? emptyCredit);
    const selected = c.items[activeIndex.current];
    if (selected) setPlan(selected.planoRascunho ?? selected.planoPagamento ?? { ...PLANO_VAZIO, empreendimento: selected.tipologia.empreendimento.name });
    setAttachmentTitles([0, 1].map(slot => c.anexos.find(a => a.escopo === `credito:${slot}`)?.titulo ?? (slot === 0 ? "Aprovação de crédito" : "Simulação Caixa")));
  }, []);
  async function load() { const c = await getComparativo(id); apply(c); return c; }
  useEffect(() => { let cancelled = false; getComparativo(id).then(c => { if (!cancelled) apply(c); }).catch(e => { if (!cancelled) setError(e.message); }); return () => { cancelled = true; }; }, [id, apply]);
  const item = cmp?.items[index];
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Erro inesperado."); } finally { setBusy(false); }
  }
  function change<K extends keyof PlanoPagamento>(key: K, value: PlanoPagamento[K]) { setPlan(p => ({ ...p, [key]: value })); setDirty(true); }
  function changeGroup(i: number, patch: Partial<GrupoPagamento>) { change("grupos", plan.grupos.map((g, n) => n === i ? { ...g, ...patch } : g)); }
  function navigate(nextStep: number, nextIndex = index) {
    if (busy || (dirty && !confirm("Há alterações não salvas. Deseja sair desta opção?"))) return;
    setTitle(cmp?.titulo ?? ""); setCustomer(cmp?.clienteNome ?? ""); setCredit(cmp?.resumoCredito ?? emptyCredit);
    setStep(nextStep); setIndex(nextIndex); activeIndex.current = nextIndex; setDirty(false); setError(""); setMessage("");
    if (cmp?.items[nextIndex]) setPlan(cmp.items[nextIndex].planoRascunho ?? cmp.items[nextIndex].planoPagamento ?? { ...PLANO_VAZIO, empreendimento: cmp.items[nextIndex].tipologia.empreendimento.name });
  }
  async function upload(file: File, slot?: number) {
    if (!cmp) return;
    if (slot === undefined && !item) return;
    if (file.size > 15 * 1024 * 1024) throw new Error("Envie arquivos com até 15 MB.");
    const query = new URLSearchParams({ comparativoId: cmp.id, ...(slot === undefined ? { itemId: item!.id } : { slot: String(slot), titulo: attachmentTitles[slot] }) });
    const response = await fetch(`/api/comparativos/anexos?${query}`, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream", "x-file-name": encodeURIComponent(file.name), "x-file-size": String(file.size) }, body: file });
    const json = await response.json(); if (!response.ok || !json.ok) throw new Error(json.error || "Erro ao anexar.");
    await load(); setDirty(false);
    if (slot === undefined) {
      try { await request("/api/comparativos/planos/extrair", { itemId: item!.id }); }
      finally { await load(); }
      setMessage("Plano extraído. Confira os valores e as condições antes de aprovar.");
    } else setMessage("Anexo de crédito salvo.");
  }
  async function savePlan(approve: boolean, next = false) {
    if (!item) return;
    const safe = validarPlano(plan);
    await request("/api/comparativos/planos/salvar", { itemId: item.id, revisao: item.revisao, plano: safe, aprovar: approve });
    const c = await load(); setDirty(false); setMessage(approve ? "Proposta aprovada." : "Rascunho salvo.");
    if (next) { if (index < c.items.length - 1) { activeIndex.current = index + 1; setIndex(index + 1); const i = c.items[index + 1]; setPlan(i.planoRascunho ?? i.planoPagamento ?? { ...PLANO_VAZIO, empreendimento: i.tipologia.empreendimento.name }); } else setStep(2); }
  }
  async function deleteAttachment(a: Anexo) {
    const response = await fetch("/api/comparativos/anexos", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: a.id }) });
    const json = await response.json(); if (!response.ok) throw new Error(json.error); await load();
  }
  async function saveTitle(a: Anexo, titulo: string) {
    const response = await fetch("/api/comparativos/anexos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: a.id, titulo }) });
    const json = await response.json(); if (!response.ok) throw new Error(json.error); await load(); setMessage("Título do anexo salvo.");
  }
  if (!cmp) return <div className="p-6">{error || "Carregando comparativo…"}</div>;
  const alerts = item ? alertasPlano(plan, item.tipologia.empreendimento.name, cmp.clienteNome) : [];
  const approved = cmp.items.filter(i => i.estadoExtracao === "APROVADO").length;
  return <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
    <div className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-semibold">{cmp.titulo}</h1><p className="text-sm text-gray-500">{cmp.clienteNome} · Direcionamento · {approved}/{cmp.items.length} opções aprovadas</p></div><Link href="/admin/comparativos" className="border rounded-lg px-3 py-2">Voltar à lista</Link></div>
    <div className="grid grid-cols-3 gap-2">{["Selecionar opções", "Anexar e revisar", "Preparar reunião"].map((name, n) => <button key={name} disabled={busy || (n > 0 && !cmp.items.length)} onClick={() => navigate(n)} className={`rounded-lg border p-3 text-sm disabled:opacity-50 ${step === n ? "bg-black text-white" : "bg-white"}`}>{n + 1}. {name}</button>)}</div>
    {error && <div role="alert" className="p-3 rounded-lg bg-red-50 text-red-800">{error}</div>}
    {message && <div role="status" className="p-3 rounded-lg bg-green-50 text-green-800">{message}</div>}
    {busy && <p role="status" className="text-sm text-blue-700">Processando… A leitura do plano pode levar alguns instantes. Aguarde nesta tela.</p>}
    {step === 0 && <section className="bg-white border rounded-xl p-4 space-y-4">
      <div className="grid sm:grid-cols-2 gap-3"><label className="text-sm">Título do comparativo<input disabled={busy} className={inputClass} value={title} onChange={e => { setTitle(e.target.value); setDirty(true); }} /></label><label className="text-sm">Nome digitável do cliente<input disabled={busy} className={inputClass} value={customer} onChange={e => { setCustomer(e.target.value); setDirty(true); }} /></label></div>
      {dirty && <button disabled={busy} className="border rounded-lg px-3 py-2" onClick={() => run(async () => { await request("/api/comparativos/update", { id, titulo: title, clienteNome: customer, showGeral: cmp.showGeral ?? true, showEntrada: cmp.showEntrada ?? true, showFinanciamento: cmp.showFinanciamento ?? true }); await load(); setDirty(false); setMessage("Identificação do comparativo salva."); })}>Salvar identificação</button>}
      <h2 className="font-semibold">Escolha as opções para comparar</h2><p className="text-sm text-gray-500">Selecione a tipologia do cadastro. Você pode repetir o empreendimento para comparar unidades ou condições diferentes.</p>
      <div className="flex gap-2"><input aria-label="Buscar empreendimento" className={inputClass} value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === "Enter") document.getElementById("buscar-opcoes")?.click(); }} placeholder="Empreendimento, bairro ou cidade" /><button id="buscar-opcoes" disabled={busy || searching} className="border rounded-lg px-4" onClick={async () => { setSearching(true); try { const r = await fetch(`/api/comparativos/tipologias/search?q=${encodeURIComponent(q)}`); const j = await r.json(); if (!r.ok) throw new Error(j.error); setResults(j.tipologias ?? []); } catch (e) { setError((e as Error).message); } finally { setSearching(false); } }}>{searching ? "Buscando…" : "Buscar"}</button></div>
      {results.map(t => <div key={t.id} className="flex justify-between gap-3 border rounded-lg p-3"><div><b>{t.empreendimento.name}</b><p className="text-sm">{t.nome} · {t.areaPrivativa ?? t.areaTerreno ?? "—"} m² · {t.vagas ?? "—"} vaga(s)</p></div><button disabled={busy || dirty} className="border rounded-lg px-3" onClick={() => run(async () => { await request("/api/comparativos/items/add", { comparativoId: id, tipologiaId: t.id }); await load(); })}>Adicionar opção</button></div>)}
      <div className="space-y-2">{cmp.items.map((i, n) => <div key={i.id} className="flex justify-between items-center border rounded-lg p-3"><span>{n + 1}. {i.tipologia.empreendimento.name} · {i.tipologia.nome}</span><button disabled={busy || dirty} className="text-sm text-red-700" onClick={() => { if (confirm("Remover esta opção?")) run(async () => { await request("/api/comparativos/items/remove", { itemId: i.id }); setIndex(0); activeIndex.current = 0; await load(); }); }}>Remover</button></div>)}</div>
      <button disabled={busy || dirty || !cmp.items.length} onClick={() => navigate(1, 0)} className="bg-black text-white rounded-lg px-4 py-2 disabled:opacity-50">Continuar para os planos</button>
    </section>}
    {step === 1 && item && <section className="space-y-4">
      <div className="flex flex-wrap gap-2">{cmp.items.map((i, n) => <button key={i.id} disabled={busy} onClick={() => navigate(1, n)} className={`border rounded-lg px-3 py-2 text-sm ${index === n ? "bg-black text-white" : "bg-white"}`}>{n + 1}. {i.tipologia.empreendimento.name}{i.estadoExtracao === "APROVADO" ? " ✓" : ""}</button>)}</div>
      <div className="bg-white border rounded-xl p-4 space-y-4">
        <div><h2 className="text-lg font-semibold">{item.tipologia.empreendimento.name}</h2><p className="text-sm text-gray-500">{item.tipologia.nome} · {item.tipologia.areaPrivativa ?? item.tipologia.areaTerreno ?? "—"} m² · {item.tipologia.vagas ?? "—"} vaga(s) no cadastro</p></div>
        <label className="block border border-dashed rounded-lg p-4"><span className="block font-medium mb-2">Anexar plano e preencher com IA</span><input aria-label="Anexar plano de pagamento" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" disabled={busy} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file && (!dirty || confirm("Substituir o anexo e gerar um novo rascunho? As alterações não salvas serão descartadas."))) run(() => upload(file)); }} /><p className="text-xs text-gray-500 mt-2">PDF com até 10 páginas ou imagem · até 15 MB. Também é possível preencher manualmente.</p></label>
        {item.anexos.map(a => <div key={a.id} className="flex flex-wrap gap-3 items-center text-sm"><a href={`/api/comparativos/anexos?id=${a.id}`} target="_blank" rel="noreferrer" className="underline">Ver original: {a.nomeOriginal}</a><button disabled={busy || dirty} className="border rounded px-3 py-1" onClick={() => run(async () => { try { await request("/api/comparativos/planos/extrair", { itemId: item.id }); } finally { await load(); } })}>Extrair novamente</button></div>)}
        {alerts.length > 0 && <div className="bg-amber-50 rounded-lg p-3 text-sm"><b>Confira antes de aprovar</b><ul className="list-disc ml-5 mt-2">{alerts.map((a, n) => <li key={n}>{a}</li>)}</ul></div>}
        <fieldset disabled={busy} className="space-y-4">
          <div className="grid md:grid-cols-2 gap-3">{([['titulo', 'Título da opção'], ['unidade', 'Bloco, unidade e andar'], ['empreendimento', 'Empreendimento no documento']] as const).map(([key, label]) => <label key={key} className="text-sm space-y-1"><span>{label}</span><input className={inputClass} value={plan[key]} onChange={e => change(key, e.target.value)} /></label>)}<NumberField label="Vagas da unidade (se informadas)" integer value={plan.vagas} onChange={v => change("vagas", v)} /><label className="text-sm space-y-1"><span>Varanda da unidade</span><select className={inputClass} value={plan.varanda === null ? "" : String(plan.varanda)} onChange={e => change("varanda", e.target.value === "" ? null : e.target.value === "true")}><option value="">Não informada</option><option value="true">Com varanda</option><option value="false">Sem varanda</option></select></label></div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{Object.entries(numericFields).map(([key, label]) => <div key={key} className="space-y-1"><NumberField label={`${plan.rotulos?.[key as keyof typeof numericFields] || label} (R$)`} value={plan[key as keyof typeof numericFields] ?? null} onChange={v => change(key as keyof typeof numericFields, v)} /><input aria-label={`Nome original de ${label}`} className="w-full border rounded px-2 py-1 text-xs" placeholder="Nome do campo no documento" value={plan.rotulos?.[key as keyof typeof numericFields] ?? ""} onChange={e => change("rotulos", { ...plan.rotulos, [key]: e.target.value })} /></div>)}</div>
          <h3 className="font-semibold">Pagamentos à construtora</h3>
          {plan.grupos.map((g, n) => <div key={n} className="border rounded-xl p-3 space-y-3"><div className="flex justify-between items-center"><b>Grupo {n + 1}</b><button className="text-sm text-red-700" onClick={() => change("grupos", plan.grupos.filter((_, i) => i !== n))}>Remover grupo</button></div>
            <div className="grid sm:grid-cols-2 gap-3"><label className="text-sm">Tipo<select className={inputClass} value={g.tipo} onChange={e => changeGroup(n, { tipo: e.target.value as GrupoPagamento["tipo"] })}>{TIPOS_GRUPO.map(t => <option key={t} value={t}>{groupNames[t]}</option>)}</select></label><label className="text-sm">Título<input className={inputClass} value={g.titulo} onChange={e => changeGroup(n, { titulo: e.target.value })} /></label></div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3"><NumberField label="Quantidade" integer value={g.quantidade} onChange={v => changeGroup(n, { quantidade: v })} /><NumberField label="Primeira / parcela (R$)" value={g.primeiraParcela} onChange={v => changeGroup(n, { primeiraParcela: v })} /><NumberField label="Última parcela (R$)" value={g.ultimaParcela} onChange={v => changeGroup(n, { ultimaParcela: v })} /><NumberField label="Total informado (R$)" value={g.totalInformado} onChange={v => changeGroup(n, { totalInformado: v })} /></div>
            <div className="grid sm:grid-cols-3 gap-3"><label className="text-sm">Variação<select className={inputClass} value={g.variacao} onChange={e => changeGroup(n, { variacao: e.target.value as GrupoPagamento["variacao"] })}><option value="fixa">Fixa</option><option value="decrescente">Decrescente</option><option value="variavel">Variável</option><option value="nao_informada">Não informada</option></select></label>{(['inicio', 'fim'] as const).map(k => <label className="text-sm" key={k}>{k === "inicio" ? "Início" : "Fim"}<input type="date" className={inputClass} value={g[k] ?? ""} onChange={e => changeGroup(n, { [k]: e.target.value || null })} /></label>)}</div>
            <label className="block text-sm">Texto que aparece na reunião<textarea className={inputClass} rows={2} value={g.resumo} placeholder="Ex.: 48 parcelas decrescentes, primeira de R$ … e última de R$ …" onChange={e => changeGroup(n, { resumo: e.target.value })} /></label>{g.pagina && <p className="text-xs text-gray-500">Extraído da página {g.pagina} do anexo.</p>}
          </div>)}
          <button className="border rounded-lg px-3 py-2" onClick={() => change("grupos", [...plan.grupos, { tipo: "outros", titulo: "Outros pagamentos", quantidade: null, primeiraParcela: null, ultimaParcela: null, totalInformado: null, inicio: null, fim: null, variacao: "nao_informada", resumo: "", pagina: null }])}>Adicionar grupo de pagamentos</button>
          {(['descontos', 'condicoes', 'validade'] as const).map(key => <label key={key} className="block text-sm">{key === "descontos" ? "Descontos e benefícios condicionais" : key === "condicoes" ? "Condições, correção e observações" : "Validade da proposta"}<textarea className={inputClass} value={plan[key]} rows={2} onChange={e => change(key, e.target.value)} /></label>)}
          <h3 className="font-semibold">Linhas do documento e informações adicionais</h3>
          <p className="text-sm text-gray-500">Nomes próprios da construtora e valores sem classificação ficam aqui para sua revisão. Marque o que deve aparecer na reunião. Estas linhas não entram novamente no cálculo dos totais.</p>
          {plan.extras.map((e, n) => <div key={n} className="border rounded-lg p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={e.exibir !== false} onChange={event => change("extras", plan.extras.map((v, i) => i === n ? { ...v, exibir: event.target.checked } : v))} />Mostrar no comparativo</label><button className="text-sm text-red-700" onClick={() => change("extras", plan.extras.filter((_, i) => i !== n))}>Excluir linha</button></div>
            <label className="block text-sm">Nome da parcela ou benefício<input aria-label={`Título adicional ${n + 1}`} className={inputClass} value={e.titulo} placeholder="Nome original do documento" onChange={event => change("extras", plan.extras.map((v, i) => i === n ? { ...v, titulo: event.target.value } : v))} /></label>
            <label className="block text-sm">Valor, quantidade e condições<textarea aria-label={`Valor adicional ${n + 1}`} rows={2} className={inputClass} value={e.valor} placeholder="Texto editável com as informações do arquivo" onChange={event => change("extras", plan.extras.map((v, i) => i === n ? { ...v, valor: event.target.value } : v))} /></label>
            <label className="block text-sm">Datas ou vencimentos<textarea aria-label={`Datas adicionais ${n + 1}`} rows={2} className={inputClass} value={e.datas ?? ""} placeholder="Ex.: R$ 2.550,00 em 08/12/2026 e 08/08/2027" onChange={event => change("extras", plan.extras.map((v, i) => i === n ? { ...v, datas: event.target.value } : v))} /></label>
            {(e.nomeOriginal || e.pagina) && <p className="text-xs text-gray-500">{e.nomeOriginal ? `Nome no arquivo: ${e.nomeOriginal}` : ""}{e.pagina ? ` · Página ${e.pagina}` : ""}</p>}
          </div>)}
          <button className="border rounded-lg px-3 py-2" onClick={() => change("extras", [...plan.extras, { titulo: "", valor: "", nomeOriginal: "", datas: "", pagina: null, exibir: true }])}>Adicionar linha livre</button>
        </fieldset>
        <div className="flex flex-wrap gap-3 border-t pt-4"><button disabled={busy} className="border rounded-lg px-4 py-2" onClick={() => run(() => savePlan(false))}>Salvar rascunho</button><button disabled={busy} className="bg-black text-white rounded-lg px-4 py-2" onClick={() => run(() => savePlan(true, true))}>Aprovar e {index < cmp.items.length - 1 ? "ir para a próxima" : "preparar reunião"}</button></div>
      </div>
    </section>}
    {step === 2 && <section className="bg-white border rounded-xl p-4 space-y-5">
      <div><h2 className="text-lg font-semibold">Crédito e pauta da reunião</h2><p className="text-sm text-gray-500">Campos e documentos opcionais. O comparativo pode ser avulso, sem vínculo com o CRM.</p></div>
      <fieldset disabled={busy} className="grid sm:grid-cols-2 gap-3">{([['valorAprovado', 'Valor aprovado (R$)'], ['parcela', 'Parcela informada (R$)'], ['recursosProprios', 'Recursos próprios (R$)'], ['fgts', 'FGTS (R$)']] as const).map(([key, label]) => <NumberField key={key} label={label} value={credit[key]} onChange={v => { setCredit(c => ({ ...c, [key]: v })); setDirty(true); }} />)}</fieldset>
      <label className="block text-sm">Observações sobre crédito e capacidade de pagamento<textarea disabled={busy} className={inputClass} rows={3} value={credit.observacoes} onChange={e => { setCredit(c => ({ ...c, observacoes: e.target.value })); setDirty(true); }} /></label>
      <label className="block text-sm">Direcionamento e próximos passos<textarea disabled={busy} className={inputClass} rows={3} value={credit.proximosPassos} onChange={e => { setCredit(c => ({ ...c, proximosPassos: e.target.value })); setDirty(true); }} /></label>
      <button disabled={busy} className="border rounded-lg px-4 py-2" onClick={() => run(async () => { await request("/api/comparativos/credito", { id, revisao: cmp.revisao, resumoCredito: credit }); await load(); setDirty(false); setMessage("Resumo da reunião salvo."); })}>Salvar resumo da reunião</button>
      <div className="grid sm:grid-cols-2 gap-4">{[0, 1].map(slot => { const a = cmp.anexos.find(x => x.escopo === `credito:${slot}`); return <div key={slot} className="border rounded-lg p-3 space-y-3"><label className="block text-sm">Título do anexo {slot + 1}<input disabled={busy} className={inputClass} value={attachmentTitles[slot]} onChange={e => setAttachmentTitles(t => t.map((v, n) => n === slot ? e.target.value : v))} /></label>{a && <div className="flex flex-wrap gap-3 text-sm"><a className="underline" target="_blank" rel="noreferrer" href={`/api/comparativos/anexos?id=${a.id}`}>{a.nomeOriginal}</a>{attachmentTitles[slot] !== a.titulo && <button disabled={busy || dirty} className="underline" onClick={() => run(() => saveTitle(a, attachmentTitles[slot]))}>Salvar título</button>}<button disabled={busy} className="text-red-700" onClick={() => run(() => deleteAttachment(a))}>Remover</button></div>}<input aria-label={`Anexo geral ${slot + 1}`} disabled={busy || dirty} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) run(() => upload(file, slot)); }} />{dirty && <p className="text-xs text-gray-500">Salve o resumo antes de anexar.</p>}</div>; })}</div>
      {approved !== cmp.items.length && <p className="text-amber-800">Há opções pendentes de aprovação. Revise-as antes de finalizar.</p>}
      <div className="border-t pt-4"><button disabled={busy || dirty || approved !== cmp.items.length || !cmp.items.length} className="bg-black text-white rounded-lg px-4 py-2 disabled:opacity-50" onClick={() => { window.location.href = `/admin/comparativos/${id}/finalizar`; }}>Escolher campos e finalizar apresentação</button>{dirty && <p className="text-sm text-gray-500 mt-2">Salve suas alterações para continuar.</p>}</div>
    </section>}
  </div>;
}
