"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type ComparativoFinal = {
  id: string;
  slugPublico: string;
  titulo: string;
  clienteNome: string;

  showGeral: boolean;
  showEntrada: boolean;
  showFinanciamento: boolean;

  configExibicao: any | null;
  items: any[];
};

const DEFAULT_CONFIG = {
  // toggles por BLOCO (refina o que já existe)
  blocks: {
    geral: true,
    entrada: true,
    financiamento: true,
    observacoes: true,
    mapa: true,      // final do comparativo
    capa: true,      // usar imagem de capa se existir
  },

  // toggles por CAMPO (checklist completo)
  fields: {
    // ====== GERAL (puxado do cadastro) ======
    nomeEmpreendimento: true,
    construtora: true,
    bairro: true,
    cidade: true,
    enderecoCompleto: false, // por padrão OFF (geralmente desnecessário)
    dataEntregaMeses: true,
    precoM2: true,
    tipologiaNome: true,
    quartos: true,
    suites: true,
    vagas: true,
    areaPrivativa: true,
    areaTerreno: true,
    hectares: false,
    alqueires: false,
    disponiveis: true,
    valorAvaliacaoBanco: false,

    // ====== ENTRADA / CONDIÇÕES (do atendimento) ======
    valorTotal: true,
    entradaTotal: true,
    sinalEntrada: true,
    parcelasEntradaQtd: true,
    parcelaEntrada: true,
    parcelasIntermediarias: true,
    parcelaUnica: true,
    parcelaEspecial: true,
    parcelasAnuais: true,

    // ====== BENEFÍCIOS ======
    fgts: true,
    subsidioFederal: true,
    subsidioEstadual: true,
    subsidioMunicipal: true,

    // ====== FINANCIAMENTO ======
    saldoFinanciamento: true,
    parcelaFinanciamento: true,
    taxaJuros: true,
    rendaBrutaFamiliar: false,

    // ====== CUSTOS / OBS ======
    estimativaDocumentacao: true,
    observacao: true,
  },

  // layout (primário/secundário/terciário) – automático, mas deixamos guardado
  layout: {
    // hierarquia que você definiu
    primary: ["valorTotal", "entradaTotal", "sinalEntrada", "parcelaEntrada", "parcelaFinanciamento"],
    secondary: ["dataEntregaMeses", "precoM2", "subsidioFederal", "fgts"],
  },
};

function mergeConfig(saved: any | null) {
  if (!saved) return DEFAULT_CONFIG;
  return {
    ...DEFAULT_CONFIG,
    ...saved,
    blocks: { ...DEFAULT_CONFIG.blocks, ...(saved.blocks ?? {}) },
    fields: { ...DEFAULT_CONFIG.fields, ...(saved.fields ?? {}) },
    layout: { ...DEFAULT_CONFIG.layout, ...(saved.layout ?? {}) },
  };
}

