import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireUser } from "@/lib/authz.server";

export async function GET() {
  try {
    const s = await requireUser();
    const tenant = s.tenant;

    const comparativos = await prisma.comparativo.findMany({
      where: { tenantId: tenant.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        titulo: true,
        clienteNome: true,
        slugPublico: true,
        showGeral: true,
        showEntrada: true,
        showFinanciamento: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { items: true } },
      },
    });

    return NextResponse.json({ ok: true, comparativos });
  } catch (err) {
    console.error("GET /api/comparativos/list error:", err);
    return NextResponse.json(
      { ok: false, error: "Erro ao listar comparativos." },
      { status: 500 }
    );
  }
}
