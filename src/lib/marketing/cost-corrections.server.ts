import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize, bodyObject, day, MarketingError, text, type MarketingViewer } from "./policy";
import { audit, marketingTransaction } from "./admin.server";
import { effectiveSpend, type ReportRow } from "./metrics.server";

export const costCorrectionEvent = "COST_RULE_VALIDITY_CORRECTED";
type Rule = { id: string; percentage: Prisma.Decimal; validFrom: Date; validTo: Date | null };
const iso = (value: Date) => value.toISOString().slice(0, 10);
const select = { id: true, percentage: true, validFrom: true, validTo: true } as const;
function fingerprint(rules: Rule[]) {
  return createHash("sha256").update(JSON.stringify(rules.map(r => [r.id, r.percentage.toString(), iso(r.validFrom), r.validTo && iso(r.validTo)]))).digest("hex");
}
export function correctionPlan(rules: Rule[], id: string, newStart: string) {
  const rule = rules.find(r => r.id === id);
  if (!rule) throw new MarketingError(404, "Regra não encontrada nesta operação.");
  const validFrom = day(newStart);
  if (validFrom.getTime() === rule.validFrom.getTime()) throw new MarketingError(400, "Informe um início diferente do atual.");
  const changed = rules.map(r => r.id === id ? { ...r, validFrom } : r).sort((a, b) => a.validFrom.getTime() - b.validFrom.getTime());
  for (let i = 0; i < changed.length; i++) {
    const r = changed[i], previous = changed[i - 1];
    if ((r.validTo && r.validTo <= r.validFrom) || (previous && (!previous.validTo || previous.validTo > r.validFrom))) {
      throw new MarketingError(409, "A correção sobrepõe outra vigência ou ultrapassa o fim da regra. As regras vizinhas serão preservadas.");
    }
  }
  const before = iso(rule.validFrom), after = iso(validFrom);
  return { rule, validFrom, affectedFrom: before < after ? before : after, affectedTo: before < after ? after : before };
}
type Review = { purpose: "marketing-cost-validity-v1"; tenantId: string; actorId: string; ruleId: string; newStart: string; reason: string; fingerprint: string; expiresAt: number };
function signature(payload: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new MarketingError(503, "Configuração de segurança indisponível.");
  return createHmac("sha256", secret).update(`marketing-cost-validity-v1:${payload}`).digest();
}
function decodeReview(value: unknown, viewer: MarketingViewer, id: string): Review {
  const token = text(value, "Revisão", 8192), [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined || !/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]{43}$/.test(sig)) throw new MarketingError(400, "Revisão inválida. Revise a correção novamente.");
  const received = Buffer.from(sig, "base64url"), expected = signature(payload);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new MarketingError(400, "Revisão inválida. Revise a correção novamente.");
  let review: Review;
  try { review = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { throw new MarketingError(400, "Revisão inválida."); }
  if (!review || review.purpose !== "marketing-cost-validity-v1" || review.tenantId !== viewer.tenant.id || review.actorId !== viewer.user.id || review.ruleId !== id || !Number.isFinite(review.expiresAt) || review.expiresAt <= Date.now()) throw new MarketingError(409, "A revisão expirou ou pertence a outro contexto. Revise novamente.");
  day(review.newStart); text(review.reason, "Motivo da correção", 1000);
  return review;
}
export async function previewCostCorrection(viewer: MarketingViewer, id: string, value: unknown, db = prisma) {
  authorize(viewer, true);
  const body = bodyObject(value, ["validFrom", "reason"]);
  const newStart = iso(day(body.validFrom)), reason = text(body.reason, "Motivo da correção", 1000);
  const rules = await db.marketingCostRule.findMany({ where: { tenantId: viewer.tenant.id }, select, orderBy: { validFrom: "asc" } });
  const plan = correctionPlan(rules, id, newStart);
  const review: Review = { purpose: "marketing-cost-validity-v1", tenantId: viewer.tenant.id, actorId: viewer.user.id, ruleId: id, newStart, reason, fingerprint: fingerprint(rules), expiresAt: Date.now() + 15 * 60 * 1000 };
  const payload = Buffer.from(JSON.stringify(review)).toString("base64url");
  return { reviewToken: `${payload}.${signature(payload).toString("base64url")}`, percentage: plan.rule.percentage.toString(), oldStart: iso(plan.rule.validFrom), newStart, affectedFrom: plan.affectedFrom, affectedTo: plan.affectedTo, reason };
}
export async function confirmCostCorrection(viewer: MarketingViewer, id: string, value: unknown, db = prisma) {
  authorize(viewer, true);
  const body = bodyObject(value, ["reviewToken", "confirmed"]);
  if (body.confirmed !== true) throw new MarketingError(400, "Confirmação explícita obrigatória.");
  const review = decodeReview(body.reviewToken, viewer, id);
  return marketingTransaction(db, async tx => {
    const rules = await tx.marketingCostRule.findMany({ where: { tenantId: viewer.tenant.id }, select, orderBy: { validFrom: "asc" } });
    if (fingerprint(rules) !== review.fingerprint) throw new MarketingError(409, "As vigências mudaram desde a revisão. Revise novamente.");
    const plan = correctionPlan(rules, id, review.newStart);
    await audit(tx, viewer, costCorrectionEvent, id, {
      percentage: plan.rule.percentage.toString(),
      before: { validFrom: iso(plan.rule.validFrom), validTo: plan.rule.validTo && iso(plan.rule.validTo) },
      after: { validFrom: review.newStart, validTo: plan.rule.validTo && iso(plan.rule.validTo), affectedFrom: plan.affectedFrom, affectedTo: plan.affectedTo, reason: review.reason },
    });
    await tx.marketingCostRule.update({ where: { tenantId_id: { tenantId: viewer.tenant.id, id } }, data: { validFrom: plan.validFrom } });
    return { id };
  });
}

/** Query-only overlay for explicitly corrected days. Original ingestion snapshots remain intact. */
export function applyCostCorrections<T extends ReportRow>(rows: T[], rules: Rule[], events: { metadata: Prisma.JsonValue }[]): T[] {
  const ranges = events.map(event => {
    const after = (event.metadata as { after?: { affectedFrom?: string; affectedTo?: string } } | null)?.after;
    if (!after?.affectedFrom || !after.affectedTo) throw new MarketingError(503, "Auditoria da correção precisa ser revisada.");
    return { from: day(after.affectedFrom), to: day(after.affectedTo) };
  });
  return rows.map(row => {
    if (row.state !== "CONFIRMED" || row.metaSpend === null || !ranges.some(r => r.from <= row.date && row.date < r.to)) return row;
    const rule = rules.find(r => r.validFrom <= row.date && (!r.validTo || row.date < r.validTo));
    return { ...row, effectiveSpend: effectiveSpend(row.metaSpend, rule?.percentage ?? new Prisma.Decimal(0)) };
  });
}
