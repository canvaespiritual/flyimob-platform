"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

/* =======================
   TIPOS
======================= */

type TipologiaSearchItem = {
  id: string;
  nome: string | null;
  precoInicial: number | null;
  areaPrivativa: number | null;
  areaTerreno: number | null;
  empreendimento: {
    id: string;
    name: string;
    bairro: string | null;
    cidade: string | null;
    dataEntrega: string | null;
    construtoraNome: string | null;
  };
};

type ComparativoItem = {
  id: string;
  ordem: number;

  valorTotal: number | null;
  entradaTotal: number | null;
  sinalEntrada: number | null;
  parcelaEntrada: number | null;
  parcelasEntradaQtd: number | null;

  parcelasIntermediarias: string | null;
  parcelasAnuais: string | null;
  parcelaUnica: string | null;
  parcelaEspecial: string | null;

  saldoFinanciamento: number | null;
  parcelaFinanciamento: number | null;
  taxaJuros: number | null;
  rendaBrutaFamiliar: number | null;

  fgts: number | null;
  subsidioFederal: number | null;
  subsidioEstadual: number | null;
  subsidioMunicipal: number | null;

  estimativaDocumentacao: number | null;
  observacao: string | null;

  tipologia: any;
};

type Comparativo = {
  id: string;
  titulo: string;
  clienteNome: string;
  slugPublico: string;
  showGeral: boolean;
  showEntrada: boolean;
  showFinanciamento: boolean;
  items: ComparativoItem[];
};

/* =======================
   HELPERS
======================= */

