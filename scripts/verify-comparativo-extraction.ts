// Read-only smoke test against the real provider; never prints credentials or client identifiers.
import { readFile, readdir } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { conferirArquivo, extrairPlano } from "../src/lib/comparativos/extracao.server";
import { alertasPlano } from "../src/lib/comparativos/plano";
async function main() {
  if (process.argv.includes("--railway-stdin")) {
    const { readFileSync } = await import("node:fs");
    const remote = JSON.parse(readFileSync(0, "utf8"));
    if (remote.RAILWAY_SERVICE_ID !== "b133c3a0-3c13-4a54-9c34-f3b229f1ff80") throw new Error("Serviço Railway incorreto.");
    process.env.OPENAI_API_KEY = remote.OPENAI_API_KEY;
    process.env.OPENAI_COMPARATIVOS_MODEL = remote.OPENAI_COMPARATIVOS_MODEL;
  }
  if (!process.env.OPENAI_API_KEY) {
    try { process.env.OPENAI_API_KEY = (await readFile(join(tmpdir(), "flyimob-comparativos-openai-key.tmp"), "utf8")).trim(); }
    catch { throw new Error("Configure OPENAI_API_KEY para executar a verificação real."); }
  }
  const directory = join(homedir(), "Downloads");
  const names = await readdir(directory);
  const cases = [
    { prefix: "PARQUE DOS SONHOS V - VARANDA", project: "PARQUE DOS SONHOS V", expected: 217885.36 },
    { prefix: "ESTILO FAI", project: "ESTILO FAIÇALVILLE", expected: 257389.62 },
    { prefix: "GRAN AURORA - GRAN AURORA - BLOCO 20", project: "GRAN AURORA", expected: 218900 },
    { prefix: "WhatsApp Image 2026-10-14 at 11.13.45.jpeg", project: "Porto Bougainville I", expected: 270000 },
  ];
  for (const c of cases.filter((_, n) => !process.argv.includes("--image-only") || n === 3)) {
    const filename = names.find(n => n.startsWith(c.prefix)); if (!filename) throw new Error("Arquivo de teste ausente.");
    const bytes = await readFile(join(directory, filename)); const mime = filename.endsWith(".pdf") ? "application/pdf" : "image/jpeg";
    await conferirArquivo(bytes, mime);
    const start = Date.now();
    const fetcher: typeof fetch = async (url, init) => {
      const response = await fetch(url, init);
      if (process.argv.includes("--diagnostic") && response.ok) {
        const result = await response.clone().json();
        const content = result.output?.flatMap((o: { content?: { text?: string }[] }) => o.content ?? []).map((o: { text?: string }) => o.text ?? "").join("");
        try { const p = JSON.parse(content); console.log(JSON.stringify({ keys: Object.keys(p), valores: [p.valorTotal, p.valorAvaliacao, p.financiamento, p.parcelaBanco, p.fgts, p.subsidioFederal, p.subsidioEstadual, p.vagas, p.varanda], grupos: p.grupos.map((g: { tipo: string; quantidade: number; primeiraParcela: number; ultimaParcela: number; totalInformado: number; inicio: string; fim: string; pagina: number }) => ({ tipo: g.tipo, quantidade: g.quantidade, primeira: g.primeiraParcela, ultima: g.ultimaParcela, total: g.totalInformado, inicio: g.inicio, fim: g.fim, pagina: g.pagina })) })); } catch { console.log("Resposta não estruturada."); }
      }
      return response;
    };
    const { plano, model } = await extrairPlano(bytes, mime, "plano" + (mime === "application/pdf" ? ".pdf" : ".jpeg"), { empreendimento: c.project, cliente: "" }, fetcher);
    const result = { projeto: c.project, modelo: model, segundos: Math.round((Date.now() - start) / 1000), preco: plano.valorTotal, precoCorreto: plano.valorTotal === c.expected,
      financiamento: plano.financiamento, parcelaBanco: plano.parcelaBanco,
      grupos: plano.grupos.map(g => ({ tipo: g.tipo, quantidade: g.quantidade, primeira: g.primeiraParcela, ultima: g.ultimaParcela, total: g.totalInformado, variacao: g.variacao })),
      alertas: alertasPlano(plano).length };
    console.log(JSON.stringify(result));
    if (plano.valorTotal !== c.expected) throw new Error("Preço extraído diverge do plano real.");
    if (c.project === "GRAN AURORA" && !plano.grupos.some(g => g.quantidade === 48 && g.primeiraParcela === 1172.14 && g.ultimaParcela === 562.11)) throw new Error("Resumo decrescente incorreto.");
  }
}
main().catch(e => { console.error(e instanceof Error ? e.message : "Falha de verificação"); process.exitCode = 1; });
