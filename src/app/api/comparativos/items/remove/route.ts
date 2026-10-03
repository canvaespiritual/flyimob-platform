import { getPermissionApiSession } from "@/lib/api-access.server";
import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";

export async function POST(req: Request) {
  const auth = await getPermissionApiSession("comparativos:use");
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const itemId = String(body?.itemId ?? "");
    if (!itemId) return NextResponse.json({ ok: false, error: "itemId é obrigatório." }, { status: 400 });

    const item = await prisma.comparativoItem.findFirst({
      where: { id: itemId, comparativo: { tenantId: auth.session.tenant.id } }, select: { id: true },
    });
    if (!item) return NextResponse.json({ ok: false, error: "Item não encontrado." }, { status: 404 });

    await prisma.comparativoItem.delete({ where: { id: itemId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/comparativos/items/remove error:", err);
    return NextResponse.json({ ok: false, error: "Erro ao remover item." }, { status: 500 });
  }
}
