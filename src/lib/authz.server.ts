// src/lib/authz.server.ts
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { getSessionUser } from "@/lib/session.server";
import { Permission, hasPermission, canInviteRole } from "@/lib/rbac";

export async function requireUser() {
  const s = await getSessionUser();
  if (!s) redirect("/login");
  return s;
}

export async function requirePermission(perm: Permission) {
  const s = await requireUser();
  if (!hasPermission(s.user.role as UserRole, perm)) {
    redirect("/admin/forbidden");
  }
  return s;
}

export function assertCanInvite(inviterRole: UserRole, targetRole: UserRole) {
  if (!canInviteRole(inviterRole, targetRole)) {
    const err = new Error("Sem permissão para convidar esse role.");
    // @ts-expect-error
    err.status = 403;
    throw err;
  }
}

export async function requirePlatformOwner() {
  const s = await requireUser();
  if (!s.tenant.isPlatform || s.user.role !== "OWNER") {
    redirect("/admin/forbidden");
  }
  return s;
}
