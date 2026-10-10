import { MarketingError } from './policy';

/** Repeated query keys preserve the legacy single-ID contract. Empty means unrestricted. */
export function selectionIds(params: URLSearchParams, key: string): string[] {
  const ids = [...new Set(params.getAll(key).filter(Boolean))];
  if (ids.some(id => id.length > 200 || /[\s,\x00-\x1f]/.test(id))) throw new MarketingError(400, 'Seleção inválida.');
  return ids;
}
export function assertSelection(ids: string[], available: {id: string}[], unassigned = false) {
  const allowed = new Set(available.map(item => item.id));
  if (ids.some(id => !(unassigned && id === 'unassigned') && !allowed.has(id)))
    throw new MarketingError(404, 'Seleção não encontrada na operação.');
}
