// src/lib/auth.server.ts
import crypto from "crypto";

export const sessionCookieName = "flyimob_session";

// =========================
// PASSWORD (scrypt)
// =========================
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(password, salt, KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });

  // IMPORTANTE: prefixo "scrypt:" (é isso que verifyPassword espera)
  return `scrypt:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt.toString(
    "hex"
  )}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algo, n, r, p, saltHex, hashHex] = stored.split(":");
  if (algo !== "scrypt") return false;

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");

  const derived = crypto.scryptSync(password, salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });

  return crypto.timingSafeEqual(derived, expected);
}

// =========================
// SESSION TOKEN (HMAC)
// =========================
type SessionPayload = {
  uid: string;
  tid: string;
  role: string;
  exp: number; // epoch seconds
};

function base64url(input: Buffer | string) {
  const b = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return b
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function sign(data: string, secret: string) {
  return base64url(crypto.createHmac("sha256", secret).update(data).digest());
}

/**
 * Cria token de sessão assinado.
 * @param payload uid/tid/role
 * @param days validade em dias (ex: 30)
 */
export function createSessionToken(
  payload: { uid: string; tid: string; role: string },
  days = 30
) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET não definido no .env");
  }

  const exp = Math.floor(Date.now() / 1000) + days * 24 * 60 * 60;
  const full: SessionPayload = { ...payload, exp };

  const body = base64url(JSON.stringify(full));
  const sig = sign(body, secret);

  return `${body}.${sig}`;
}

export function verifySessionToken(token: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return { ok: false as const, reason: "missing_secret" };

  const [body, sig] = token.split(".");
  if (!body || !sig) return { ok: false as const, reason: "bad_format" };

  const expected = sign(body, secret);
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return { ok: false as const, reason: "bad_sig" };
  }

  const payload = JSON.parse(Buffer.from(body, "base64").toString("utf8")) as SessionPayload;
  if (!payload?.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false as const, reason: "expired" };
  }

  return { ok: true as const, payload };
}
