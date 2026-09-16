export const CONFIRMED_SALE_STATUSES = ["APPROVED", "COMPLETED"] as const;

export function academyAdminIds(): string[] {
  return (process.env.ACADEMY_ADMIN_USER_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
}

export function isAcademyAdmin(userId: string): boolean {
  return academyAdminIds().includes(userId);
}

export function notificationKey(kind: "checkout" | "sale", id: string): string {
  return `${kind}:${id}`;
}

export function duration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function saoPauloDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = (key: string) => parts.find((part) => part.type === key)?.value;
  const day = `${value("year")}-${value("month")}-${value("day")}`;
  const from = new Date(`${day}T00:00:00-03:00`);
  return { day, from, to: new Date(from.getTime() + 86_400_000) };
}

// Restrict server-side outbound requests to known browser push providers (SSRF).
export function validPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    const hosts = ["fcm.googleapis.com", "push.services.mozilla.com", "web.push.apple.com", "wns.windows.com", "notify.windows.com"];
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.hash &&
      hosts.some((host) => url.hostname === host || ((host === "push.services.mozilla.com" || host === "wns.windows.com" || host === "notify.windows.com") && url.hostname.endsWith(`.${host}`)));
  } catch { return false; }
}

export function validPushKeys(keys: unknown): keys is { p256dh: string; auth: string } {
  if (!keys || typeof keys !== "object") return false;
  const { p256dh, auth } = keys as Record<string, unknown>;
  return typeof p256dh === "string" && /^[A-Za-z0-9_-]{87}=?$/.test(p256dh) &&
    typeof auth === "string" && /^[A-Za-z0-9_-]{22}(==)?$/.test(auth);
}
