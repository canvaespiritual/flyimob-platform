import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { authorize, MarketingError, type MarketingViewer } from "./policy";
import { audit, marketingTransaction } from "./admin.server";
import { decryptCredential, encryptCredential, exchangeAuthorization, GRAPH_VERSION, identifier, metaConfig, MetaClient, MetaError, object, providerText } from "./meta.server";

export function configurationStatus() {
  try { metaConfig(); return { configured: true }; } catch { return { configured: false }; }
}
export async function beginAuthorization(viewer: MarketingViewer, connectionId: string, db = prisma) {
  authorize(viewer, true); const cfg = metaConfig();
  const connection = await db.metaConnection.findFirst({ where: { id: connectionId, tenantId: viewer.tenant.id }, select: { id: true, credentialVersion: true } });
  if (!connection) throw new MarketingError(404, "Conexão não encontrada.");
  const state = randomBytes(32).toString("base64url");
  await db.marketingOAuthState.create({ data: { id: createHash("sha256").update(state).digest("hex"), tenantId: viewer.tenant.id, actorId: viewer.user.id,
    connectionId, credentialVersion: connection.credentialVersion, expiresAt: new Date(Date.now() + 10 * 60000) } });
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  url.search = new URLSearchParams({ client_id: cfg.appId, redirect_uri: cfg.redirectUri, state, response_type: "code", config_id: cfg.configId, override_default_response_type: "true" }).toString();
  return { state, url: url.toString() };
}
export async function completeAuthorization(viewer: MarketingViewer, state: string, code: string | null, db = prisma) {
  authorize(viewer, true);
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) throw new MarketingError(400, "Autorização inválida ou expirada.");
  const id = createHash("sha256").update(state).digest("hex");
  const pending = await marketingTransaction(db, async tx => {
    const row = await tx.marketingOAuthState.findFirst({ where: { id, actorId: viewer.user.id, tenantId: viewer.tenant.id, consumedAt: null, expiresAt: { gt: new Date() } } });
    if (!row) throw new MarketingError(400, "Autorização inválida ou expirada.");
    const claim = await tx.marketingOAuthState.updateMany({ where: { id, consumedAt: null }, data: { consumedAt: new Date() } });
    if (!claim.count) throw new MarketingError(409, "Autorização já utilizada."); return row;
  });
  if (!code || code.length > 4096) throw new MarketingError(400, "Autorização não concluída. Reconecte a Meta.");
  const cfg = metaConfig(), credential = await exchangeAuthorization(code), client = new MetaClient(credential.token, cfg.appSecret);
  const permissions = await client.pages("me/permissions");
  if (!permissions.some(item => item.permission === "ads_read" && item.status === "granted")) throw new MetaError("AUTHORIZATION_REQUIRED");
  const externalAuthorizationId = identifier((await client.get("me", { fields: "id" })).id);
  const envelope = encryptCredential(credential.token, viewer.tenant.id, pending.connectionId);
  await marketingTransaction(db, async tx => {
    const changed = await tx.metaConnection.updateMany({ where: { tenantId: viewer.tenant.id, id: pending.connectionId, credentialVersion: pending.credentialVersion }, data: {
      ...envelope, credentialVersion: { increment: 1 }, externalAuthorizationId, status: "AUTHORIZED", authorizedAt: new Date(), expiresAt: credential.expiresAt, revokedAt: null, safeErrorCode: null,
    } });
    if (!changed.count) throw new MarketingError(409, "Outra reconexão foi concluída. Inicie novamente.");
    await audit(tx, viewer, "META_AUTHORIZED", pending.connectionId, {});
  });
  return { connectionId: pending.connectionId };
}

export async function connectionClient(tenantId: string, id: string, db = prisma) {
  const connection = await db.metaConnection.findFirst({ where: { tenantId, id } });
  if (!connection || connection.status !== "AUTHORIZED") throw new MetaError("AUTHORIZATION_REQUIRED");
  if (connection.expiresAt && connection.expiresAt <= new Date()) {
    await db.metaConnection.updateMany({ where: { tenantId, id, credentialVersion: connection.credentialVersion }, data: { status: "EXPIRED", safeErrorCode: "AUTHORIZATION_REQUIRED" } });
    throw new MetaError("AUTHORIZATION_REQUIRED");
  }
  return { client: new MetaClient(decryptCredential(connection), metaConfig().appSecret), credentialVersion: connection.credentialVersion };
}
export function parseAccount(row: Record<string, unknown>) {
  const externalId = identifier(row.account_id), name = providerText(row.name);
  if (row.id !== `act_${externalId}` || typeof row.currency !== "string" || !/^[A-Z]{3}$/.test(row.currency) || !Number.isInteger(row.account_status)) throw new MetaError("INVALID_RESPONSE");
  const timezone = providerText(row.timezone_name, 80);
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }); } catch { throw new MetaError("INVALID_RESPONSE"); }
  const business = row.business === undefined || row.business === null ? null : object(row.business);
  return { externalId, name, currency: row.currency, timezone, sourceAccountStatus: Number(row.account_status),
    businessExternalId: business ? identifier(business.id) : null, businessName: business?.name ? providerText(business.name) : null };
}
export async function discoverAccounts(viewer: MarketingViewer, connectionId: string, db = prisma) {
  authorize(viewer, true); const tenantId = viewer.tenant.id;
  const { client, credentialVersion } = await connectionClient(tenantId, connectionId, db);
  try {
    // Complete every page and validate every object BEFORE marking vanished links inaccessible.
    const rows = (await client.pages("me/adaccounts", { fields: "id,account_id,name,account_status,currency,timezone_name,business{id,name}" })).map(parseAccount);
    const accounts = new Map(rows.map(row => [row.externalId, row]));
    await marketingTransaction(db, async tx => {
      const current = await tx.metaConnection.findFirst({ where: { tenantId, id: connectionId, status: "AUTHORIZED", credentialVersion } });
      if (!current) throw new MarketingError(409, "Autorização alterada durante a descoberta.");
      await tx.metaConnectionAccount.updateMany({ where: { tenantId, connectionId }, data: { accessible: false } });
      for (const account of accounts.values()) {
        // Currency is an identity of monetary history: never relabel existing values as another currency.
        const existing = await tx.metaAdAccount.findUnique({ where: { tenantId_externalId: { tenantId, externalId: account.externalId } } });
        if (existing && existing.currency !== account.currency) throw new MetaError("INVALID_RESPONSE");
        const saved = await tx.metaAdAccount.upsert({ where: { tenantId_externalId: { tenantId, externalId: account.externalId } }, create: { tenantId, ...account }, update: account });
        await tx.metaConnectionAccount.upsert({ where: { tenantId_connectionId_accountId: { tenantId, connectionId, accountId: saved.id } },
          create: { tenantId, connectionId, accountId: saved.id, accessible: true }, update: { accessible: true, discoveredAt: new Date() } });
      }
      await tx.metaConnection.update({ where: { tenantId_id: { tenantId, id: connectionId } }, data: { safeErrorCode: null } });
      await audit(tx, viewer, "META_ACCOUNTS_DISCOVERED", connectionId, {});
    });
    return { discovered: accounts.size };
  } catch (error) {
    if (error instanceof MetaError) await db.metaConnection.updateMany({ where: { tenantId, id: connectionId, credentialVersion }, data: {
      safeErrorCode: error.safeCode, ...(error.safeCode === "AUTHORIZATION_REQUIRED" ? { status: "REVOKED" as const, revokedAt: new Date() } : {}),
    } });
    throw error;
  }
}
