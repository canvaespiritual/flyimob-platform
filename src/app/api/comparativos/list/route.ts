import { getPermissionApiSession } from "@/lib/api-access.server";
import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export async function GET() {
  const auth = await getPermissionApiSession("comparativos:use");
  if (!auth.ok) return auth.response;
  try {
    const s = auth.session;
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
