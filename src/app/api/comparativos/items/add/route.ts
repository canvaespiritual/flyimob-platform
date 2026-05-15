import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma"; // .../comparativos/items/add
import { requireUser } from "@/lib/authz.server";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const comparativoId = String(body?.comparativoId ?? "");
    const tipologiaId = String(body?.tipologiaId ?? "");

    if (!comparativoId || !tipologiaId) {
      return NextResponse.json(
        { ok: false, error: "comparativoId e tipologiaId são obrigatórios." },
        { status: 400 }
      );
    }

    const s = await requireUser();
    const tenant = s.tenant;

    const comparativo = await prisma.comparativo.findFirst({
      where: { id: comparativoId, tenantId: tenant.id },
      include: { items: true },
    });
    if (!comparativo) return NextResponse.json({ ok: false, error: "Comparativo não encontrado." }, { status: 404 });

    const maxOrdem = comparativo.items.reduce((m, it) => Math.max(m, it.ordem), 0);

    const item = await prisma.comparativoItem.create({
      data: {
        comparativoId,
        tipologiaId,
        ordem: maxOrdem + 1,
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, item });
  } catch (err) {
    console.error("POST /api/comparativos/items/add error:", err);
    return NextResponse.json({ ok: false, error: "Erro ao adicionar item." }, { status: 500 });
  }
}
