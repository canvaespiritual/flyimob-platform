import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize, bodyObject, civilToday, day, MarketingError, text, type MarketingViewer } from "./policy";
import { audit, marketingTransaction } from "./admin.server";
import { canActAsSalesResponsible } from "@/lib/team/policy";
import { movementMoney, localDayBoundary } from "./finance-calculations";

export async function createMoneyMovement(viewer: MarketingViewer, value: unknown, db = prisma) {
  authorize(viewer, true);
  const b = bodyObject(value, ["accountId", "personId", "kind", "origin", "adjustmentType", "affectsPhysicalBalance", "status", "effectiveDate", "amount", "currency", "note", "reason", "idempotencyKey"]);
  const accountId = text(b.accountId, "Conta"), kind = text(b.kind, "Tipo"), origin = text(b.origin, "Origem"), status = text(b.status, "Status"), currency = text(b.currency, "Moeda", 3);
  if (!["CONTRIBUTION", "ADJUSTMENT"].includes(kind) || !["PERSON", "FLYIMOB", "OTHER"].includes(origin) || !["PENDING", "CONFIRMED"].includes(status)) throw new MarketingError(400, "Classificação financeira inválida.");
  const amount = movementMoney(b.amount, kind === "ADJUSTMENT"), effectiveDate = day(b.effectiveDate);
  const personId = origin === "PERSON" ? text(b.personId, "Pessoa") : null;
  if (origin !== "PERSON" && b.personId) throw new MarketingError(400, "Pessoa somente para origem Pessoa operacional.");
  const adjustmentType = kind === "ADJUSTMENT" ? text(b.adjustmentType, "Tipo de ajuste", 30) : null;
  if (adjustmentType && !["REFUND", "PROMOTIONAL_CREDIT", "CORRECTION", "COMPENSATION", "OTHER"].includes(adjustmentType)) throw new MarketingError(400, "Tipo de ajuste inválido.");
  const affectsPhysicalBalance = kind === "CONTRIBUTION" ? true : b.affectsPhysicalBalance;
  if (typeof affectsPhysicalBalance !== "boolean") throw new MarketingError(400, "Informe se o ajuste altera o caixa físico Meta.");
  const reason = kind === "ADJUSTMENT" ? text(b.reason, "Motivo", 1000) : null;
  const note = b.note ? text(b.note, "Observação", 1000) : null, idempotencyKey = text(b.idempotencyKey, "Chave", 80);
  const payload = { accountId, personId, kind, origin, adjustmentType, affectsPhysicalBalance, status, effectiveDate, amount, currency, note, reason };
  return marketingTransaction(db, async tx => {
    const tenantId = viewer.tenant.id;
    const existing = await tx.marketingMoneyMovement.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } } });
    if (existing) {
      if (existing.createdById !== viewer.user.id || Object.entries(payload).some(([k,v]) => String(existing[k as keyof typeof existing] ?? "") !== String(v ?? ""))) throw new MarketingError(409, "Chave já usada para outro movimento.");
      return { id: existing.id };
    }
    const account = await tx.metaAdAccount.findFirst({ where: { tenantId, id: accountId }, select: { currency: true, timezone: true } });
    if (!account || account.currency !== currency) throw new MarketingError(400, "Conta ou moeda inválida nesta operação.");
    const minorUnits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
    if (minorUnits > 2 || amount.decimalPlaces() > minorUnits) throw new MarketingError(400, "Precisão monetária incompatível com a moeda da conta.");
    if (effectiveDate > day(civilToday(account.timezone))) throw new MarketingError(400, "A data efetiva não pode estar no futuro.");
    if (personId) { const person = await tx.operationPerson.findFirst({ where: { tenantId, id: personId } }); if (!person || !canActAsSalesResponsible(person)) throw new MarketingError(400, "Pessoa inválida ou inativa nesta operação."); }
    const result = await tx.marketingMoneyMovement.create({ data: { tenantId, ...payload, idempotencyKey, createdById: viewer.user.id }, select: { id: true } });
    await audit(tx, viewer, "MARKETING_MONEY_CREATED", result.id, { after: { ...payload, amount: amount.toFixed(2), effectiveDate: effectiveDate.toISOString().slice(0,10) } });
    return result;
  });
}
export async function transitionMoneyMovement(viewer: MarketingViewer, id: string, value: unknown, db = prisma) {
  authorize(viewer, true); const b = bodyObject(value, ["version", "status", "reason"]);
  if (!Number.isSafeInteger(b.version) || Number(b.version) < 0 || !["CONFIRMED", "CANCELLED"].includes(String(b.status))) throw new MarketingError(400, "Transição inválida.");
  const reason = text(b.reason, "Motivo", 1000);
  return marketingTransaction(db, async tx => {
    const tenantId = viewer.tenant.id;
    const current = await tx.marketingMoneyMovement.findFirst({ where: { tenantId, id } });
    if (!current) throw new MarketingError(404, "Movimento não encontrado.");
    if (current.version !== b.version || current.status === "CANCELLED" || (b.status === "CONFIRMED" && current.status !== "PENDING")) throw new MarketingError(409, "Movimento atualizado ou transição inválida.");
    await audit(tx, viewer, "MARKETING_MONEY_STATUS_CHANGED", id, { before: { status: current.status, version: current.version }, after: { status: String(b.status), version: current.version + 1, reason } });
    const result = await tx.marketingMoneyMovement.updateMany({ where: { tenantId, id, version: current.version, status: current.status }, data: { status: String(b.status), version: { increment: 1 } } });
    if (!result.count) throw new MarketingError(409, "Movimento atualizado. Recarregue.");
    return { id };
  });
}
export async function createReconciliationMark(viewer: MarketingViewer, value: unknown, db = prisma) {
  authorize(viewer, true); const b = bodyObject(value, ["accountId", "effectiveDate", "effectiveTime", "openingBalance", "note", "idempotencyKey"]);
  const accountId = text(b.accountId, "Conta"), date = day(b.effectiveDate), note = text(b.note, "Observação", 1000), idempotencyKey = text(b.idempotencyKey, "Chave", 80);
  if (typeof b.openingBalance !== "string" || !/^\d{1,12}(\.\d{1,2})?$/.test(b.openingBalance)) throw new MarketingError(400, "Saldo inicial inválido.");
  return marketingTransaction(db, async tx => {
    const tenantId = viewer.tenant.id;
    const account = await tx.metaAdAccount.findFirst({ where: { tenantId, id: accountId } });
    if (!account || date > day(civilToday(account.timezone))) throw new MarketingError(400, "Conta ou data inválida.");
    const actual = new Prisma.Decimal(String(b.openingBalance));
    const effectiveAt = localDayBoundary(String(b.effectiveDate), account.timezone, b.effectiveTime === undefined ? "00:00" : String(b.effectiveTime));
    if (effectiveAt > new Date()) throw new MarketingError(400, "O marco não pode estar no futuro.");
    const existing = await tx.marketingReconciliationMark.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } } });
    if (existing) { if (existing.accountId !== accountId || existing.effectiveDate.getTime() !== date.getTime() || existing.effectiveAt.getTime() !== effectiveAt.getTime() || !existing.openingBalance.eq(actual) || existing.note !== note || existing.createdById !== viewer.user.id) throw new MarketingError(409, "Chave já utilizada."); return { id: existing.id }; }
    const mark = await tx.marketingReconciliationMark.create({ data: { tenantId, accountId, effectiveDate: date, effectiveAt, openingBalance: actual, currency: account.currency, note, idempotencyKey, createdById: viewer.user.id } });
    await audit(tx, viewer, "MARKETING_RECONCILIATION_MARK_CREATED", mark.id, { after: { accountId, effectiveDate: String(b.effectiveDate), effectiveAt: effectiveAt.toISOString(), openingBalance: actual.toFixed(2), note } });
    return { id: mark.id };
  });
}
