import { isPublished, publicComparativo } from "@/lib/comparativos/access.server";
import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = (searchParams.get("slug") ?? "").trim();

    if (!slug) {
      return NextResponse.json({ ok: false, error: "slug é obrigatório." }, { status: 400 });
    }

    // Public: slugPublico é unique
    const comparativo = await prisma.comparativo.findUnique({
      where: { slugPublico: slug },
      include: {
        anexos: { where: { itemId: null }, select: { id: true, titulo: true, nomeOriginal: true, itemId: true } },
        items: {
          orderBy: { ordem: "asc" },
          include: {
            anexos: { select: { id: true, titulo: true, nomeOriginal: true } },
            tipologia: {
              include: {
                empreendimento: {
                  include: {
                    construtora: { select: { name: true } },
                    fotos: { orderBy: { ordem: "asc" } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!comparativo || !isPublished(comparativo)) {
      return NextResponse.json({ ok: false, error: "Comparativo não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, comparativo: publicComparativo(comparativo) });
  } catch (e) {
    console.error("GET /api/comparativos/public error:", e);
    return NextResponse.json({ ok: false, error: "Erro ao carregar comparativo público." }, { status: 500 });
  }
}