export default function FinalizarComparativoPage() {
  const params = useParams();
  const id = params?.id as string | undefined;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cmp, setCmp] = useState<ComparativoFinal | null>(null);

  const [config, setConfig] = useState<any>(DEFAULT_CONFIG);

  async function load() {
    if (!id) return;
    setLoading(true);
    const res = await fetch(`/api/comparativos/finalize/get?id=${id}`);
    const json = await res.json();
    const c = json.comparativo ?? null;
    setCmp(c);
    setConfig(mergeConfig(c?.configExibicao ?? null));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [id]);

  async function save() {
    if (!cmp) return;
    setSaving(true);
    const res = await fetch("/api/comparativos/finalize/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: cmp.id, configExibicao: config }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!json.ok) alert(json.error || "Erro ao salvar configurações.");
    else alert("Configurações salvas!");
  }

  function toggleBlock(key: string) {
    setConfig((prev: any) => ({
      ...prev,
      blocks: { ...prev.blocks, [key]: !prev.blocks[key] },
    }));
  }

  function toggleField(key: string) {
    setConfig((prev: any) => ({
      ...prev,
      fields: { ...prev.fields, [key]: !prev.fields[key] },
    }));
  }

  const publicUrl = useMemo(() => {
    if (!cmp) return "";
    return `${window.location.origin}/c/${cmp.slugPublico}`;
  }, [cmp]);

  if (!id) return <div className="p-6 text-sm text-gray-500">Carregando rota...</div>;
  if (loading) return <div className="p-6">Carregando finalização...</div>;
  if (!cmp) return <div className="p-6">Comparativo não encontrado.</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Finalizar comparativo</h1>
          <p className="text-sm text-gray-500">
            {cmp.titulo} • Cliente: {cmp.clienteNome}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => navigator.clipboard.writeText(publicUrl)}
            className="border rounded px-3 py-2 text-sm"
          >
            Copiar link público
          </button>

          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className="border rounded px-3 py-2 text-sm bg-black text-white"
          >
            Ver como cliente
          </a>

          <Link
            href={`/admin/comparativos/${cmp.id}`}
            className="border rounded px-3 py-2 text-sm"
          >
            Voltar ao editor
          </Link>
        </div>
      </div>

      {/* BLOCO: CONFIG DE BLOCOS */}
      <div className="border rounded-lg p-4 bg-white space-y-3">
        <h2 className="font-medium">Blocos do comparativo final</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={config.blocks.geral} onChange={() => toggleBlock("geral")} />
            Geral
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={config.blocks.entrada} onChange={() => toggleBlock("entrada")} />
            Entrada / Condições
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={config.blocks.financiamento} onChange={() => toggleBlock("financiamento")} />
            Financiamento
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={config.blocks.observacoes} onChange={() => toggleBlock("observacoes")} />
            Observações
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={config.blocks.capa} onChange={() => toggleBlock("capa")} />
            Capa (imagem)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={config.blocks.mapa} onChange={() => toggleBlock("mapa")} />
            Mapa no final
          </label>
        </div>

        <div className="flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="bg-black text-white rounded px-4 py-2"
          >
            {saving ? "Salvando..." : "Salvar configurações"}
          </button>
        </div>
      </div>

      {/* BLOCO: CHECKLIST COMPLETO */}
      <div className="border rounded-lg p-4 bg-white space-y-4">
        <h2 className="font-medium">Checklist completo de campos</h2>
        <p className="text-sm text-gray-500">
          Marque exatamente o que deve aparecer no comparativo público. (A hierarquia primário/secundário/terciário será automática.)
        </p>

        <Section title="Geral (cadastro)">
          <Field k="nomeEmpreendimento" label="Nome do empreendimento" v={config.fields.nomeEmpreendimento} onToggle={toggleField} />
          <Field k="construtora" label="Construtora" v={config.fields.construtora} onToggle={toggleField} />
          <Field k="bairro" label="Bairro" v={config.fields.bairro} onToggle={toggleField} />
          <Field k="cidade" label="Cidade" v={config.fields.cidade} onToggle={toggleField} />
          <Field k="enderecoCompleto" label="Endereço completo" v={config.fields.enderecoCompleto} onToggle={toggleField} />
          <Field
  k="precoM2"
  label="Preço/m² (calculado)"
  v={config.fields.precoM2}
  onToggle={toggleField}
