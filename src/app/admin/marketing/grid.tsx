"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { purposes } from "@/lib/marketing/policy";
export const columns = { name: "Campanha", broker: "Corretor", account: "Conta", purpose: "Finalidade", status: "Status Meta", metaSpend: "Gasto Meta", effectiveSpend: "Gasto efetivo", increment: "Acréscimo operacional", leads: "Conversas", cplMeta: "CPL Meta", cplEffective: "CPL efetivo", impressions: "Impressões", clicks: "Cliques", linkClicks: "Cliques no link", cpc: "CPC Meta", cpm: "CPM Meta" };
type Column = keyof typeof columns;
const defaults: Column[] = ["name", "broker", "account", "metaSpend", "effectiveSpend", "leads", "cplMeta"];
const presets: Record<string, Column[]> = { "Gestão diária": ["name", "broker", "metaSpend", "effectiveSpend", "leads", "cplMeta"], "Aquisição": ["name", "broker", "impressions", "clicks", "leads", "metaSpend", "cplMeta"], "Financeiro": ["name", "broker", "metaSpend", "increment", "effectiveSpend"], "Completa": Object.keys(columns) as Column[] };
export type GridRow = { id: string; currency: string; name: string; broker: string; account: string; purpose: keyof typeof purposes; status: string | null; metaSpend: string; effectiveSpend: string; increment: string; leads: number; cplMeta: string | null; cplEffective: string | null; impressions: string | null; clicks: string | null; linkClicks: string | null; cpc: string | null; cpm: string | null };
export function CampaignGrid({ rows, preferenceKey }: { rows: GridRow[]; preferenceKey: string }) {
  const [selected, setSelected] = useState<Column[]>(defaults), [preset, setPreset] = useState("Padrão"), [open, setOpen] = useState(false);
  const key = `flyimob:marketing:grid:v1:${preferenceKey}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null");
      if (saved && Array.isArray(saved.columns) && saved.columns.length > 0 && saved.columns.length <= 16 && new Set(saved.columns).size === saved.columns.length && saved.columns.every((c: unknown) => typeof c === "string" && Object.hasOwn(columns, c))) {
        setSelected(saved.columns); setPreset(typeof saved.preset === "string" && saved.preset.length < 40 ? saved.preset : "Personalizada");
      }
    } catch { /* Storage may be disabled; grid stays usable. */ }
  }, [key]);
  function save(next: Column[], name = "Personalizada") {
    if (!next.length) return; setSelected(next); setPreset(name);
    try { localStorage.setItem(key, JSON.stringify({ columns: next, preset: name })); } catch { /* no business data persisted */ }
  }
  function move(index: number, direction: number) { const next = [...selected]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; save(next); }
  const monetary = new Set(["metaSpend", "effectiveSpend", "increment", "cplMeta", "cplEffective", "cpc", "cpm"]);
  function value(row: GridRow, column: Column) {
    const value = row[column]; if (value === null) return "—";
    if (column === "name") return <Link className="text-teal-700 underline" href={`/admin/marketing/campanhas?q=${encodeURIComponent(row.name)}`}>{row.name}</Link>;
    if (column === "purpose") return purposes[row.purpose];
    if (monetary.has(column)) { const [whole, cents] = String(value).split("."); return `${row.currency} ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${cents}`; }
    return String(value);
  }
  return <section className="rounded-xl border bg-white p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Campanhas no período</h3><div className="flex gap-2"><select aria-label="Visualização de colunas" value={preset} onChange={e => save(presets[e.target.value] ?? defaults, e.target.value)} className="rounded border p-2 text-sm"><option>Padrão</option>{Object.keys(presets).map(p => <option key={p}>{p}</option>)}{preset === "Personalizada" && <option>Personalizada</option>}</select><button className="rounded border p-2 text-sm" onClick={() => setOpen(!open)}>⚙ Colunas</button></div></div>
    {open && <div className="mb-5 rounded border bg-slate-50 p-4"><p className="mb-3 text-xs text-slate-500">Preferência deste usuário neste navegador. CPL Meta = gasto Meta / conversas.</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{(Object.keys(columns) as Column[]).map(c => <label key={c} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(c)} disabled={selected.length === 1 && selected[0] === c} onChange={e => save(e.target.checked ? [...selected, c] : selected.filter(x => x !== c))} />{columns[c]}</label>)}</div><ol className="my-4 flex flex-wrap gap-3">{selected.map((c, i) => <li key={c} className="rounded border bg-white p-2 text-xs">{columns[c]} <button disabled={!i} aria-label={`Mover ${columns[c]} para esquerda`} onClick={() => move(i, -1)}>←</button> <button disabled={i === selected.length - 1} aria-label={`Mover ${columns[c]} para direita`} onClick={() => move(i, 1)}>→</button></li>)}</ol><button className="rounded border p-2 text-sm" onClick={() => save(defaults, "Padrão")}>Restaurar padrão</button></div>}
    {!rows.length ? <p className="text-sm text-slate-500">Nenhuma campanha com métricas confirmadas.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm [&_th]:whitespace-nowrap [&_th]:p-3 [&_td]:p-3 [&_tr]:border-b"><thead><tr>{selected.map(c => <th key={c}>{columns[c]}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={`${row.id}:${row.currency}`}>{selected.map(c => <td key={c}>{value(row, c)}</td>)}</tr>)}</tbody></table></div>}
  </section>;
}
