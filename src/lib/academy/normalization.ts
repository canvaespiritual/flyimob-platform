import { AcademyError } from "./limits";

export function normalizeEmail(value: unknown): string {
  const email = String(value ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) throw new AcademyError(400, "invalid_email");
  return email;
}

export function normalizePhone(value: unknown): string {
  const phone = String(value ?? "").replace(/\D/g, "");
  if (phone.length < 10 || phone.length > 15) throw new AcademyError(400, "invalid_phone");
  return phone;
}

export function normalizeName(value: unknown): string {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 160) throw new AcademyError(400, "invalid_name");
  return name;
}
