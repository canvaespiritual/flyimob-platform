import { Prisma } from "@prisma/client";

function serializeValue(value: unknown): unknown {
  if (value instanceof Prisma.Decimal) {
    return value.toNumber();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }

  if (
    value &&
    typeof value === "object"
  ) {
    const output: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value)) {
      output[key] = serializeValue(item);
    }

    return output;
  }

  return value;
}

export function serializeFinancial<T>(value: T) {
  return serializeValue(value) as T;
}