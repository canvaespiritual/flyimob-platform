import { Prisma } from "@prisma/client";

export type MoneyLike =
  | Prisma.Decimal
  | number
  | string
  | null
  | undefined;

export function toDecimal(value: MoneyLike) {
  if (value == null || value === "") {
    return new Prisma.Decimal(0);
  }

  if (value instanceof Prisma.Decimal) {
    return value;
  }

  return new Prisma.Decimal(value);
}

export function nullableDecimal(value: unknown) {
  if (value == null || value === "") {
    return null;
  }

  try {
    return new Prisma.Decimal(String(value).replace(",", "."));
  } catch {
    return null;
  }
}

export function moneyAdd(...values: MoneyLike[]): Prisma.Decimal {
  let total = new Prisma.Decimal(0);

  for (const value of values) {
    total = total.plus(toDecimal(value));
  }

  return total;
}

export function moneySubtract(
  base: MoneyLike,
  ...values: MoneyLike[]
): Prisma.Decimal {
  let total = toDecimal(base);

  for (const value of values) {
    total = total.minus(toDecimal(value));
  }

  return total;
}

export function moneyMultiply(value: MoneyLike, multiplier: MoneyLike) {
  return toDecimal(value).mul(toDecimal(multiplier));
}

export function moneyDivide(value: MoneyLike, divisor: MoneyLike) {
  const d = toDecimal(divisor);

  if (d.isZero()) {
    return new Prisma.Decimal(0);
  }

  return toDecimal(value).div(d);
}

export function percentageOf(
  base: MoneyLike,
  percentage: MoneyLike
) {
  return toDecimal(base)
    .mul(toDecimal(percentage))
    .div(100);
}

export function roundMoney(value: MoneyLike) {
  return toDecimal(value).toDecimalPlaces(
    2,
    Prisma.Decimal.ROUND_HALF_UP
  );
}

export function isMoneyZero(value: MoneyLike, tolerance = "0.01") {
  return toDecimal(value).abs().lte(new Prisma.Decimal(tolerance));
}

export function decimalToNumber(value: MoneyLike) {
  return Number(toDecimal(value).toFixed(2));
}

export function formatBRL(value: MoneyLike) {
  const number = decimalToNumber(value);

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(number);
}

export function parseBRLMoney(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const cleaned = value
    .trim()
    .replace(/\s/g, "")
    .replace(/^R\$/i, "")
    .replace(/\./g, "")
    .replace(",", ".");

  if (!cleaned) {
    return null;
  }

  try {
    return roundMoney(new Prisma.Decimal(cleaned));
  } catch {
    return null;
  }
}

export function decimalOrNull(value: MoneyLike) {
  if (value == null || value === "") {
    return null;
  }

  return roundMoney(value);
}