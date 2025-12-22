// src/lib/auth.ts
import crypto from "crypto";

const SESSION_COOKIE = "flyimob_session";

function b64url(input: Buffer | string) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function b64urlDecode(input: string) {
  const pad = 4 - (input.length % 4 || 4);
  const base64 = input.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat(pad);
  return Buffer.from(base64, "base64");
}

/** =========================
 *  PASSWORD (scrypt)
 *  format: scrypt$N$r$p$salt$hash
 *  ========================= */
export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const N = 16384; // custo razoável
  const r = 8;
  const p = 1;

  const key = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { N, r, p }, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(derivedKey as Buffer);
    });
  });

  return `scrypt$${N}$${r}$${p}$${b64url(salt)}$${b64url(key)}`;
}

export async function verifyPassword(password: string, stored: string) {
  try {
    const [algo, Ns, rs, ps, saltB64, hashB64] = stored.split("$");
    if (algo !== "scrypt") return false;

    const N = Number(Ns);
    const r = Number(rs);
    const p = Number(ps);

    const salt = b64urlDecode(saltB64);
    const expected = b64urlDecode(hashB64);

    const key = await new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(password, salt, expected.length, { N, r, p }, (err, derivedKey) => {
        if (err) return reject(err);
        resolve(derivedKey as Buffer);
      });
    });

    return crypto.timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

/** =========================
 *  SESSION TOKEN (HMAC)
 *  payload: { uid, tid, role, exp }
 *  token: base64url(payload).base64url(sig)
 *  ========================= */
type SessionPayload = {
  uid: string;
  tid: string;
  role: string;
  exp: number; // unix seconds
};

function getSecret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET não definido");
  return s;
}

export function createSessionToken(payload: Omit<SessionPayload, "exp">, days = 30) {
  const exp = Math.floor(Date.now() / 1000) + days * 24 * 60 * 60;
  const full: SessionPayload = { ...payload, exp };
  const body = b64url(JSON.stringify(full));

  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(body)
    .digest();

  return `${body}.${b64url(sig)}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const [body, sigB64] = token.split(".");
    if (!body || !sigB64) return null;

    const expectedSig = crypto
      .createHmac("sha256", getSecret())
      .update(body)
      .digest();

    const gotSig = b64urlDecode(sigB64);
    if (gotSig.length !== expectedSig.length) return null;
    if (!crypto.timingSafeEqual(gotSig, expectedSig)) return null;

    const payload = JSON.parse(Buffer.from(b64urlDecode(body)).toString("utf8")) as SessionPayload;
    if (!payload?.uid || !payload?.tid || !payload?.role || !payload?.exp) return null;

    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export const sessionCookieName = SESSION_COOKIE;
