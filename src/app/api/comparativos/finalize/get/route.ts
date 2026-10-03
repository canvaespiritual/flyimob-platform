import { getPermissionApiSession } from "@/lib/api-access.server";
import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";

export async function GET(req: Request) {
  const auth = await getPermissionApiSession("comparativos:use");
  if (!auth.ok) return auth.response;
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "id é obrigatório" }, { status: 400 });

    const s = auth.session;
    const tenant = s.tenant;

    const comparativo = await prisma.comparativo.findFirst({
      where: { id, tenantId: tenant.id },
      select: {
        id: true,
        slugPublico: true,
        titulo: true,
        clienteNome: true,
        showGeral: true,
        showEntrada: true,
        showFinanciamento: true,
        configExibicao: true,
        items: {
          orderBy: { ordem: "asc" },
          include: {
            tipologia: {
              include: { empreendimento: { include: { construtora: { select: { name: true } } } } },
            },
          },
        },
      },
    });

    if (!comparativo) return NextResponse.json({ ok: false, error: "Comparativo não encontrado" }, { status: 404 });

    return NextResponse.json({ ok: true, comparativo });
  } catch (e) {
    console.error("finalize/get error:", e);
    return NextResponse.json({ ok: false, error: "Erro ao carregar finalização" }, { status: 500 });
  }
}
