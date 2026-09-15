import { createHash, randomBytes } from "node:crypto";
import { AcademyError, LIMITS } from "./limits";

export function newOpaqueToken(): string { return randomBytes(32).toString("base64url"); }
export function isOpaqueToken(value: string | undefined): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}
export function tokenHash(value: string): string { return createHash("sha256").update(value).digest("hex"); }

export function bearerToken(request: Request, required: boolean): string | null {
  const header = request.headers.get("authorization");
  if (!header && !required) return null;
  const match = header?.match(/^Bearer ([A-Za-z0-9_-]{43})$/);
  if (!match) throw new AcademyError(401, "invalid_collector_credentials");
  return match[1];
}

export const visitorCookieName = process.env.NODE_ENV === "production"
  ? "__Host-flyimob_academy_visitor" : "flyimob_academy_visitor";
export const visitorCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: LIMITS.visitorCookieSeconds,
};

export function isSessionExpired(session: { lastActivityAt: Date; expiresAt: Date }, now: Date): boolean {
  return session.expiresAt <= now || now.getTime() - session.lastActivityAt.getTime() >= LIMITS.idleMs;
}
