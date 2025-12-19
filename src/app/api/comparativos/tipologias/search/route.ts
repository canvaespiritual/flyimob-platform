import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma"; // atenção: aqui sobe 5 (está em .../comparativos/tipologias/search)

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();

    const tenant = await prisma.tenant.findUnique({ where: { slug: "flyimob" } });
    if (!tenant) {
      return NextResponse.json({ ok: false, error: "Tenant flyimob não encontrado." }, { status: 404 });
    }

    // Busca tipologias do tenant
    const results = await prisma.empreendimentoTipologia.findMany({
      where: {
        empreendimento: { tenantId: tenant.id },
        OR: q
          ? [
              { nome: { contains: q, mode: "insensitive" } },
              { empreendimento: { name: { contains: q, mode: "insensitive" } } },
              { empreendimento: { bairro: { contains: q, mode: "insensitive" } } },
              { empreendimento: { cidade: { contains: q, mode: "insensitive" } } },
            ]
          : undefined,
      },
      take: 30,
      orderBy: { updatedAt: "desc" },
      include: {
        empreendimento: {
          include: { construtora: { select: { name: true } } },
        },
      },
    });

    // payload leve
    const payload = results.map((t) => ({
      id: t.id,
      nome: t.nome,
      areaPrivativa: t.areaPrivativa,
      areaTerreno: t.areaTerreno,
      quartos: t.quartos,
      suites: t.suites,
      vagas: t.vagas,
      precoInicial: t.precoInicial,
      empreendimento: {
        id: t.empreendimento.id,
        name: t.empreendimento.name,
        bairro: t.empreendimento.bairro,
        cidade: t.empreendimento.cidade,
        dataEntrega: t.empreendimento.dataEntrega,
        construtoraNome: t.empreendimento.construtora?.name ?? null,
      },
    }));

    return NextResponse.json({ ok: true, tipologias: payload });
  } catch (err) {
    console.error("GET /api/comparativos/tipologias/search error:", err);
    return NextResponse.json({ ok: false, error: "Erro ao buscar tipologias." }, { status: 500 });
  }
}
