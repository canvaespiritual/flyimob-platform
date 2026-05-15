import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { requireUser } from "@/lib/authz.server";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id ?? "");
    const configExibicao = body?.configExibicao ?? null;

    if (!id) return NextResponse.json({ ok: false, error: "id é obrigatório" }, { status: 400 });

    const s = await requireUser();
    const tenant = s.tenant;

    const updated = await prisma.comparativo.updateMany({
      where: { id, tenantId: tenant.id },
      data: { configExibicao },
    });

    if (updated.count === 0) {
      return NextResponse.json({ ok: false, error: "Comparativo não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("finalize/save error:", e);
    return NextResponse.json({ ok: false, error: "Erro ao salvar finalização" }, { status: 500 });
  }
}
