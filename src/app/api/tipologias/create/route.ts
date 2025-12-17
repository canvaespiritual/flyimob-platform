import { prisma } from "../../../../lib/prisma";

function toInt(v: FormDataEntryValue | null) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toFloat(v: FormDataEntryValue | null) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toText(v: FormDataEntryValue | null) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

export async function POST(req: Request) {
  const form = await req.formData();

  const tenantSlug = String(form.get("tenantSlug") || "flyimob");
  const empreendimentoId = String(form.get("empreendimentoId") || "").trim();

  if (!empreendimentoId) {
    return new Response("empreendimentoId obrigatório", { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return new Response("Tenant não encontrado", { status: 404 });

  const empreendimento = await prisma.empreendimento.findFirst({
    where: { id: empreendimentoId, tenantId: tenant.id },
    select: { id: true },
  });
  if (!empreendimento) return new Response("Empreendimento não encontrado", { status: 404 });

  const financingModel = String(form.get("financingModel") || "").trim();
  if (!financingModel) return new Response("financingModel obrigatório", { status: 400 });

  const percentualAteChaves = toInt(form.get("percentualAteChaves"));
  const valorAvaliacaoBanco = toInt(form.get("valorAvaliacaoBanco"));

  // ✅ Regras de negócio
  if (financingModel === "FLUXO_ATE_CHAVES") {
    if (percentualAteChaves == null) {
      return new Response("Para FLUXO_ATE_CHAVES, informe percentualAteChaves", { status: 400 });
    }
  }

  if (financingModel === "CREDITO_ASSOCIATIVO") {
    if (valorAvaliacaoBanco == null) {
      return new Response("Para CREDITO_ASSOCIATIVO, informe valorAvaliacaoBanco", { status: 400 });
    }
  }

  const precoInicial = toInt(form.get("precoInicial"));
  const areaPrivativa = toFloat(form.get("areaPrivativa"));
  const areaTerreno = toFloat(form.get("areaTerreno"));
  const areaBase = areaPrivativa ?? areaTerreno ?? null;

  // ✅ preço/m² automático (se der)
  const precoPorM2 =
    typeof precoInicial === "number" && typeof areaBase === "number" && areaBase > 0
      ? Math.round(precoInicial / areaBase)
      : null;

  const data = {
    empreendimentoId: empreendimento.id,

    nome: toText(form.get("nome")),
    descricao: toText(form.get("descricao")),

    quartos: toInt(form.get("quartos")),
    suites: toInt(form.get("suites")),
    vagas: toInt(form.get("vagas")),

    areaPrivativa: areaPrivativa,
    areaTerreno: areaTerreno,

    hectares: toFloat(form.get("hectares")),
    alqueires: toFloat(form.get("alqueires")),
    valorCondominio: toInt(form.get("valorCondominio")),

    totalUnidades: toInt(form.get("totalUnidades")),
    disponiveis: toInt(form.get("disponiveis")),

    precoInicial: precoInicial,
    precoPorM2: precoPorM2,

    financingModel: financingModel as any,

    percentualAteChaves: percentualAteChaves,
    valorAvaliacaoBanco: valorAvaliacaoBanco,

    entradaMinima: toInt(form.get("entradaMinima")),

    atualizadoEm: new Date(),
  };

  await prisma.empreendimentoTipologia.create({ data });

  return Response.redirect(
    new URL(`/admin/empreendimentos/${empreendimento.id}/tipologias`, req.url),
    303
  );
}
