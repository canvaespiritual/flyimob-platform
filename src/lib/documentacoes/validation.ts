import { DocumentationFolderStatus, DocumentationPersonRelationship } from "@prisma/client";

export class DocumentationError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export type Input = Record<string, unknown>;
export function input(value: unknown): Input {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DocumentationError(400, "Dados inválidos.");
  return value as Input;
}
export function text(value: unknown, field: string, required = false, max = 160): string | null {
  if (value === undefined || value === null || value === "") {
    if (required) throw new DocumentationError(400, `${field} é obrigatório.`);
    return null;
  }
  if (typeof value !== "string" || value.trim().length > max || /[\u0000-\u0008]/.test(value)) throw new DocumentationError(400, `${field} inválido.`);
  const result = value.trim();
  if (!result && required) throw new DocumentationError(400, `${field} é obrigatório.`);
  return result || null;
}
export function integer(value: unknown, field: string, max = 1000000) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > max) throw new DocumentationError(400, `${field} inválido.`);
  return value;
}
export function boolean(value: unknown, field: string) {
  if (typeof value !== "boolean") throw new DocumentationError(400, `${field} inválido.`);
  return value;
}
export function cpf(value: unknown, required = false) {
  const raw = text(value, "CPF", required, 18);
  if (!raw) return null;
  if (!/^[\d.\-\s]+$/.test(raw)) throw new DocumentationError(400, "CPF inválido.");
  const digits = raw.replace(/\D/g, "");
  if (!/^\d{11}$/.test(digits) || /^(\d)\1+$/.test(digits)) throw new DocumentationError(400, "CPF inválido.");
  for (let size = 9; size <= 10; size++) {
    const total = [...digits.slice(0, size)].reduce((sum, digit, index) => sum + Number(digit) * (size + 1 - index), 0);
    const check = (total * 10) % 11 % 10;
    if (check !== Number(digits[size])) throw new DocumentationError(400, "CPF inválido.");
  }
  return digits;
}
export function date(value: unknown) {
  const raw = text(value, "Data", false, 10);
  if (!raw) return null;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) throw new DocumentationError(400, "Data inválida.");
  return parsed;
}
export function personInput(body: Input, titular = false) {
  const relationship = body.relationship;
  if (!Object.values(DocumentationPersonRelationship).includes(relationship as DocumentationPersonRelationship)) throw new DocumentationError(400, "Vínculo inválido.");
  titular = titular || relationship === "TITULAR";
  const email = text(body.email, "E-mail", false, 320);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new DocumentationError(400, "E-mail inválido.");
  return { name: text(body.name, "Nome", true)!, cpf: cpf(body.cpf, titular),
    phone: text(body.phone, "Telefone", titular, 40), email: email?.toLowerCase() ?? null,
    birthDate: date(body.birthDate), relationship: relationship as DocumentationPersonRelationship };
}
export function editableStatus(value: unknown): DocumentationFolderStatus {
  if (value !== "EM_MONTAGEM" && value !== "AGUARDANDO_DOCUMENTOS") throw new DocumentationError(400, "Esta etapa permite apenas montagem ou espera de documentos.");
  return value;
}