function money(n: number | null | undefined) {
  if (n === null || n === undefined) return "-";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseBRL(input: string): number | null {
  const s = input
    .replaceAll("R$", "")
    .replaceAll(" ", "")
    .replaceAll(".", "")
    .replaceAll(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function monthsUntil(dateStr?: string | null) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  return Math.max(
    0,
    (d.getFullYear() - now.getFullYear()) * 12 +
      (d.getMonth() - now.getMonth())
  );
}

function calcPrecoM2(valor: number | null, area: number | null) {
  if (!valor || !area) return null;
  return valor / area;
}

function shallowItemPayload(it: ComparativoItem) {
  // payload enxuto (evita mandar tipologia gigante)
  return {
    itemId: it.id,

    valorTotal: it.valorTotal,
    entradaTotal: it.entradaTotal,
    sinalEntrada: it.sinalEntrada,
    parcelaEntrada: it.parcelaEntrada,
    parcelasEntradaQtd: it.parcelasEntradaQtd,

    parcelasIntermediarias: it.parcelasIntermediarias,
    parcelasAnuais: it.parcelasAnuais,
    parcelaUnica: it.parcelaUnica,
    parcelaEspecial: it.parcelaEspecial,

    saldoFinanciamento: it.saldoFinanciamento,
    parcelaFinanciamento: it.parcelaFinanciamento,
    taxaJuros: it.taxaJuros,
    rendaBrutaFamiliar: it.rendaBrutaFamiliar,

    fgts: it.fgts,
    subsidioFederal: it.subsidioFederal,
    subsidioEstadual: it.subsidioEstadual,
    subsidioMunicipal: it.subsidioMunicipal,

    estimativaDocumentacao: it.estimativaDocumentacao,
    observacao: it.observacao,
  };
}

/* =======================
   COMPONENTE
======================= */

export default function ComparativoEditorPage() {
  const params = useParams();
  const id = params?.id as string | undefined;

  if (!id) return <div className="p-6 text-sm text-gray-500">Carregando rota…</div>;

  const [cmp, setCmp] = useState<Comparativo | null>(null);
  const [loading, setLoading] = useState(true);

  // meta save
  const [savingMeta, setSavingMeta] = useState(false);

  // item editing
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);

  // picker
  const [showPicker, setShowPicker] = useState(false);
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<TipologiaSearchItem[]>([]);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/comparativos/get?id=${id}`);
    const json = await res.json();
    setCmp(json.comparativo ?? null);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [id]);

  function setCmpField<K extends keyof Comparativo>(field: K, value: Comparativo[K]) {
    if (!cmp) return;
    setCmp({ ...cmp, [field]: value });
  }

  function setItemField<K extends keyof ComparativoItem>(
    itemId: string,
    field: K,
    value: ComparativoItem[K]
  ) {
    if (!cmp) return;
    setCmp({
      ...cmp,
      items: cmp.items.map((it) => (it.id === itemId ? { ...it, [field]: value } : it)),
    });
  }

  async function saveMeta() {
    if (!cmp) return;
    setSavingMeta(true);
    const res = await fetch("/api/comparativos/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: cmp.id,
        titulo: cmp.titulo,
        clienteNome: cmp.clienteNome,
        showGeral: cmp.showGeral,
        showEntrada: cmp.showEntrada,
        showFinanciamento: cmp.showFinanciamento,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setSavingMeta(false);
    if (!json.ok) alert(json.error || "Erro ao salvar comparativo.");
    else await load();
  }

  async function saveItem(itemId: string) {
    if (!cmp) return;
    const it = cmp.items.find((x) => x.id === itemId);
    if (!it) return;

    setSavingItemId(itemId);
    const res = await fetch("/api/comparativos/items/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(shallowItemPayload(it)),
    });
    const json = await res.json().catch(() => ({}));
    setSavingItemId(null);

    if (!json.ok) {
      alert(json.error || "Erro ao salvar item.");
      return;
    }

    await load();
    setEditingItemId(null); // fecha editor do item e volta para lista resumida
  }

  async function removeItem(itemId: string) {
    if (!confirm("Remover este item do comparativo?")) return;
    await fetch("/api/comparativos/items/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId }),
    });
    if (editingItemId === itemId) setEditingItemId(null);
    await load();
  }

  async function move(itemId: string, direction: "up" | "down") {
    await fetch("/api/comparativos/items/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, direction }),
    });
    await load();
  }

  async function searchTipologias() {
    setSearching(true);
    const res = await fetch(`/api/comparativos/tipologias/search?q=${encodeURIComponent(q)}`);
    const json = await res.json();
    setResults(json.tipologias ?? []);
    setSearching(false);
  }

  async function addItem(tipologiaId: string) {
    if (!cmp) return;
    const res = await fetch("/api/comparativos/items/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comparativoId: cmp.id, tipologiaId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!json.ok) {
      alert(json.error || "Erro ao adicionar item.");
      return;
    }

    setShowPicker(false);
    setQ("");
    setResults([]);
    await load();

    // abre para editar o item recém-criado (vem em json.item.id no nosso endpoint)
    const newId = json?.item?.id as string | undefined;
    if (newId) setEditingItemId(newId);
  }

  // Duplicar sem endpoint novo: cria novo item com a mesma tipologia e copia campos
  async function duplicateItem(itemId: string) {
    if (!cmp) return;
    const original = cmp.items.find((x) => x.id === itemId);
    if (!original) return;

    const tipologiaId = original.tipologia?.id;
    if (!tipologiaId) {
      alert("Tipologia do item não encontrada.");
      return;
    }

    const res = await fetch("/api/comparativos/items/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comparativoId: cmp.id, tipologiaId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!json.ok) {
      alert(json.error || "Erro ao duplicar item.");
      return;
    }

    const newId = json?.item?.id as string | undefined;
    if (!newId) return;

    // copia campos do original para o novo
    await fetch("/api/comparativos/items/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...shallowItemPayload(original),
        itemId: newId,
      }),
    });

    await load();
    setEditingItemId(newId);
  }

  const enriched = useMemo(() => {
    if (!cmp) return [];
    const itemsSorted = [...cmp.items].sort((a, b) => a.ordem - b.ordem);
    return itemsSorted.map((it) => {
      const t = it.tipologia;
      const emp = t?.empreendimento;

      const entregaMeses = monthsUntil(emp?.dataEntrega);

      const valorBase = it.valorTotal ?? t?.precoInicial ?? null;
      const area = t?.areaPrivativa ?? t?.areaTerreno ?? null;
      const precoM2 = calcPrecoM2(valorBase, area);

      // sugestão automática (não força salvar)
      const saldoSug = valorBase && it.entradaTotal ? valorBase - it.entradaTotal : null;

      return { it, t, emp, entregaMeses, valorBase, precoM2, saldoSug };
    });
  }, [cmp]);

  if (loading) return <div className="p-6">Carregando…</div>;
  if (!cmp) return <div className="p-6">Comparativo não encontrado.</div>;

  return (
    <div className="p-6 space-y-6">
      {/* TOPO */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Editar comparativo</h1>
        <div className="flex gap-2">
          <button
            onClick={() =>
              navigator.clipboard.writeText(`${window.location.origin}/c/${cmp.slugPublico}`)
            }
            className="border px-3 py-2 rounded"
          >
            Copiar link
          </button>
          <Link
  href={`/admin/comparativos/${cmp.id}/finalizar`}
  className="border px-4 py-2 rounded bg-black text-white"
>
  Finalizar comparativo
</Link>

          <Link href="/admin/comparativos" className="border px-3 py-2 rounded">
            Voltar
          </Link>
        </div>
      </div>

      {/* META */}
      <div className="border rounded p-4 space-y-3 bg-white">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            className="border rounded px-3 py-2"
            value={cmp.titulo}
            onChange={(e) => setCmpField("titulo", e.target.value)}
            placeholder="Título"
          />
          <input
            className="border rounded px-3 py-2"
            value={cmp.clienteNome}
            onChange={(e) => setCmpField("clienteNome", e.target.value)}
            placeholder="Cliente"
          />
        </div>

        <div className="flex flex-wrap gap-4 items-center text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={cmp.showGeral}
              onChange={(e) => setCmpField("showGeral", e.target.checked)}
            />
            Geral
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={cmp.showEntrada}
              onChange={(e) => setCmpField("showEntrada", e.target.checked)}
            />
            Entrada
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={cmp.showFinanciamento}
              onChange={(e) => setCmpField("showFinanciamento", e.target.checked)}
            />
            Financiamento
          </label>

          <button
            onClick={saveMeta}
            disabled={savingMeta}
            className="ml-auto bg-black text-white px-4 py-2 rounded"
          >
            {savingMeta ? "Salvando..." : "Salvar comparativo"}
          </button>
        </div>
      </div>

      {/* ITENS HEADER */}
      <div className="border rounded bg-white">
        <div className="p-4 flex justify-between items-center">
          <div>
            <h2 className="font-medium">Itens do comparativo</h2>
            <p className="text-sm text-gray-500">
              Adicione 2+ itens para comparar (cada item = uma tipologia)
            </p>
          </div>

          <button
            onClick={() => setShowPicker(true)}
            className="bg-black text-white px-4 py-2 rounded"
          >
            Adicionar item
          </button>
        </div>

        {/* LISTA / EDITOR */}
        {enriched.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">Nenhum item ainda.</div>
        ) : (
          <div className="divide-y">
            {enriched.map(({ it, emp, t, entregaMeses, valorBase, precoM2, saldoSug }, idx) => {
              const isEditing = editingItemId === it.id;

              return (
                <div key={it.id} className="p-4">
                  {/* CARD RESUMO */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {emp?.name} — {t?.nome ?? "Tipologia"}
                      </div>
                      <div className="text-sm text-gray-500 truncate">
                        {emp?.bairro ?? "-"} • {emp?.cidade ?? "-"}
                        {emp?.construtora?.name ? ` • ${emp?.construtora?.name}` : ""}
                      </div>

                      <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                        <Info label="Valor">{money(valorBase)}</Info>
                        <Info label="Entrada">{money(it.entradaTotal)}</Info>
                        <Info label="Sinal">{money(it.sinalEntrada)}</Info>
                        <Info label="Parc. Fin.">{money(it.parcelaFinanciamento)}</Info>
                        <Info label="Entrega">
                          {entregaMeses ? `em ${entregaMeses} meses` : "-"}
                        </Info>
                        <Info label="Preço/m²">{precoM2 ? money(precoM2) : "-"}</Info>
                        <Info label="Saldo">{money(it.saldoFinanciamento ?? saldoSug)}</Info>
                        <Info label="Subsídio Fed">{money(it.subsidioFederal)}</Info>
                      </div>
                    </div>

                    {/* ACTIONS */}
                    <div className="flex flex-col gap-2 text-sm">
                      <button
                        onClick={() => setEditingItemId(isEditing ? null : it.id)}
                        className="border px-3 py-1 rounded"
                      >
                        {isEditing ? "Fechar" : "Editar"}
                      </button>

                      <button
                        onClick={() => duplicateItem(it.id)}
                        className="border px-3 py-1 rounded"
                      >
                        Duplicar
                      </button>

                      <button
                        onClick={() => removeItem(it.id)}
                        className="border px-3 py-1 rounded text-red-600"
                      >
                        Remover
                      </button>

                      <div className="flex gap-2">
                        <button
                          onClick={() => move(it.id, "up")}
                          disabled={idx === 0}
                          className="border px-3 py-1 rounded disabled:opacity-40"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => move(it.id, "down")}
                          disabled={idx === enriched.length - 1}
                          className="border px-3 py-1 rounded disabled:opacity-40"
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* EDITOR DO ITEM */}
                  {isEditing && (
                    <div className="mt-4 border rounded p-4 bg-gray-50 space-y-4">
                      {cmp.showGeral && (
                        <section>
                          <h3 className="font-medium mb-2">Geral</h3>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                            <Info label="Entrega">
                              {entregaMeses ? `em ${entregaMeses} meses` : "-"}
                            </Info>
                            <Info label="Preço/m²">{precoM2 ? money(precoM2) : "-"}</Info>
                          </div>
                        </section>
                      )}

                      {cmp.showEntrada && (
                        <section>
                          <h3 className="font-medium mb-2">Entrada / Condições</h3>
                          <Grid>
                            <MoneyInput label="Valor total" value={it.valorTotal} placeholder={money(t?.precoInicial)} onChange={(v) => setItemField(it.id, "valorTotal", v)} />
                            <MoneyInput label="Entrada total" value={it.entradaTotal} onChange={(v) => setItemField(it.id, "entradaTotal", v)} />
                            <MoneyInput label="Sinal" value={it.sinalEntrada} onChange={(v) => setItemField(it.id, "sinalEntrada", v)} />
                            <MoneyInput label="Parcela entrada" value={it.parcelaEntrada} onChange={(v) => setItemField(it.id, "parcelaEntrada", v)} />
                            <NumberInput label="Qtd parcelas entrada" value={it.parcelasEntradaQtd} onChange={(v) => setItemField(it.id, "parcelasEntradaQtd", v)} />
                            <TextInput label="Parcelas intermediárias" value={it.parcelasIntermediarias} onChange={(v) => setItemField(it.id, "parcelasIntermediarias", v)} />
                            <TextInput label="Parcelas anuais" value={it.parcelasAnuais} onChange={(v) => setItemField(it.id, "parcelasAnuais", v)} />
                            <TextInput label="Parcela única" value={it.parcelaUnica} onChange={(v) => setItemField(it.id, "parcelaUnica", v)} />
                            <TextInput label="Parcela especial" value={it.parcelaEspecial} onChange={(v) => setItemField(it.id, "parcelaEspecial", v)} />
                          </Grid>
                        </section>
                      )}

                      {cmp.showFinanciamento && (
                        <section>
                          <h3 className="font-medium mb-2">Financiamento / Obs</h3>
                          <Grid>
                            <MoneyInput
                              label="Saldo financiamento"
                              value={it.saldoFinanciamento ?? saldoSug}
                              onChange={(v) => setItemField(it.id, "saldoFinanciamento", v)}
                            />
                            <MoneyInput label="Parcela financiamento" value={it.parcelaFinanciamento} onChange={(v) => setItemField(it.id, "parcelaFinanciamento", v)} />
                            <MoneyInput label="FGTS" value={it.fgts} onChange={(v) => setItemField(it.id, "fgts", v)} />
                            <MoneyInput label="Subsídio federal" value={it.subsidioFederal} onChange={(v) => setItemField(it.id, "subsidioFederal", v)} />
                            <MoneyInput label="Subsídio estadual" value={it.subsidioEstadual} onChange={(v) => setItemField(it.id, "subsidioEstadual", v)} />
                            <MoneyInput label="Subsídio municipal" value={it.subsidioMunicipal} onChange={(v) => setItemField(it.id, "subsidioMunicipal", v)} />
                            <MoneyInput label="Documentação" value={it.estimativaDocumentacao} onChange={(v) => setItemField(it.id, "estimativaDocumentacao", v)} />
                            <NumberInput label="Taxa de juros (%)" value={it.taxaJuros} onChange={(v) => setItemField(it.id, "taxaJuros", v)} />
                            <MoneyInput label="Renda bruta familiar" value={it.rendaBrutaFamiliar} onChange={(v) => setItemField(it.id, "rendaBrutaFamiliar", v)} />
                            <TextArea label="Observação" value={it.observacao} onChange={(v) => setItemField(it.id, "observacao", v)} />
                          </Grid>
                        </section>
                      )}

                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setEditingItemId(null)}
                          className="border px-4 py-2 rounded"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => saveItem(it.id)}
                          className="bg-black text-white px-4 py-2 rounded"
                          disabled={savingItemId === it.id}
                        >
                          {savingItemId === it.id ? "Salvando..." : "Salvar item"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL PICKER */}
      {showPicker && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl border">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="font-medium">Adicionar tipologia</div>
              <button onClick={() => setShowPicker(false)} className="text-sm">
                Fechar
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="flex gap-2">
                <input
                  className="border rounded px-3 py-2 flex-1"
                  placeholder="Buscar por empreendimento, bairro, cidade, tipologia..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                <button
                  onClick={searchTipologias}
                  className="bg-black text-white rounded px-4 py-2 text-sm"
                  disabled={searching}
                >
                  {searching ? "Buscando..." : "Buscar"}
                </button>
              </div>

              <div className="max-h-[50vh] overflow-auto border rounded">
                {results.length === 0 ? (
                  <div className="p-3 text-sm text-gray-500">Sem resultados.</div>
                ) : (
                  results.map((t) => (
                    <div
                      key={t.id}
                      className="p-3 border-b flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {t.empreendimento.name} — {t.nome ?? "Tipologia"}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {t.empreendimento.bairro ?? "-"} • {t.empreendimento.cidade ?? "-"}
                          {t.empreendimento.construtoraNome ? ` • ${t.empreendimento.construtoraNome}` : ""}
                        </div>
                      </div>
                      <button
                        onClick={() => addItem(t.id)}
                        className="border rounded px-3 py-2 text-sm"
                      >
                        Adicionar
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="text-xs text-gray-500">
                Dica: digite “2Q”, “Asa Norte”, “nome do empreendimento” etc.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =======================
   COMPONENTES
======================= */

function Info({ label, children }: any) {
  return (
    <div className="border rounded p-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-medium">{children}</div>
    </div>
  );
}

function Grid({ children }: any) {
  return <div className="grid grid-cols-2 md:grid-cols-4 gap-2">{children}</div>;
}

// Inputs "suaves": digita livre e converte no blur
function MoneyInput({ label, value, placeholder, onChange }: any) {
  const [raw, setRaw] = useState(value !== null && value !== undefined ? String(value) : "");

  useEffect(() => {
    setRaw(value !== null && value !== undefined ? String(value) : "");
  }, [value]);

  return (
    <div className="border rounded p-2">
      <div className="text-xs text-gray-500">{label}</div>
      <input
        className="mt-1 w-full border rounded px-2 py-1 text-sm"
        value={raw}
        placeholder={placeholder}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={() => onChange(parseBRL(raw))}
      />
      <div className="text-[11px] text-gray-500 mt-1">(ex: 10000,00)</div>
    </div>
  );
}

function NumberInput({ label, value, onChange }: any) {
  return (
    <div className="border rounded p-2">
      <div className="text-xs text-gray-500">{label}</div>
      <input
        type="number"
        className="mt-1 w-full border rounded px-2 py-1 text-sm"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
    </div>
  );
}

function TextInput({ label, value, onChange }: any) {
  return (
    <div className="border rounded p-2">
      <div className="text-xs text-gray-500">{label}</div>
      <input
        className="mt-1 w-full border rounded px-2 py-1 text-sm"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function TextArea({ label, value, onChange }: any) {
  return (
    <div className="border rounded p-2 md:col-span-2">
      <div className="text-xs text-gray-500">{label}</div>
      <textarea
        className="mt-1 w-full border rounded px-2 py-1 text-sm min-h-[80px]"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
