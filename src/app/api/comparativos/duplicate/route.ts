import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

function makeSlug(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  const time = Date.now().toString(36).slice(-4);
  return `c-${time}${rand}`.toLowerCase();
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id ?? "").trim();
    if (!id) return NextResponse.json({ ok: false, error: "id é obrigatório." }, { status: 400 });

    const tenant = await prisma.tenant.findUnique({ where: { slug: "flyimob" } });
    if (!tenant) {
      return NextResponse.json({ ok: false, error: "Tenant flyimob não encontrado." }, { status: 404 });
    }

    const original = await prisma.comparativo.findFirst({
      where: { id, tenantId: tenant.id },
      include: { items: { orderBy: { ordem: "asc" } } },
    });

    if (!original) {
      return NextResponse.json({ ok: false, error: "Comparativo não encontrado." }, { status: 404 });
    }

    // slug único
    let slugPublico = makeSlug();
    for (let i = 0; i < 5; i++) {
      const exists = await prisma.comparativo.findUnique({ where: { slugPublico } });
      if (!exists) break;
      slugPublico = makeSlug();
    }

    const created = await prisma.$transaction(async (tx) => {
      const novo = await tx.comparativo.create({
        data: {
          tenantId: tenant.id,
          titulo: `${original.titulo} (cópia)`,
          clienteNome: original.clienteNome,
          slugPublico,
          showGeral: original.showGeral,
          showEntrada: original.showEntrada,
          showFinanciamento: original.showFinanciamento,
        },
        select: { id: true, slugPublico: true },
      });

      if (original.items?.length) {
        await tx.comparativoItem.createMany({
          data: original.items.map((it) => ({
            comparativoId: novo.id,
            tipologiaId: it.tipologiaId,
            ordem: it.ordem,

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
          })),
        });
      }

      return novo;
    });

    return NextResponse.json({ ok: true, id: created.id, slugPublico: created.slugPublico });
  } catch (err) {
    console.error("POST /api/comparativos/duplicate error:", err);
    return NextResponse.json({ ok: false, error: "Erro ao duplicar comparativo." }, { status: 500 });
  }
}
