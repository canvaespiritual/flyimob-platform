import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { MarketingError, day } from "./policy";

export const GRAPH_VERSION = "v26.0";
export const CONVERSATION_ACTION = "onsite_conversion.messaging_conversation_started_7d";
export type MetaErrorCode = "AUTHORIZATION_REQUIRED" | "PROVIDER_UNAVAILABLE" | "RATE_LIMITED" | "INVALID_RESPONSE";
export class MetaError extends Error {
  constructor(public readonly safeCode: MetaErrorCode, public readonly connectionInvalid = safeCode === "AUTHORIZATION_REQUIRED") { super(safeCode); }
}
export function metaConfig() {
  const appId = process.env.META_APP_ID, appSecret = process.env.META_APP_SECRET;
  const redirectUri = process.env.META_OAUTH_REDIRECT_URI, configId = process.env.META_LOGIN_CONFIG_ID;
  if (!appId || !appSecret || !redirectUri || !configId || !/^\d+$/.test(appId) || !/^\d+$/.test(configId))
    throw new MarketingError(503, "Configure META_APP_ID, META_APP_SECRET, META_LOGIN_CONFIG_ID e META_OAUTH_REDIRECT_URI no servidor.");
  const url = new URL(redirectUri);
  if (url.protocol !== "https:" || url.pathname !== "/api/integrations/meta/callback" || url.search || url.hash)
    throw new MarketingError(503, "Callback Meta precisa ser HTTPS e terminar em /api/integrations/meta/callback.");
  encryptionKey("v1");
  return { appId, appSecret, redirectUri, configId };
}
function encryptionKey(version: string) {
  const value = version === "v1" ? process.env.META_CREDENTIAL_KEY_V1 : undefined;
  const key = value ? Buffer.from(value, "base64") : Buffer.alloc(0);
  if (key.length !== 32 || key.toString("base64") !== value) throw new MarketingError(503, "Configure META_CREDENTIAL_KEY_V1 com uma chave aleatória de 32 bytes em base64.");
  return key;
}
function aad(tenantId: string, connectionId: string) { return Buffer.from(JSON.stringify([tenantId, connectionId, "v1"])); }
export function encryptCredential(token: string, tenantId: string, connectionId: string) {
  if (!token || token.length > 16384) throw new MetaError("INVALID_RESPONSE");
  const credentialNonce = randomBytes(12), cipher = createCipheriv("aes-256-gcm", encryptionKey("v1"), credentialNonce);
  cipher.setAAD(aad(tenantId, connectionId));
  return { credentialCiphertext: Buffer.concat([cipher.update(token, "utf8"), cipher.final()]), credentialNonce,
    credentialAuthTag: cipher.getAuthTag(), credentialKeyVersion: "v1" };
}
export function decryptCredential(connection: { tenantId: string; id: string; credentialCiphertext: Uint8Array | null; credentialNonce: Uint8Array | null; credentialAuthTag: Uint8Array | null; credentialKeyVersion: string | null }) {
  try {
    if (!connection.credentialCiphertext || !connection.credentialNonce || !connection.credentialAuthTag || !connection.credentialKeyVersion) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(connection.credentialKeyVersion), connection.credentialNonce);
    decipher.setAAD(aad(connection.tenantId, connection.id)); decipher.setAuthTag(Buffer.from(connection.credentialAuthTag));
    return Buffer.concat([decipher.update(connection.credentialCiphertext), decipher.final()]).toString("utf8");
  } catch { throw new MarketingError(503, "Não foi possível abrir a credencial protegida. Confira a chave do servidor ou reconecte a Meta."); }
}
type Obj = Record<string, unknown>;
export function object(value: unknown): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MetaError("INVALID_RESPONSE");
  return value as Obj;
}
export function identifier(value: unknown) {
  if (typeof value !== "string" || !/^\d{1,120}$/.test(value)) throw new MetaError("INVALID_RESPONSE"); return value;
}
export function providerText(value: unknown, max = 500) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new MetaError("INVALID_RESPONSE"); return value;
}
export function count(value: unknown): bigint {
  if (typeof value !== "string" || !/^\d{1,18}$/.test(value)) throw new MetaError("INVALID_RESPONSE");
  const result = BigInt(value); if (result > 9223372036854775807n) throw new MetaError("INVALID_RESPONSE"); return result;
}
export function insight(value: unknown) {
  const row = object(value);
  const date = providerText(row.date_start, 10); day(date);
  if (row.date_stop !== date || typeof row.spend !== "string" || !/^\d{1,16}(\.\d{1,2})?$/.test(row.spend)) throw new MetaError("INVALID_RESPONSE");
  let conversations = 0; let linkClicks: bigint | null = null;
  if (row.actions !== undefined) {
    if (!Array.isArray(row.actions)) throw new MetaError("INVALID_RESPONSE");
    const seen = new Set<string>();
    for (const item of row.actions) {
      const action = object(item), type = providerText(action.action_type, 160);
      if (seen.has(type)) throw new MetaError("INVALID_RESPONSE"); seen.add(type);
      if (type === CONVERSATION_ACTION) { const n = count(action.value); if (n > 2147483647n) throw new MetaError("INVALID_RESPONSE"); conversations = Number(n); }
      if (type === "link_click") linkClicks = count(action.value);
    }
  }
  return { date, metaSpend: row.spend, leads: conversations, impressions: count(row.impressions), clicks: count(row.clicks), linkClicks };
}

