import assert from "node:assert/strict";
import { test } from "node:test";
import { PLANO_VAZIO, validarPlano, alertasPlano, camposLegados, resumoGrupo, validarCredito, type GrupoPagamento } from "../../src/lib/comparativos/plano";
import { conferirArquivo, extrairPlano, PLANO_SCHEMA } from "../../src/lib/comparativos/extracao.server";
import { isPublished, publicComparativo } from "../../src/lib/comparativos/access.server";
import { PDFDocument } from "pdf-lib";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PlanoApresentacao } from "../../src/app/c/PlanoApresentacao";
import { mensaisDaTabela, conferirMensais, fundamentarNoTexto } from "../../src/lib/comparativos/tabela";

const monthly: GrupoPagamento = { tipo: "mensais_obra", titulo: "Mensais", quantidade: 48, primeiraParcela: 1172.14, ultimaParcela: 562.11, totalInformado: 43160, inicio: "2027-03-08", fim: "2031-02-08", variacao: "decrescente", resumo: "", pagina: 1 };
test("computed totals and projected dates absent from the PDF are rejected", () => {
  const p = { ...PLANO_VAZIO, grupos: [{ ...monthly, primeiraParcela: 2490, ultimaParcela: 2490, totalInformado: 4980, inicio: "2027-08-01", fim: "2028-01-31" }] };
  const text = "Pré-chaves intermediária 01 R$ 2.490,00 01/08/2027. Intermediária 02 R$ 2.490,00. " + "Texto original do documento. ".repeat(5);
  const result = fundamentarNoTexto(p, text);
  assert.equal(result.grupos[0].totalInformado, null); assert.equal(result.grupos[0].fim, null);
  assert.equal(result.grupos[0].primeiraParcela, 2490); assert.equal(result.grupos[0].inicio, "2027-08-01");
  assert.equal(p.grupos[0].totalInformado, 4980);
});
test("original financial labels, dates and visibility survive review without changing totals", () => {
  const p = validarPlano({ ...PLANO_VAZIO, valorTotal: 270000, subsidioEstadual: 47400, extras: [
    { titulo: "Parcela bônus", nomeOriginal: "Parcela bônus", valor: "R$ 15.000,00 · benefício condicionado à adimplência", datas: "08/12/2026 e 08/08/2027", pagina: 1, exibir: true },
    { titulo: "Cheque Moradia", nomeOriginal: "Subsídio Estadual (Cheque Moradia)", valor: "R$ 47.400,00 · já incluído no subsídio estadual", datas: "", pagina: 1, exibir: false },
  ] });
  assert.equal(p.extras[0].titulo, "Parcela bônus");
  assert.equal(p.extras[0].datas, "08/12/2026 e 08/08/2027");
  assert.equal(p.extras[1].exibir, false);
  assert.equal(p.extras[1].nomeOriginal, "Subsídio Estadual (Cheque Moradia)");
  assert.equal(camposLegados(p).entradaTotal, null);
  assert.equal(camposLegados(p).subsidioEstadual, 47400);
  assert.throws(() => validarPlano({ ...p, extras: [{ ...p.extras[0], exibir: "false" }] }));
});
test("existing free-text lines remain compatible and visible by default", () => {
  const p = validarPlano({ ...PLANO_VAZIO, extras: [{ titulo: "Documentação", valor: "Por conta da construtora" }] });
  assert.equal(p.extras[0].exibir, true);
  assert.equal(p.extras[0].nomeOriginal, "Documentação");
  assert.equal(p.extras[0].datas, "");
});
test("presentation uses original field labels and dates and omits unchecked lines", () => {
  const plano = validarPlano({ ...PLANO_VAZIO, valorTotal: 270000, rotulos: { valorTotal: "Valor da Proposta" }, extras: [
    { titulo: "Cheque Moradia", valor: "R$ 47.400,00", datas: "08/12/2026", exibir: true },
    { titulo: "BÔNUS_OCULTO", valor: "R$ 15.000,00", datas: "", exibir: false },
  ] });
  const html = renderToStaticMarkup(createElement(PlanoApresentacao, { plano, fields: {}, blocks: { entrada: true, financiamento: true, observacoes: true }, anexos: [], slug: "test" }));
  assert.match(html, /Valor da Proposta/); assert.match(html, /Cheque Moradia/); assert.match(html, /08\/12\/2026/);
  assert.equal(html.includes("BÔNUS_OCULTO"), false);
  assert.equal(camposLegados(plano).entradaTotal, null);
});
test("two-column dated tables are sorted chronologically and conditional payments are excluded", () => {
  const text = "6 08/03/2027 Mensal R$ 1.172,14 54 08/02/2031 Mensal R$ 562,11 8 08/04/2027 Bom pagador R$ 1.550,00 7 08/04/2027 Mensal R$ 1.167,27";
  const rows = mensaisDaTabela(text);
  assert.equal(rows.length, 3); assert.equal(rows[2].valor, 562.11);
  const p = { ...PLANO_VAZIO, grupos: [{ ...monthly, quantidade: 3, ultimaParcela: 622.47, resumo: "texto errado" }] };
  const corrected = conferirMensais(p, text);
  assert.equal(corrected.grupos[0].ultimaParcela, 562.11);
  assert.equal(corrected.grupos[0].resumo, "");
  assert.equal(p.grupos[0].ultimaParcela, 622.47);
  assert.match(conferirMensais({ ...p, grupos: [monthly] }, text).alertas[0], /quantidade/);
});
test("declining installments retain endpoints and never become a fixed legacy installment", () => {
  const p = validarPlano({ ...PLANO_VAZIO, valorTotal: 218900, grupos: [monthly] });
  assert.match(resumoGrupo(p.grupos[0]), /48 parcelas decrescentes/);
  assert.match(resumoGrupo(p.grupos[0]), /1.172,14/);
  assert.match(resumoGrupo(p.grupos[0]), /562,11/);
  assert.equal(camposLegados(p).parcelaEntrada, null);
  assert.equal(camposLegados(p).parcelasEntradaQtd, 48);
  assert.equal(alertasPlano(p).length, 0);
});
test("reported totals are preserved without recomputing installment schedules", () => {
  const p = validarPlano({ ...PLANO_VAZIO, valorTotal: 217885.36, grupos: [{ ...monthly, tipo: "mensais_pos_chaves", quantidade: 84, primeiraParcela: 310, ultimaParcela: 310, totalInformado: 17561.04, variacao: "fixa" }] });
  assert.equal(p.grupos[0].totalInformado, 17561.04);
  assert.equal(alertasPlano(p).length, 0);
  assert.equal(camposLegados(p).entradaTotal, null);
});
test("entry totals are copied only when explicitly stated, with original labels", () => {
  const source = { ...PLANO_VAZIO, grupos: [{ ...monthly, totalInformado: 43160 }] };
  assert.equal(camposLegados(validarPlano(source)).entradaTotal, null);
  const stated = validarPlano({ ...source, entradaTotalInformada: 20950, rotulos: { entradaTotalInformada: "Valor total antes da entrega", valorTotal: "Preço final" } });
  assert.equal(camposLegados(stated).entradaTotal, 20950);
  assert.equal(stated.rotulos?.valorTotal, "Preço final");
});
test("missing prices, bank loans and zero subsidies remain distinct", () => {
  const p = validarPlano({ ...PLANO_VAZIO, fgts: 0 });
  assert.equal(p.valorTotal, null); assert.equal(p.financiamento, null); assert.equal(p.fgts, 0);
  assert.equal(camposLegados(p).saldoFinanciamento, null);
  assert.match(alertasPlano(p)[0], /Preço/);
});
test("client and project mismatch generate review warnings without replacing document values", () => {
  const p = validarPlano({ ...PLANO_VAZIO, empreendimento: "Projeto B", cliente: "Cliente B", valorTotal: 250000 });
  assert.equal(alertasPlano(p, "Projeto A", "Cliente A").length, 2);
  assert.equal(p.empreendimento, "Projeto B");
});
test("invalid amounts, quantities and impossible dates are rejected", () => {
  for (const amount of [-1, NaN, Infinity, "R$ 200,00"]) assert.throws(() => validarPlano({ ...PLANO_VAZIO, valorTotal: amount }));
  assert.throws(() => validarPlano({ ...PLANO_VAZIO, grupos: [{ ...monthly, quantidade: 1.5 }] }));
  assert.throws(() => validarPlano({ ...PLANO_VAZIO, grupos: [{ ...monthly, inicio: "2027-02-30" }] }));
  assert.throws(() => validarCredito({ valorAprovado: -1 }));
});
test("public payload excludes extraction, storage identity and drafts", () => {
  const c = publicComparativo({ revisao: 3, anexos: [{ id: "a", titulo: "Crédito", nomeOriginal: "credit.pdf", storageKey: "private/secret", uploadedById: "owner", itemId: null }], items: [{ id: "i", planoPagamento: PLANO_VAZIO, planoRascunho: { segredo: true }, extracaoOriginal: { segredo: true }, extracaoToken: "secret", revisao: 2, anexos: [{ id: "b", nomeOriginal: "plan.pdf", titulo: "Plano", storageKey: "private/secret" }] }] });
  assert.equal(JSON.stringify(c).includes("secret"), false);
  assert.equal("planoRascunho" in c.items[0], false);
  assert.equal("revisao" in c, false);
  assert.equal(c.items[0].anexos[0].id, "b");
  assert.equal(isPublished({ modoDirecionamento: true, publicadoEm: null }), false);
  assert.equal(isPublished({ modoDirecionamento: false, publicadoEm: null }), true);
});
test("uploaded PDF page limits are checked before transmission to AI", async () => {
  const p = await PDFDocument.create(); for (let n = 0; n < 11; n++) p.addPage();
  await assert.rejects(conferirArquivo(await p.save(), "application/pdf"), /10 páginas/);
  await assert.rejects(conferirArquivo(Buffer.from("not pdf"), "application/pdf"), /PDF válido/);
  await assert.rejects(conferirArquivo(Buffer.from("not jpeg"), "image/jpeg"), /Imagem inválida/);
});
test("Responses integration uses strict schema, file input, no storage and validates completion", async () => {
  const prior = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "unit-test-key";
  try {
    let sent: any;
    const mock: typeof fetch = async (_url, init) => {
      sent = JSON.parse(String(init?.body));
      return Response.json({ status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify(PLANO_VAZIO) }] }] });
    };
    const testPdf = await PDFDocument.create(); testPdf.addPage();
    const r = await extrairPlano(await testPdf.save(), "application/pdf", "plan.pdf", { empreendimento: "Projeto", cliente: "" }, mock);
    assert.equal(r.plano.valorTotal, null); assert.equal(sent.store, false); assert.equal(sent.text.format.strict, true);
    assert.deepEqual(sent.text.format.schema, PLANO_SCHEMA);
    assert.equal(sent.input[0].content[1].type, "input_file");
    await assert.rejects(extrairPlano(Buffer.from("x"), "image/jpeg", "x.jpg", { empreendimento: "", cliente: "" }, async () => Response.json({ status: "incomplete" })), /incompleta/);
    await assert.rejects(extrairPlano(Buffer.from("x"), "image/jpeg", "x.jpg", { empreendimento: "", cliente: "" }, async () => new Response("private vendor error", { status: 429 })), /saldo/);
  } finally { if (prior === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = prior; }
});
