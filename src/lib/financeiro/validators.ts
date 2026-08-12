import { Prisma } from "@prisma/client";

export function requiredString(
  value: unknown,
  fieldName = "campo"
) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw new Error(`${fieldName} é obrigatório.`);
  }

  return text;
}

export function optionalString(value: unknown) {
  const text = String(value ?? "").trim();

  return text || null;
}

export function optionalDate(value: unknown) {
  if (!value) {
    return null;
  }

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    throw new Error("Data inválida.");
  }

  return date;
}

export function requiredDate(
  value: unknown,
  fieldName = "data"
) {
  const date = optionalDate(value);

  if (!date) {
    throw new Error(`${fieldName} é obrigatória.`);
  }

  return date;
}

export function optionalDecimal(value: unknown) {
  if (value == null || value === "") {
    return null;
  }

  const normalized = String(value)
    .trim()
    .replace(/\./g, "")
    .replace(",", ".");

  try {
    return new Prisma.Decimal(normalized);
  } catch {
    throw new Error("Valor numérico inválido.");
  }
}

export function requiredDecimal(
  value: unknown,
  fieldName = "valor"
) {
  const decimal = optionalDecimal(value);

  if (!decimal) {
    throw new Error(`${fieldName} é obrigatório.`);
  }

  return decimal;
}

export function optionalInteger(value: unknown) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    throw new Error("Número inteiro inválido.");
  }

  return parsed;
}

export function ensurePositiveDecimal(
  value: Prisma.Decimal,
  fieldName = "valor"
) {
  if (value.lte(0)) {
    throw new Error(`${fieldName} deve ser maior que zero.`);
  }

  return value;
}

export function ensurePercentage(
  value: Prisma.Decimal | null
) {
  if (value == null) {
    return null;
  }

  if (value.lt(0) || value.gt(100)) {
    throw new Error(
      "Percentual deve estar entre 0 e 100."
    );
  }

  return value;
}

export function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Erro inesperado.";
}