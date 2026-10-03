import { getPermissionApiSession } from "@/lib/api-access.server";
import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

function str(v: any) {
  return String(v ?? "").trim();
}

export async function POST(req: Request) {
  const auth = await getPermissionApiSession("comparativos:use");
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));

    const id = str(body?.id);
    const titulo = str(body?.titulo);
    const clienteNome = str(body?.clienteNome);

    if (!id) {
      return NextResponse.json({ ok: false, error: "id é obrigatório." }, { status: 400 });
    }
    if (!titulo || !clienteNome) {
      return NextResponse.json(
        { ok: false, error: "titulo e clienteNome são obrigatórios." },
        { status: 400 }
      );
    }

    const s = auth.session;
    const tenant = s.tenant;

    await prisma.comparativo.update({
      where: { id },
      data: {
        titulo,
        clienteNome,
        showGeral: Boolean(body?.showGeral),
        showEntrada: Boolean(body?.showEntrada),
        showFinanciamento: Boolean(body?.showFinanciamento),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/comparativos/update error:", err);
    return NextResponse.json({ ok: false, error: "Erro ao salvar comparativo." }, { status: 500 });
  }
}
