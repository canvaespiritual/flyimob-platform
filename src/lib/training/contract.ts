import { createHash, randomBytes, sign, createPrivateKey } from "node:crypto";

export class TrainingError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
export function signatureMessage(body: string, timestamp: string, nonce: string) {
  return ["POST", "/api/integrations/v1/exchange", timestamp, nonce, createHash("sha256").update(body).digest("hex")].join("\n");
}
export function assertionHeaders(body: string, clientId: string, pem: string, now = Date.now()) {
  const key = createPrivateKey(pem.replace(/\\n/g, "\n"));
  if (key.asymmetricKeyType !== "ed25519") throw new TrainingError(503, "configuration");
  const timestamp = String(now), nonce = randomBytes(24).toString("base64url");
  return { "Content-Type": "application/json", "x-horizonte-client": clientId,
    "x-horizonte-timestamp": timestamp, "x-horizonte-nonce": nonce,
    "x-horizonte-signature": sign(null, Buffer.from(signatureMessage(body, timestamp, nonce)), key).toString("base64url") };
}
export function validateCourseIds(raw: unknown, allowed: string[]) {
  if (!Array.isArray(raw) || raw.length > 100 || raw.some(id => typeof id !== "string" || !id.length || id.length > 100 || !allowed.includes(id)) || new Set(raw).size !== raw.length)
    throw new TrainingError(400, "invalid_courses");
  return raw as string[];
}
export type Lesson = { id: string; title: string; videoSource: string; progress: { completedAt: string | null }[] };
export type Course = { id: string; title: string; description: string | null; modules: { id: string; title: string; lessons: Lesson[] }[] };
export type Playback = { source: "PRIVATE" | "YOUTUBE"; youtubeId?: string; url?: string; revision?: string; sessionId?: string; position?: number; percent?: number; completed?: boolean; metadata?: { duration: number } };
