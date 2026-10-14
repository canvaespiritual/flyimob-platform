import { type PlanoPagamento } from "./plano";
// Read only explicit, dated "Mensal" rows. Never infer a progression or financing.
export function mensaisDaTabela(text: string) {
  const pattern = /\b(\d+)\s+(\d{2}\/\d{2}\/\d{4})\s+Mensal\s+(?:R\$\s*)?([\d.]+,\d{2})/gi;
  const rows = [...text.matchAll(pattern)].map(m => ({ numero: Number(m[1]), data: m[2].split("/").reverse().join("-"), valor: Number(m[3].replaceAll(".", "").replace(",", ".")) }));
  const unique = [...new Map(rows.map(r => [`${r.numero}:${r.data}`, r])).values()];
  return unique.sort((a, b) => a.data.localeCompare(b.data) || a.numero - b.numero);
}
export function conferirMensais(plano: PlanoPagamento, text: string): PlanoPagamento {
  const rows = mensaisDaTabela(text);
  const candidates = plano.grupos.filter(g => g.variacao === "decrescente");
  if (candidates.length !== 1 || rows.length < 2) return plano;
  const group = candidates[0];
  if (group.quantidade !== rows.length) return { ...plano, alertas: [...plano.alertas, "A quantidade de mensais extraída difere das linhas da tabela. Confira o detalhamento no anexo."] };
  if (!rows.every((row, n) => n === 0 || row.valor <= rows[n - 1].valor)) return { ...plano, alertas: [...plano.alertas, "A tabela não é totalmente decrescente. Confira a descrição das mensais."] };
  const first = rows[0], last = rows[rows.length - 1];
  return { ...plano, grupos: plano.grupos.map(g => g === group ? { ...g, primeiraParcela: first.valor, ultimaParcela: last.valor, inicio: first.data, fim: last.data, resumo: "" } : g) };
}
export function fundamentarNoTexto(plano: PlanoPagamento, text: string): PlanoPagamento {
  // Scanned PDFs still need visual interpretation and human review.
  if (text.trim().length < 100) return plano;
  const amounts = new Set([...text.matchAll(/(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}\b/g)].map(m => Number(m[0].replaceAll(".", "").replace(",", "."))));
  if (!amounts.size) return plano;
  const compact = text.replace(/\s/g, "");
  const alerts = [...plano.alertas];
  const money = (value: number | null, label: string) => {
    if (value === null || amounts.has(value)) return value;
    alerts.push(`${label}: valor não localizado literalmente no texto do PDF. Confira no original; não foi calculado.`);
    return null;
  };
  const date = (value: string | null, label: string) => {
    if (!value || compact.includes(value.split("-").reverse().join("/")) || compact.includes(value)) return value;
    alerts.push(`${label}: data não localizada literalmente no texto do PDF. Confira no original; não foi projetada.`);
    return null;
  };
  const literal = (value: string, label: string) => value
    .replace(/(?:R\$\s*)?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}\b/g, match => {
      const number = Number(match.replace(/R\$|\s|\./g, "").replace(",", "."));
      if (amounts.has(number)) return match;
      alerts.push(`${label}: valor em texto não localizado no PDF. Confira o original.`);
      return "valor não informado no documento";
    })
    .replace(/\b\d{2}\/\d{2}\/\d{4}\b/g, match => {
      if (compact.includes(match)) return match;
      alerts.push(`${label}: vencimento em texto não localizado no PDF. Confira o original.`);
      return "data não informada no documento";
    });
  const p = { ...plano };
  for (const key of ["valorTotal", "valorAvaliacao", "financiamento", "parcelaBanco", "fgts", "subsidioFederal", "subsidioEstadual"] as const) p[key] = money(p[key], p.rotulos?.[key] || key);
  p.entradaTotalInformada = money(p.entradaTotalInformada ?? null, p.rotulos?.entradaTotalInformada || "Total de entrada");
  p.grupos = p.grupos.map(g => ({ ...g, resumo: literal(g.resumo, g.titulo), primeiraParcela: money(g.primeiraParcela, g.titulo), ultimaParcela: money(g.ultimaParcela, g.titulo), totalInformado: money(g.totalInformado, `${g.titulo} — total`), inicio: date(g.inicio, g.titulo), fim: date(g.fim, g.titulo) }));
  p.extras = p.extras.map(e => ({ ...e, valor: literal(e.valor, e.titulo), datas: literal(e.datas ?? "", e.titulo) }));
  p.descontos = literal(p.descontos, "Benefícios"); p.condicoes = literal(p.condicoes, "Condições");
  p.alertas = [...new Set(alerts)];
  return p;
}
