import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const itemId = String(body?.itemId ?? "");
    const direction = String(body?.direction ?? ""); // "up" | "down"

    if (!itemId || !["up", "down"].includes(direction)) {
      return NextResponse.json({ ok: false, error: "itemId e direction (up/down) são obrigatórios." }, { status: 400 });
    }

    const item = await prisma.comparativoItem.findUnique({ where: { id: itemId } });
    if (!item) return NextResponse.json({ ok: false, error: "Item não encontrado." }, { status: 404 });

    const siblings = await prisma.comparativoItem.findMany({
      where: { comparativoId: item.comparativoId },
      orderBy: { ordem: "asc" },
      select: { id: true, ordem: true },
    });

    const idx = siblings.findIndex((s) => s.id === itemId);
    if (idx === -1) return NextResponse.json({ ok: false, error: "Item não pertence ao comparativo." }, { status: 400 });

    const swapWith = direction === "up" ? siblings[idx - 1] : siblings[idx + 1];
    if (!swapWith) return NextResponse.json({ ok: true }); // já está no limite

    // troca ordens (transação)
    await prisma.$transaction([
      prisma.comparativoItem.update({ where: { id: itemId }, data: { ordem: swapWith.ordem } }),
      prisma.comparativoItem.update({ where: { id: swapWith.id }, data: { ordem: item.ordem } }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/comparativos/items/move error:", err);
    return NextResponse.json({ ok: false, error: "Erro ao mover item." }, { status: 500 });
  }
}
