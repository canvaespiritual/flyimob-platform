import { getSessionUser } from "@/lib/session.server";
import { hasPermission, type Permission } from "@/lib/rbac";

/** Route handlers return HTTP errors; page guards remain redirect based. */
export async function getPermissionApiSession(permission: Permission) {
  const session = await getSessionUser();
  if (!session) return { ok: false as const, response: Response.json({ error: "unauthorized" }, { status: 401 }) };
  if (!hasPermission(session.user.role, permission)) {
    return { ok: false as const, response: Response.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { ok: true as const, session };
}
