import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const itemId = String(body?.itemId ?? "");
    if (!itemId) return NextResponse.json({ ok: false, error: "itemId é obrigatório." }, { status: 400 });

    await prisma.comparativoItem.delete({ where: { id: itemId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/comparativos/items/remove error:", err);
    return NextResponse.json({ ok: false, error: "Erro ao remover item." }, { status: 500 });
  }
}
