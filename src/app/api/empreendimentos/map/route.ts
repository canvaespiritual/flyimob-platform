import { prisma } from "../../../../lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get("tenantSlug") || "flyimob";

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return Response.json([]);

  const empreendimentos = await prisma.empreendimento.findMany({
    where: {
      tenantId: tenant.id,
      status: "ATIVO",
      lat: { not: null },
      lng: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      lat: true,
      lng: true,

      bairro: true,
      cidade: true,
      uf: true,
      tipo: true,
      dataEntrega: true,

      fotos: {
        orderBy: [{ isCover: "desc" }, { ordem: "asc" }],
        take: 1,
        select: { urlThumb: true },
      },

      tipologias: {
        select: {
          precoInicial: true,
          areaPrivativa: true,
          areaTerreno: true,
          quartos: true,
          suites: true,
          vagas: true,
        },
      },
    },
  });

  const result = empreendimentos.map((e) => {
    const precos = e.tipologias
      .map((t) => t.precoInicial)
      .filter((v): v is number => typeof v === "number");

    const areas = e.tipologias
      .map((t) => t.areaPrivativa ?? t.areaTerreno)
      .filter((v): v is number => typeof v === "number");

    const quartos = e.tipologias
      .map((t) => t.quartos)
      .filter((v): v is number => typeof v === "number");

    const suites = e.tipologias
      .map((t) => t.suites)
      .filter((v): v is number => typeof v === "number");

    const vagas = e.tipologias
      .map((t) => t.vagas)
      .filter((v): v is number => typeof v === "number");

    // R$/m² (usa o melhor dado disponível por tipologia: areaPrivativa ou areaTerreno)
    const precoPorM2List = e.tipologias
      .map((t) => {
        const preco = t.precoInicial;
        const area = t.areaPrivativa ?? t.areaTerreno;
        if (typeof preco !== "number") return null;
        if (typeof area !== "number" || area <= 0) return null;
        return Math.round(preco / area);
      })
      .filter((v): v is number => typeof v === "number");

    return {
      id: e.id,
      name: e.name,
      slug: e.slug,
      lat: e.lat!,
      lng: e.lng!,

      bairro: e.bairro,
      cidade: e.cidade,
      uf: e.uf,
      tipo: e.tipo,

      dataEntrega: e.dataEntrega ? e.dataEntrega.toISOString() : null,

      coverThumb: e.fotos[0]?.urlThumb || null,

      priceFrom: precos.length ? Math.min(...precos) : null,
      pricePerM2From: precoPorM2List.length ? Math.min(...precoPorM2List) : null,

      areaMin: areas.length ? Math.min(...areas) : null,
      areaMax: areas.length ? Math.max(...areas) : null,

      quartosMin: quartos.length ? Math.min(...quartos) : null,
      quartosMax: quartos.length ? Math.max(...quartos) : null,

      suitesMin: suites.length ? Math.min(...suites) : null,
      suitesMax: suites.length ? Math.max(...suites) : null,

      vagasMin: vagas.length ? Math.min(...vagas) : null,
      vagasMax: vagas.length ? Math.max(...vagas) : null,
    };
  });

  return Response.json(result);
}
