import { Prisma } from "@prisma/client";

import {
  getFinanceApiSession,
} from "@/lib/financeiro/access.server";

import { prisma } from "@/lib/prisma";

function optionalString(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function decimalValue(value: unknown) {
  const text = String(value ?? "")
    .trim()
    .replace(/\s/g, "");

  if (!text) return null;

  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;

  const number = Number(normalized);

  if (!Number.isFinite(number) || number < 0) {
    throw new Error("Valor apurado inválido.");
  }

  return new Prisma.Decimal(number);
}

function dateValue(value: unknown) {
  const text = optionalString(value);

  if (!text) return null;

  const date = new Date(`${text}T12:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Data inválida.");
  }

  return date;
}

function defaultDueDate(year: number, month: number) {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  return new Date(
    Date.UTC(nextYear, nextMonth - 1, 20, 12, 0, 0)
  );
}

async function calculateProvision(
  tenantId: string,
  year: number,
  month: number
) {
  const taxEntries =
    await prisma.financialTaxEntry.findMany({
      where: {
        tenantId,
        kind: "PAYABLE_BY_COMPANY",
        status: { not: "CANCELLED" },
        invoice: {
          tenantId,
          status: "ISSUED",
          competenceYear: year,
          competenceMonth: month,
        },
      },
      select: {
        id: true,
        amount: true,
      },
    });

  const provisioned = taxEntries.reduce(
    (total, item) => total + Number(item.amount || 0),
    0
  );

  return {
    taxEntries,
    provisioned: new Prisma.Decimal(
      Math.round((provisioned + Number.EPSILON) * 100) /
        100
    ),
  };
}

export async function POST(req: Request) {
  const auth = await getFinanceApiSession();

  if (!auth.ok) {
    return Response.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  try {
    const tenantId = auth.session.tenant.id;
    const body = await req.json();
    const action = String(body.action || "ensure");

    if (action === "ensure") {
      const year = Number(body.competenceYear);
      const month = Number(body.competenceMonth);

      if (
        !Number.isInteger(year) ||
        year < 2000 ||
        year > 2200 ||
        !Number.isInteger(month) ||
        month < 1 ||
        month > 12
      ) {
        throw new Error("Competência inválida.");
      }

      const { provisioned } = await calculateProvision(
        tenantId,
        year,
        month
      );

      const closing =
        await prisma.financialTaxClosing.upsert({
          where: {
            tenantId_competenceYear_competenceMonth: {
              tenantId,
              competenceYear: year,
              competenceMonth: month,
            },
          },
          create: {
            tenantId,
            competenceYear: year,
            competenceMonth: month,
            status: "OPEN",
            provisionedAmount: provisioned,
            separatedAmount: new Prisma.Decimal(0),
            dueDate: defaultDueDate(year, month),
          },
          update:
            body.refreshProvision === false
              ? {}
              : {
                  provisionedAmount: provisioned,
                },
        });

      return Response.json({
        ok: true,
        closing,
      });
    }

    if (action !== "update") {
      throw new Error("Ação inválida.");
    }

    const closingId = String(body.closingId || "").trim();

    if (!closingId) {
      throw new Error("Fechamento não informado.");
    }

    const current =
      await prisma.financialTaxClosing.findFirst({
        where: {
          id: closingId,
          tenantId,
        },
        select: {
          id: true,
          status: true,
          competenceYear: true,
          competenceMonth: true,
        },
      });

    if (!current) {
      return Response.json(
        { error: "Fechamento fiscal não encontrado." },
        { status: 404 }
      );
    }

    if (current.status === "CANCELLED") {
      throw new Error("Este fechamento está cancelado.");
    }

    const reserveAccountId = optionalString(
      body.reserveAccountId
    );

    if (reserveAccountId) {
      const account =
        await prisma.financialAccount.findFirst({
          where: {
            id: reserveAccountId,
            tenantId,
            active: true,
          },
          select: { id: true },
        });

      if (!account) {
        throw new Error("Conta de reserva inválida.");
      }
    }

    const closing =
      await prisma.financialTaxClosing.update({
        where: { id: current.id },
        data: {
          actualTaxAmount: decimalValue(
            body.actualTaxAmount
          ),
          dueDate:
            dateValue(body.dueDate) ||
            defaultDueDate(
              current.competenceYear,
              current.competenceMonth
            ),
          reserveAccountId,
          notes: optionalString(body.notes),
        },
      });

    return Response.json({
      ok: true,
      closing,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao salvar fechamento fiscal.",
      },
      { status: 400 }
    );
  }
}