/** GET-only client. Never follows provider URLs (which can embed tokens); reuse validated after cursors. */
export class MetaClient {
  constructor(private token: string, private secret: string, private transport: typeof fetch = fetch) {}
  async get(path: string, params: Record<string, string> = {}): Promise<Obj> {
    if (!/^(me(?:\/adaccounts|\/permissions)?|act_\d+(?:\/(campaigns|ads|insights))?|\d+\/insights)$/.test(path)) throw new MetaError("INVALID_RESPONSE");
    const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set("appsecret_proof", createHmac("sha256", this.secret).update(this.token).digest("hex"));
    let response: Response;
    try { response = await this.transport(url, { method: "GET", headers: { Authorization: `Bearer ${this.token}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30000) }); }
    catch { throw new MetaError("PROVIDER_UNAVAILABLE"); }
    let payload: Obj;
    try { payload = object(await response.json()); } catch { throw new MetaError("INVALID_RESPONSE"); }
    if (!response.ok || payload.error) {
      const code = payload.error && typeof payload.error === "object" ? (payload.error as Obj).code : undefined;
      throw new MetaError(code === 190 || code === 10 || code === 200 ? "AUTHORIZATION_REQUIRED" : response.status === 429 || [4, 17, 32, 613, 80000].includes(Number(code)) ? "RATE_LIMITED" : response.status >= 500 || object(payload.error ?? {}).is_transient === true ? "PROVIDER_UNAVAILABLE" : "INVALID_RESPONSE", code === 190);
    }
    return payload;
  }
  async pages(path: string, params: Record<string, string> = {}): Promise<Obj[]> {
    const rows: Obj[] = [], cursors = new Set<string>(); let after: string | undefined;
    for (let page = 0; page < 1000; page++) {
      const payload = await this.get(path, { ...params, limit: "100", ...(after ? { after } : {}) });
      if (!Array.isArray(payload.data)) throw new MetaError("INVALID_RESPONSE");
      rows.push(...payload.data.map(object));
      if (rows.length > 100000) throw new MetaError("INVALID_RESPONSE");
      const paging = payload.paging === undefined ? {} : object(payload.paging);
      if (!paging.next) return rows;
      const cursor = object(paging.cursors).after;
      if (typeof cursor !== "string" || !cursor || cursor.length > 4096 || cursors.has(cursor)) throw new MetaError("INVALID_RESPONSE");
      cursors.add(cursor); after = cursor;
    }
    throw new MetaError("INVALID_RESPONSE");
  }
}

/** OAuth credential exchange is the sole POST to Meta; it never mutates advertising objects. */
export async function exchangeAuthorization(code: string, transport: typeof fetch = fetch) {
  const cfg = metaConfig();
  async function exchange(params: Record<string, string>) {
    let res: Response;
    try { res = await transport(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`, { method: "POST", body: new URLSearchParams({ client_id: cfg.appId, client_secret: cfg.appSecret, ...params }), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30000) }); }
    catch { throw new MetaError("PROVIDER_UNAVAILABLE"); }
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload || payload.error) throw new MetaError("AUTHORIZATION_REQUIRED");
    const result = object(payload);
    if (typeof result.access_token !== "string" || !result.access_token) throw new MetaError("INVALID_RESPONSE");
    return { token: result.access_token, seconds: result.expires_in };
  }
  const short = await exchange({ redirect_uri: cfg.redirectUri, code });
  const long = await exchange({ grant_type: "fb_exchange_token", fb_exchange_token: short.token });
  if (!Number.isSafeInteger(long.seconds) || Number(long.seconds) <= 0) throw new MetaError("INVALID_RESPONSE");
  return { token: long.token, expiresAt: new Date(Date.now() + Number(long.seconds) * 1000) };
}
