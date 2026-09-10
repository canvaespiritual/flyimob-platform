import { NextResponse } from "next/server";
import { FinancialStageType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getFinanceApiSession } from "@/lib/financeiro/access.server";
import {
  errorMessage,
  optionalDecimal,
  optionalString,
  requiredString,
} from "@/lib/financeiro/validators";
import { writeFinancialAudit } from "@/lib/financeiro/audit.server";

export async function POST(req: Request) {
  const auth = await getFinanceApiSession();

  if (!auth.ok) {
    return Response.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  try {
    const body = await req.json();
    const tenantId = auth.session.tenant.id;

    const saleId = requiredString(body.saleId, "Venda");

    const sale = await prisma.financialSale.findFirst({
      where: {
        id: saleId,
        tenantId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!sale) {
      return Response.json(
        { error: "Venda não encontrada." },
        { status: 404 }
      );
    }

    if (sale.status === "CANCELLED") {
      throw new Error(
        "Não é possível adicionar etapa a uma venda cancelada."
      );
    }

    const type = requiredString(body.type, "Tipo") as FinancialStageType;

    const validStageTypes: FinancialStageType[] = [
      "ATO",
      "BANCO",
      "PREMIO",
      "COMPLEMENTO",
      "OUTRO",
    ];

    if (!validStageTypes.includes(type)) {
      throw new Error("Tipo de etapa inválido.");
    }

    const isPrincipal = type === "ATO" || type === "BANCO";

    const commissionSharePercent = isPrincipal
      ? optionalDecimal(body.commissionSharePercent)
      : null;

    const expectedGrossAmount = optionalDecimal(body.expectedGrossAmount);

    if (!expectedGrossAmount) {
      throw new Error("Informe o valor previsto da etapa.");
    }

    const lastStage = await prisma.financialStage.findFirst({
      where: {
        saleId,
        tenantId,
      },
      orderBy: {
        sequence: "desc",
      },
      select: {
        sequence: true,
      },
    });

    const stage = await prisma.financialStage.create({
      data: {
        tenantId,
        saleId,
        type,
        label: optionalString(body.label),
        sequence: (lastStage?.sequence ?? -1) + 1,
        commissionSharePercent,
        expectedGrossAmount,
        status: "EXPECTED",
        notes: optionalString(body.notes),
      },
    });

    void writeFinancialAudit({
      tenantId,
      entityType: "FinancialStage",
      entityId: stage.id,
      action: "CREATE",
      userId: auth.session.user.id,
      afterData: stage,
    });

    return Response.json({
      ok: true,
      stage,
    });
  } catch (error) {
    return Response.json(
      { error: errorMessage(error) },
      { status: 400 }
    );
  }
}