/>

          <Field k="dataEntregaMeses" label="Entrega (em meses)" v={config.fields.dataEntregaMeses} onToggle={toggleField} />
          <Field k="tipologiaNome" label="Tipologia (nome)" v={config.fields.tipologiaNome} onToggle={toggleField} />
          <Field k="quartos" label="Quartos" v={config.fields.quartos} onToggle={toggleField} />
          <Field k="suites" label="Suítes" v={config.fields.suites} onToggle={toggleField} />
          <Field k="vagas" label="Vagas" v={config.fields.vagas} onToggle={toggleField} />
          <Field k="areaPrivativa" label="Área privativa" v={config.fields.areaPrivativa} onToggle={toggleField} />
          <Field k="areaTerreno" label="Área do terreno" v={config.fields.areaTerreno} onToggle={toggleField} />
          <Field k="hectares" label="Hectares" v={config.fields.hectares} onToggle={toggleField} />
          <Field k="alqueires" label="Alqueires" v={config.fields.alqueires} onToggle={toggleField} />
          <Field k="disponiveis" label="Disponíveis" v={config.fields.disponiveis} onToggle={toggleField} />
          <Field k="valorAvaliacaoBanco" label="Valor de avaliação" v={config.fields.valorAvaliacaoBanco} onToggle={toggleField} />
        </Section>

        <Section title="Entrada / Condições (atendimento)">
          <Field k="valorTotal" label="Valor total" v={config.fields.valorTotal} onToggle={toggleField} />
          <Field k="entradaTotal" label="Entrada total" v={config.fields.entradaTotal} onToggle={toggleField} />
          <Field k="sinalEntrada" label="Sinal de entrada" v={config.fields.sinalEntrada} onToggle={toggleField} />
          <Field k="parcelasEntradaQtd" label="Qtd parcelas da entrada" v={config.fields.parcelasEntradaQtd} onToggle={toggleField} />
          <Field k="parcelaEntrada" label="Valor parcela entrada" v={config.fields.parcelaEntrada} onToggle={toggleField} />
          <Field k="parcelasIntermediarias" label="Parcelas intermediárias" v={config.fields.parcelasIntermediarias} onToggle={toggleField} />
          <Field k="parcelaUnica" label="Parcela única" v={config.fields.parcelaUnica} onToggle={toggleField} />
          <Field k="parcelaEspecial" label="Parcela especial" v={config.fields.parcelaEspecial} onToggle={toggleField} />
          <Field k="parcelasAnuais" label="Parcelas anuais" v={config.fields.parcelasAnuais} onToggle={toggleField} />
        </Section>

        <Section title="Benefícios e subsídios">
          <Field k="fgts" label="FGTS" v={config.fields.fgts} onToggle={toggleField} />
          <Field k="subsidioFederal" label="Subsídio federal" v={config.fields.subsidioFederal} onToggle={toggleField} />
          <Field k="subsidioEstadual" label="Subsídio estadual" v={config.fields.subsidioEstadual} onToggle={toggleField} />
          <Field k="subsidioMunicipal" label="Subsídio municipal" v={config.fields.subsidioMunicipal} onToggle={toggleField} />
        </Section>

        <Section title="Financiamento">
          <Field k="saldoFinanciamento" label="Saldo de financiamento" v={config.fields.saldoFinanciamento} onToggle={toggleField} />
          <Field k="parcelaFinanciamento" label="Parcela de financiamento" v={config.fields.parcelaFinanciamento} onToggle={toggleField} />
          <Field k="taxaJuros" label="Taxa de juros" v={config.fields.taxaJuros} onToggle={toggleField} />
          <Field k="rendaBrutaFamiliar" label="Renda bruta familiar" v={config.fields.rendaBrutaFamiliar} onToggle={toggleField} />
        </Section>

        <Section title="Custos e observações">
          <Field k="estimativaDocumentacao" label="Estimativa de documentação" v={config.fields.estimativaDocumentacao} onToggle={toggleField} />
          <Field k="observacao" label="Observação" v={config.fields.observacao} onToggle={toggleField} />
        </Section>

        <div className="flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="bg-black text-white rounded px-4 py-2"
          >
            {saving ? "Salvando..." : "Salvar configurações"}
          </button>
        </div>
      </div>

      {/* STATUS */}
      <div className="border rounded-lg p-4 bg-white">
        <h2 className="font-medium">Resumo</h2>
        <p className="text-sm text-gray-600 mt-2">
          Itens no comparativo: <b>{cmp.items.length}</b> • Link público: <span className="font-mono text-xs">{publicUrl}</span>
        </p>
        <p className="text-xs text-gray-500 mt-2">
          Próximo passo: criar a página pública <b>/c/[slug]</b> e renderizar usando este configExibicao.
        </p>
      </div>
    </div>
  );
}

/* =======================
   COMPONENTES
======================= */

function Section({ title, children }: { title: string; children: any }) {
  return (
    <div className="border rounded p-3">
      <div className="font-medium mb-2">{title}</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">{children}</div>
    </div>
  );
}

function Field({ k, label, v, onToggle }: { k: string; label: string; v: boolean; onToggle: (k: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm border rounded px-3 py-2">
      <input type="checkbox" checked={v} onChange={() => onToggle(k)} />
      {label}
    </label>
  );
}
