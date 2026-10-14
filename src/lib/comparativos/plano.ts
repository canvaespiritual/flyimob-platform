export const TIPOS_GRUPO = ["sinal", "mensais_obra", "intermediarias", "mensais_pos_chaves", "mensais_sem_fase", "outros"] as const;
export type GrupoPagamento = {
  tipo: typeof TIPOS_GRUPO[number]; titulo: string; quantidade: number | null;
  primeiraParcela: number | null; ultimaParcela: number | null; totalInformado: number | null;
  inicio: string | null; fim: string | null; variacao: "fixa" | "decrescente" | "variavel" | "nao_informada";
  resumo: string; pagina: number | null;
};
export type LinhaAdicional = {
  titulo: string; valor: string; nomeOriginal?: string; datas?: string;
  pagina?: number | null; exibir?: boolean;
};
export type PlanoPagamento = {
  empreendimento: string; cliente: string | null; unidade: string; titulo: string;
  vagas: number | null; varanda: boolean | null; valorTotal: number | null;
  valorAvaliacao: number | null; financiamento: number | null; parcelaBanco: number | null;
  fgts: number | null; subsidioFederal: number | null; subsidioEstadual: number | null;
  descontos: string; condicoes: string; validade: string; grupos: GrupoPagamento[];
  entradaTotalInformada?: number | null;
  rotulos?: Partial<Record<"valorTotal" | "entradaTotalInformada" | "valorAvaliacao" | "financiamento" | "parcelaBanco" | "fgts" | "subsidioFederal" | "subsidioEstadual", string>>;
  extras: LinhaAdicional[]; alertas: string[];
};
export const PLANO_VAZIO: PlanoPagamento = {
  empreendimento: "", cliente: null, unidade: "", titulo: "", vagas: null, varanda: null,
  valorTotal: null, valorAvaliacao: null, financiamento: null, parcelaBanco: null,
  fgts: null, subsidioFederal: null, subsidioEstadual: null,
  descontos: "", condicoes: "", validade: "", grupos: [], extras: [], alertas: [],
  entradaTotalInformada: null, rotulos: {},
};
export class ComparativoError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
function texto(value: unknown, max = 5000): string {
  if (typeof value !== "string" || value.length > max) throw new ComparativoError(400, "Texto inválido no plano.");
  return value.trim();
}
function numero(value: unknown, integer = false): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1e10 || (integer && (!Number.isInteger(value) || value > 1000))) throw new ComparativoError(400, "Valor inválido no plano.");
  return integer ? value : Math.round(value * 100) / 100;
}
function data(value: unknown) {
  if (value === null) return null;
  const s = texto(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s)) || new Date(s).toISOString().slice(0, 10) !== s) throw new ComparativoError(400, "Data inválida no plano.");
  return s;
}
export function validarPlano(value: unknown): PlanoPagamento {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ComparativoError(400, "Plano inválido.");
  const p = value as Record<string, unknown>;
  if (!Array.isArray(p.grupos) || p.grupos.length > 30 || !Array.isArray(p.extras) || p.extras.length > 20 || !Array.isArray(p.alertas) || p.alertas.length > 30) throw new ComparativoError(400, "Grupos inválidos no plano.");
  if (p.varanda !== null && typeof p.varanda !== "boolean") throw new ComparativoError(400, "Varanda inválida.");
  return {
    empreendimento: texto(p.empreendimento, 300), cliente: p.cliente === null ? null : texto(p.cliente, 300),
    unidade: texto(p.unidade, 300), titulo: texto(p.titulo, 300), vagas: numero(p.vagas, true), varanda: p.varanda as boolean | null,
    valorTotal: numero(p.valorTotal), valorAvaliacao: numero(p.valorAvaliacao), financiamento: numero(p.financiamento), parcelaBanco: numero(p.parcelaBanco),
    fgts: numero(p.fgts), subsidioFederal: numero(p.subsidioFederal), subsidioEstadual: numero(p.subsidioEstadual),
    descontos: texto(p.descontos), condicoes: texto(p.condicoes), validade: texto(p.validade, 1000),
    entradaTotalInformada: numero(p.entradaTotalInformada ?? null),
    rotulos: Object.fromEntries(["valorTotal", "entradaTotalInformada", "valorAvaliacao", "financiamento", "parcelaBanco", "fgts", "subsidioFederal", "subsidioEstadual"].map(key => {
      const labels = p.rotulos;
      if (labels !== undefined && (!labels || typeof labels !== "object" || Array.isArray(labels))) throw new ComparativoError(400, "Nomes dos campos inválidos.");
      return [key, texto((labels as Record<string, unknown> | undefined)?.[key] ?? "", 200)];
    })),
    grupos: p.grupos.map((raw) => {
      if (!raw || typeof raw !== "object") throw new ComparativoError(400, "Grupo inválido.");
      const g = raw as Record<string, unknown>;
      if (!TIPOS_GRUPO.includes(g.tipo as GrupoPagamento["tipo"]) || !["fixa", "decrescente", "variavel", "nao_informada"].includes(String(g.variacao))) throw new ComparativoError(400, "Tipo de parcela inválido.");
      return { tipo: g.tipo as GrupoPagamento["tipo"], titulo: texto(g.titulo, 200), quantidade: numero(g.quantidade, true),
        primeiraParcela: numero(g.primeiraParcela), ultimaParcela: numero(g.ultimaParcela), totalInformado: numero(g.totalInformado),
        inicio: data(g.inicio), fim: data(g.fim), variacao: g.variacao as GrupoPagamento["variacao"], resumo: texto(g.resumo), pagina: numero(g.pagina, true) };
    }),
    extras: p.extras.map((e) => {
      if (!e || typeof e !== "object") throw new ComparativoError(400, "Linha adicional inválida.");
      if (e.exibir !== undefined && typeof e.exibir !== "boolean") throw new ComparativoError(400, "Exibição da linha adicional inválida.");
      return { titulo: texto(e.titulo, 200), valor: texto(e.valor),
        nomeOriginal: texto(e.nomeOriginal ?? e.titulo, 200), datas: texto(e.datas ?? "", 1000),
        pagina: numero(e.pagina ?? null, true), exibir: e.exibir !== false };
    }),
    alertas: p.alertas.map((a) => texto(a, 1000)),
  };
}
export function brl(value: number | null) { return value === null ? "Não informado" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
export function resumoGrupo(g: GrupoPagamento) {
  if (g.resumo) return g.resumo;
  const qty = g.quantidade === null ? "Quantidade não informada" : `${g.quantidade} parcela${g.quantidade === 1 ? "" : "s"}`;
  if (g.variacao === "decrescente") return `${qty} decrescentes · primeira ${brl(g.primeiraParcela)} · última ${brl(g.ultimaParcela)}`;
  return `${qty} · ${brl(g.primeiraParcela)}${g.variacao === "variavel" ? " · valores variáveis" : ""}`;
}
export function alertasPlano(p: PlanoPagamento, empreendimento?: string, cliente?: string) {
  const alerts = [...p.alertas];
  const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (empreendimento && p.empreendimento && normalize(empreendimento) !== normalize(p.empreendimento)) alerts.push("Confira o empreendimento: o nome do anexo difere do cadastro selecionado.");
  if (cliente && p.cliente && normalize(cliente) !== normalize(p.cliente) && !["na", "naoinformado"].includes(normalize(p.cliente))) alerts.push("O nome do cliente no anexo difere do nome informado no comparativo.");
  if (p.valorTotal === null) alerts.push("Preço da proposta não informado. Confira antes de aprovar.");
  return [...new Set(alerts)];
}
export function camposLegados(p: PlanoPagamento) {
  const signal = p.grupos.find(g => g.tipo === "sinal");
  const monthly = p.grupos.find(g => g.tipo === "mensais_obra");
  return { valorTotal: p.valorTotal, sinalEntrada: signal?.primeiraParcela ?? null,
    entradaTotal: p.entradaTotalInformada ?? null,
    parcelaEntrada: monthly?.variacao === "fixa" ? monthly.primeiraParcela : null, parcelasEntradaQtd: monthly?.quantidade ?? null,
    parcelasIntermediarias: p.grupos.filter(g => g.tipo === "intermediarias").map(resumoGrupo).join("\n") || null,
    saldoFinanciamento: p.financiamento, parcelaFinanciamento: p.parcelaBanco, fgts: p.fgts,
    subsidioFederal: p.subsidioFederal, subsidioEstadual: p.subsidioEstadual };
}
export type ResumoCredito = { valorAprovado: number | null; parcela: number | null; recursosProprios: number | null; fgts: number | null; observacoes: string; proximosPassos: string };
export function validarCredito(value: unknown): ResumoCredito {
  if (!value || typeof value !== "object") throw new ComparativoError(400, "Resumo de crédito inválido.");
  const c = value as Record<string, unknown>;
  return { valorAprovado: numero(c.valorAprovado), parcela: numero(c.parcela), recursosProprios: numero(c.recursosProprios), fgts: numero(c.fgts), observacoes: texto(c.observacoes), proximosPassos: texto(c.proximosPassos) };
}
