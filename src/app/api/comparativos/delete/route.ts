import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id ?? "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "id é obrigatório." }, { status: 400 });
    }

    const tenant = await prisma.tenant.findUnique({ where: { slug: "flyimob" } });
    if (!tenant) {
      return NextResponse.json({ ok: false, error: "Tenant flyimob não encontrado." }, { status: 404 });
    }

    // segurança extra: só deleta se for do tenant
    const cmp = await prisma.comparativo.findFirst({ where: { id, tenantId: tenant.id }, select: { id: true } });
    if (!cmp) return NextResponse.json({ ok: false, error: "Comparativo não encontrado." }, { status: 404 });

    // se seu schema tiver relation com cascade, ok; se não tiver, removemos itens antes
    await prisma.$transaction([
      prisma.comparativoItem.deleteMany({ where: { comparativoId: id } }),
      prisma.comparativo.delete({ where: { id } }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/comparativos/delete error:", err);
    return NextResponse.json({ ok: false, error: "Erro ao excluir comparativo." }, { status: 500 });
  }
}
