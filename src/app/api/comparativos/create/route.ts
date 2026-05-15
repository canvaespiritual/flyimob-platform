import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireUser } from "@/lib/authz.server";

function makeSlug(): string {
  // slug curto e seguro (sem lib externa)
  const rand = Math.random().toString(36).slice(2, 8);
  const time = Date.now().toString(36).slice(-4);
  return `c-${time}${rand}`.toLowerCase();
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const titulo = String(body?.titulo ?? "").trim();
    const clienteNome = String(body?.clienteNome ?? "").trim();

    if (!titulo || !clienteNome) {
      return NextResponse.json(
        { ok: false, error: "titulo e clienteNome são obrigatórios." },
        { status: 400 }
      );
    }

    const s = await requireUser();
    const tenant = s.tenant;

    // Gera slug único (tenta algumas vezes)
    let slugPublico = makeSlug();
    for (let i = 0; i < 5; i++) {
      const exists = await prisma.comparativo.findUnique({ where: { slugPublico } });
      if (!exists) break;
      slugPublico = makeSlug();
    }

    const created = await prisma.comparativo.create({
      data: {
        tenantId: tenant.id,
        titulo,
        clienteNome,
        slugPublico,
        // defaults dos blocos já são true no schema
      },
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
      },
    });

    return NextResponse.json({ ok: true, comparativo: created });
  } catch (err) {
    console.error("POST /api/comparativos/create error:", err);
    return NextResponse.json(
      { ok: false, error: "Erro ao criar comparativo." },
      { status: 500 }
    );
  }
}
