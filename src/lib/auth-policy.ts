// Shared pure policies: no secrets, database access or browser dependencies.
export function sessionAuthorizesUser(
  payload: { uid: string; tid: string; sv?: number },
  user: { id: string; tenantId: string; isActive: boolean; sessionVersion: number },
) {
  return user.isActive && payload.uid === user.id && payload.tid === user.tenantId &&
    (payload.sv ?? 0) === user.sessionVersion;
}

export function safeReturnTo(value: unknown, fallback = "/admin") {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") ||
      /[\\\u0000-\u0020\u007f]/.test(value)) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(decoded)) return fallback;
    const url = new URL(value, "https://flyimob.invalid");
    if (url.origin !== "https://flyimob.invalid") return fallback;
    // Login/logout destinations can otherwise create loops or submit side effects.
    if (url.pathname.startsWith("/api/") || url.pathname === "/login" ||
        url.pathname.startsWith("/invite/") || url.pathname.startsWith("/reset-password/")) return fallback;
    return url.pathname + url.search + url.hash;
  } catch { return fallback; }
}

export function postAuthDestination(role: string, returnTo?: unknown, fallback = "/admin") {
  if (role === "CORRESPONDENTE") return "/correspondente";
  return safeReturnTo(returnTo, fallback);
}
