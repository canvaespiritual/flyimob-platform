import { MarketingError, period, civilToday, day } from "@/lib/marketing/policy";
export type OfficeViewer = { user: { id: string; tenantId: string; role: string }; tenant: { id: string; isPlatform: boolean } };
export function authorizeOffice(viewer: OfficeViewer) {
  if (viewer.tenant.isPlatform || viewer.user.role !== "BROKER" || viewer.user.tenantId !== viewer.tenant.id) throw new MarketingError(403, "Esta visão pertence ao corretor autenticado.");
}
export function officePeriod(params: URLSearchParams) {
  if ([...params.keys()].some(k => !["period", "from", "to"].includes(k))) throw new MarketingError(400, "Use somente os filtros de período. A identidade vem do seu login.");
  if (["period", "from", "to"].some(k => params.getAll(k).length > 1)) throw new MarketingError(400, "Filtro duplicado.");
  const today = civilToday();
  const range = params.get("period") === "last30" ? period(new URLSearchParams({ period: "custom", from: new Date(day(today).getTime() - 29 * 86400000).toISOString().slice(0, 10), to: today })) : period(params);
  if (range.to > civilToday()) throw new MarketingError(400, "Não selecione datas futuras.");
  return { ...range, start: day(range.from), end: new Date(day(range.to).getTime() + 86400000 - 1) };
}
export function ownsMetric(assignments: { personId: string | null; brokerId: string | null; validFrom: Date; validTo: Date | null }[], date: Date, personIds: string[], userId: string) {
  const active = assignments.filter(a => a.validFrom <= date && (!a.validTo || date < a.validTo));
  // Ambiguous overlapping ownership is never distributed or exposed by guessing.
  return active.length === 1 && (active[0].personId ? personIds.includes(active[0].personId) : active[0].brokerId === userId);
}
