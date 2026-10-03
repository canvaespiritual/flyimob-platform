// src/lib/rbac.ts
import { UserRole } from "@prisma/client";

export type Permission =
  | "data:manage"
  | "comparativos:use"
  | "users:read"
  | "users:invite"
  | "dashboard:view"
  | "crm:use"
  | "documentacoes:manage";

const rolePerms: Record<UserRole, Permission[]> = {
  OWNER:      ["data:manage", "comparativos:use", "users:read", "users:invite", "dashboard:view", "crm:use", "documentacoes:manage"],
  DIRECTOR:   ["data:manage", "comparativos:use", "dashboard:view", "crm:use", "documentacoes:manage"],
  MANAGER:    ["comparativos:use", "dashboard:view", "crm:use"],
  BROKER:     ["comparativos:use", "dashboard:view", "crm:use"],
  DATA_ENTRY: ["data:manage"],
  CORRESPONDENTE: [],
};

export function hasPermission(role: UserRole, perm: Permission) {
  return rolePerms[role]?.includes(perm) ?? false;
}

// Como só OWNER convida, essa função pode ficar simples:
export function canInviteRole(inviter: UserRole, target: UserRole) {
  if (inviter !== "OWNER") return false;
  return target !== "OWNER";
}
