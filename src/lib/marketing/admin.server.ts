import { Prisma, MarketingPurpose, MarketingTrackingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize, bodyObject, day, MarketingError, text, type MarketingViewer } from "./policy";
import { personSelect } from "@/lib/team/select.server";
import { canActAsSalesResponsible } from "@/lib/team/policy";

type DB = Prisma.TransactionClient;
export async function marketingTransaction<T>(db: typeof prisma, run: (tx: DB) => Promise<T>) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await db.$transaction(run, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 }); }
    catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 2) throw error;
    }
  }
  throw new MarketingError(409, "Atualização concorrente. Tente novamente.");
}
export async function audit(tx: DB, viewer: MarketingViewer, eventType: string, entityId: string, metadata: Prisma.InputJsonObject) {
  // Callers pass explicit, bounded identifiers/classifications only; never accept arbitrary JSON.
  return tx.marketingAuditEvent.create({ data: { tenantId: viewer.tenant.id, actorId: viewer.user.id, eventType, entityId, metadata } });
}
export async function configureConnection(viewer: MarketingViewer, id: string | null, value: unknown, db = prisma) {
  authorize(viewer, true);
  const body = bodyObject(value, ["label"]); const label = text(body.label, "Nome da conexão");
  return marketingTransaction(db, async tx => {
    if (id && !await tx.metaConnection.findFirst({ where: { tenantId: viewer.tenant.id, id }, select: { id: true } })) throw new MarketingError(404, "Conexão não encontrada.");
    const connection = id ? await tx.metaConnection.update({ where: { tenantId_id: { tenantId: viewer.tenant.id, id } }, data: { label }, select: { id: true } })
      : await tx.metaConnection.create({ data: { tenantId: viewer.tenant.id, label }, select: { id: true } });
    await audit(tx, viewer, id ? "CONNECTION_RENAMED" : "CONNECTION_REGISTERED", connection.id, {});
    return connection;
  });
}
export async function selectAccount(viewer: MarketingViewer, connectionId: string, value: unknown, db = prisma) {
  authorize(viewer, true);
  const body = bodyObject(value, ["accountId", "selected"]);
  const accountId = text(body.accountId, "Conta");
  if (typeof body.selected !== "boolean") throw new MarketingError(400, "Seleção inválida.");
  const selected = body.selected;
  return marketingTransaction(db, async tx => {
    const link = await tx.metaConnectionAccount.findUnique({ where: { tenantId_connectionId_accountId: { tenantId: viewer.tenant.id, connectionId, accountId } } });
    if (!link || (selected && !link.accessible)) throw new MarketingError(404, "Conta não acessível por esta conexão.");
    await tx.metaConnectionAccount.update({ where: { id: link.id }, data: { selected } });
    await audit(tx, viewer, "ACCOUNT_SELECTION_CHANGED", accountId, { connectionId, selected });
    return { id: link.id };
  });
}
export async function updateCampaign(viewer: MarketingViewer, id: string, value: unknown, db = prisma) {
  authorize(viewer);
  const body = bodyObject(value, ["version", "purpose", "trackingStatus", "assignment"]);
  if (!Number.isSafeInteger(body.version) || Number(body.version) < 0) throw new MarketingError(400, "Versão inválida.");
  if (body.purpose !== undefined && !Object.values(MarketingPurpose).includes(body.purpose as MarketingPurpose)) throw new MarketingError(400, "Finalidade inválida.");
  if (body.trackingStatus !== undefined && !Object.values(MarketingTrackingStatus).includes(body.trackingStatus as MarketingTrackingStatus)) throw new MarketingError(400, "Status inválido.");
  if (body.purpose === undefined && body.trackingStatus === undefined && body.assignment === undefined) throw new MarketingError(400, "Nenhuma alteração informada.");
  return marketingTransaction(db, async tx => {
    const campaign = await tx.marketingCampaign.findFirst({ where: { tenantId: viewer.tenant.id, id } });
    if (!campaign) throw new MarketingError(404, "Campanha não encontrada.");
    const claimed = await tx.marketingCampaign.updateMany({ where: { id, tenantId: viewer.tenant.id, version: Number(body.version) }, data: {
      version: { increment: 1 }, purpose: body.purpose as MarketingPurpose | undefined, trackingStatus: body.trackingStatus as MarketingTrackingStatus | undefined,
    } });
    if (claimed.count !== 1) throw new MarketingError(409, "Campanha atualizada por outra pessoa. Recarregue antes de salvar.");
    if (body.purpose !== undefined && body.purpose !== campaign.purpose) await audit(tx, viewer, "CAMPAIGN_PURPOSE_CHANGED", id, { before: campaign.purpose, after: body.purpose as string });
    if (body.trackingStatus !== undefined && body.trackingStatus !== campaign.trackingStatus) await audit(tx, viewer, "CAMPAIGN_TRACKING_CHANGED", id, { before: campaign.trackingStatus, after: body.trackingStatus as string });
    if (body.assignment !== undefined) {
      const assignment = bodyObject(body.assignment, ["personId", "brokerId", "validFrom", "reason"]);
      const validFrom = day(assignment.validFrom);
      const requestedId = assignment.personId !== undefined ? assignment.personId : assignment.brokerId;
      let personId = requestedId === null ? null : text(requestedId, "Responsável");
      // Older clients may still submit a User ID. Resolve only by explicit FK.
      let person = personId ? await tx.operationPerson.findFirst({ where: { tenantId: viewer.tenant.id, id: personId, mergedIntoId: null }, select: personSelect }) : null;
      if (personId && !person && assignment.personId === undefined) {
        const user = await tx.user.findFirst({ where: { tenantId: viewer.tenant.id, id: personId }, select: { personId: true } });
        personId = user?.personId ?? personId;
        person = user?.personId ? await tx.operationPerson.findFirst({ where: { tenantId: viewer.tenant.id, id: user.personId, mergedIntoId: null }, select: personSelect }) : null;
      }
      const reason = assignment.reason ? text(assignment.reason, "Motivo", 500) : null;
      if (personId && (!person || !canActAsSalesResponsible(person))) throw new MarketingError(400, "Selecione um responsável ativo desta operação.");
      const where = { tenantId: viewer.tenant.id, campaignId: id, cancelledAt: null };
      const previous = await tx.campaignBrokerAssignment.findFirst({ where: { ...where, validFrom: { lte: validFrom }, OR: [{ validTo: null }, { validTo: { gt: validFrom } }] } });
      const next = await tx.campaignBrokerAssignment.findFirst({ where: { ...where, validFrom: { gt: validFrom } }, orderBy: { validFrom: "asc" } });
      if (previous) await tx.campaignBrokerAssignment.update({ where: { id: previous.id }, data: previous.validFrom.getTime() === validFrom.getTime() ? { cancelledAt: new Date() } : { validTo: validFrom } });
      if (personId) await tx.campaignBrokerAssignment.create({ data: { ...where, personId, brokerId: person?.user?.id ?? null, validFrom, validTo: previous?.validTo ?? next?.validFrom ?? null, createdById: viewer.user.id, reason } });
      await audit(tx, viewer, personId ? "CAMPAIGN_RESPONSIBLE_ASSIGNED" : "CAMPAIGN_RESPONSIBLE_REMOVED", id, { brokerId: personId, previousBrokerId: previous?.personId ?? previous?.brokerId ?? null, previousAssignmentId: previous?.id ?? null, validFrom: validFrom.toISOString().slice(0, 10) });
    }
    return { id, version: Number(body.version) + 1 };
  });
}
export async function createCostRule(viewer: MarketingViewer, value: unknown, db = prisma) {
  authorize(viewer, true);
  const body = bodyObject(value, ["percentage", "validFrom"]);
  if (typeof body.percentage !== "string" || !/^\d{1,4}([.,]\d{1,6})?$/.test(body.percentage)) throw new MarketingError(400, "Informe um percentual entre 0 e 1000 com até seis casas decimais.");
  const percentage = new Prisma.Decimal(body.percentage.replace(",", "."));
  if (percentage.gt(1000)) throw new MarketingError(400, "Percentual máximo: 1000%.");
  const validFrom = day(body.validFrom);
  return marketingTransaction(db, async tx => {
    const last = await tx.marketingCostRule.findFirst({ where: { tenantId: viewer.tenant.id }, orderBy: { validFrom: "desc" } });
    if (last && validFrom <= last.validFrom) throw new MarketingError(409, "A nova vigência deve começar depois da última regra cadastrada.");
    // Existing confirmed metrics have immutable cost snapshots; do not create retroactive ambiguity.
    if (await tx.marketingDailyMetric.count({ where: { tenantId: viewer.tenant.id, state: "CONFIRMED", date: { gte: validFrom } } })) throw new MarketingError(409, "Há métricas confirmadas a partir desta data. Escolha uma vigência posterior para preservar os custos históricos.");
    if (last) await tx.marketingCostRule.update({ where: { id: last.id }, data: { validTo: validFrom } });
    const rule = await tx.marketingCostRule.create({ data: { tenantId: viewer.tenant.id, percentage, validFrom, createdById: viewer.user.id } });
    await audit(tx, viewer, "COST_RULE_CREATED", rule.id, { percentage: percentage.toString(), validFrom: validFrom.toISOString().slice(0, 10), previousRuleId: last?.id ?? null });
    return { id: rule.id };
  });
}
