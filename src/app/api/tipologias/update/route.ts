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

  const tenantSlug = String(form.get("tenantSlug") || "").trim();

if (!tenantSlug) {
  return new Response("Tenant obrigatório", { status: 400 });
}
  const empreendimentoId = String(form.get("empreendimentoId") || "").trim();
  const tipologiaId = String(form.get("tipologiaId") || "").trim();

  if (!empreendimentoId || !tipologiaId) {
    return new Response("empreendimentoId e tipologiaId são obrigatórios", { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return new Response("Tenant não encontrado", { status: 404 });

  const emp = await prisma.empreendimento.findFirst({
    where: { id: empreendimentoId, tenantId: tenant.id },
    select: { id: true },
  });
  if (!emp) return new Response("Empreendimento não encontrado", { status: 404 });

  const current = await prisma.empreendimentoTipologia.findFirst({
    where: { id: tipologiaId, empreendimentoId: emp.id },
    select: { id: true },
  });
  if (!current) return new Response("Tipologia não encontrada", { status: 404 });

  const financingModel = String(form.get("financingModel") || "").trim();
  if (!financingModel) return new Response("financingModel obrigatório", { status: 400 });

  const percentualAteChaves = toInt(form.get("percentualAteChaves"));
  const valorAvaliacaoBanco = toInt(form.get("valorAvaliacaoBanco"));

  // ✅ Regras de negócio
  if (financingModel === "FLUXO_ATE_CHAVES" && percentualAteChaves == null) {
    return new Response("Para FLUXO_ATE_CHAVES, informe percentualAteChaves", { status: 400 });
  }
  if (financingModel === "CREDITO_ASSOCIATIVO" && valorAvaliacaoBanco == null) {
    return new Response("Para CREDITO_ASSOCIATIVO, informe valorAvaliacaoBanco", { status: 400 });
  }

  const precoInicial = toInt(form.get("precoInicial"));
  const areaPrivativa = toFloat(form.get("areaPrivativa"));
  const areaTerreno = toFloat(form.get("areaTerreno"));
  const areaBase = areaPrivativa ?? areaTerreno ?? null;

  const precoPorM2 =
    typeof precoInicial === "number" && typeof areaBase === "number" && areaBase > 0
      ? Math.round(precoInicial / areaBase)
      : null;

  await prisma.empreendimentoTipologia.update({
    where: { id: tipologiaId },
    data: {
      nome: toText(form.get("nome")),
      descricao: toText(form.get("descricao")),
      quartos: toInt(form.get("quartos")),
      suites: toInt(form.get("suites")),
      vagas: toInt(form.get("vagas")),

      areaPrivativa,
      areaTerreno,

      hectares: toFloat(form.get("hectares")),
      alqueires: toFloat(form.get("alqueires")),
      valorCondominio: toInt(form.get("valorCondominio")),

      totalUnidades: toInt(form.get("totalUnidades")),
      disponiveis: toInt(form.get("disponiveis")),

      precoInicial,
      precoPorM2,

      financingModel: financingModel as any,
      percentualAteChaves,
      valorAvaliacaoBanco,

      entradaMinima: toInt(form.get("entradaMinima")),

      atualizadoEm: new Date(),
    },
  });

  const proto = req.headers.get("x-forwarded-proto") ?? "http";
const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
const origin = host ? `${proto}://${host}` : new URL(req.url).origin;

  return Response.redirect(
    new URL(`/admin/empreendimentos/${emp.id}/tipologias`, origin),
    303
  );

}
