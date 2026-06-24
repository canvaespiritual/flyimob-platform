import { NextRequest, NextResponse } from "next/server";
import { simulateMcmv } from "@/lib/mcmv/simulate";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const nome = body.nome ?? "";
    const renda = Number(body.renda);
    const temFgts3Anos = Boolean(body.temFgts3Anos);
    const temDependenteOuMaisDeUmComprador = Boolean(
      body.temDependenteOuMaisDeUmComprador
    );

    if (!renda || renda <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Informe uma renda válida.",
        },
        { status: 400 }
      );
    }

    const result = simulateMcmv({
      nome,
      renda,
      temFgts3Anos,
      temDependenteOuMaisDeUmComprador,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Erro simulador MCMV:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Erro ao processar simulação.",
      },
      { status: 500 }
    );
  }
}
