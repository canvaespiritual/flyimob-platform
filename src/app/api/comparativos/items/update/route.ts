import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";


function numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function strOrNull(v: any): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const itemId = String(body?.id ?? body?.itemId ?? "");
    if (!itemId) {
      return NextResponse.json({ ok: false, error: "itemId é obrigatório." }, { status: 400 });
    }

    await prisma.comparativoItem.update({
      where: { id: itemId },
      data: {
        // principais
        valorTotal: numOrNull(body?.valorTotal),
        entradaTotal: numOrNull(body?.entradaTotal),
        sinalEntrada: numOrNull(body?.sinalEntrada),
        parcelaEntrada: numOrNull(body?.parcelaEntrada),
        parcelasEntradaQtd: intOrNull(body?.parcelasEntradaQtd),

        // flex
        parcelasIntermediarias: strOrNull(body?.parcelasIntermediarias),
        parcelasAnuais: strOrNull(body?.parcelasAnuais),
        parcelaUnica: strOrNull(body?.parcelaUnica),
        parcelaEspecial: strOrNull(body?.parcelaEspecial),

        // financiamento
        saldoFinanciamento: numOrNull(body?.saldoFinanciamento),
        parcelaFinanciamento: numOrNull(body?.parcelaFinanciamento),
        taxaJuros: numOrNull(body?.taxaJuros),
        rendaBrutaFamiliar: numOrNull(body?.rendaBrutaFamiliar),

        // benefícios
        fgts: numOrNull(body?.fgts),
        subsidioFederal: numOrNull(body?.subsidioFederal),
        subsidioEstadual: numOrNull(body?.subsidioEstadual),
        subsidioMunicipal: numOrNull(body?.subsidioMunicipal),

        // custos/obs
        estimativaDocumentacao: numOrNull(body?.estimativaDocumentacao),
        observacao: strOrNull(body?.observacao),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/comparativos/items/update error:", err);
    return NextResponse.json({ ok: false, error: "Erro ao salvar item." }, { status: 500 });
  }
}
