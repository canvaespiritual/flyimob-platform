import type { UserRole } from "@prisma/client";

export type MarketingViewer = {
  user: { id: string; tenantId: string; role: UserRole };
  tenant: { id: string; isPlatform: boolean };
};
export function canAccessMarketing(viewer: MarketingViewer) {
  return !viewer.tenant.isPlatform && viewer.user.tenantId === viewer.tenant.id &&
    (viewer.user.role === "OWNER" || viewer.user.role === "DIRECTOR");
}
export function canConfigureMarketing(viewer: MarketingViewer) {
  return canAccessMarketing(viewer) && viewer.user.role === "OWNER";
}

export const purposes = {
  CLIENTES: "Clientes", RECRUTAMENTO: "Recrutamento",
  INSTITUCIONAL_OUTRO: "Institucional/Outro", NAO_CLASSIFICADA: "Não classificada",
} as const;
export const trackingStatuses = { ACTIVE: "Em acompanhamento", PAUSED: "Pausada", ARCHIVED: "Arquivada" } as const;
export class MarketingError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function authorize(viewer: MarketingViewer, ownerOnly = false) {
  if (!(ownerOnly ? canConfigureMarketing(viewer) : canAccessMarketing(viewer))) {
    throw new MarketingError(403, "Acesso não permitido ao Marketing.");
  }
}
export function text(value: unknown, label: string, max = 160) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new MarketingError(400, `${label} inválido.`);
  return value.trim();
}
export function bodyObject(value: unknown, allowed: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MarketingError(400, "Dados inválidos.");
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new MarketingError(400, "Campo não permitido.");
  return body;
}
export function day(value: unknown): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new MarketingError(400, "Data inválida. Use dia, mês e ano.");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new MarketingError(400, "Data inválida.");
  return parsed;
}
export function civilToday(timezone = "America/Sao_Paulo", now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const part = (kind: string) => parts.find(p => p.type === kind)!.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  } catch { throw new MarketingError(400, "Fuso horário inválido."); }
}
export function period(params: URLSearchParams, today = civilToday()) {
  const end = day(today); let start = new Date(end); let to = today;
  const preset = params.get("period") ?? "month";
  if (preset === "yesterday") { start.setUTCDate(start.getUTCDate() - 1); to = start.toISOString().slice(0, 10); }
  else if (preset === "week") start.setUTCDate(start.getUTCDate() - 6);
  else if (preset === "month") start.setUTCDate(1);
  else if (preset === "previous") { start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1)); to = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 0)).toISOString().slice(0, 10); }
  else if (preset === "custom") { start = day(params.get("from")); to = day(params.get("to")).toISOString().slice(0, 10); }
  else if (preset !== "today") throw new MarketingError(400, "Período inválido.");
  const from = start.toISOString().slice(0, 10);
  if (from > to || day(to).getTime() - start.getTime() > 366 * 86400000) throw new MarketingError(400, "Escolha um período de até 367 dias.");
  return { from, to, preset };
}
