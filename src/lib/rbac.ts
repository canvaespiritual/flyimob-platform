// src/lib/rbac.ts
import { UserRole } from "@prisma/client";

export type Permission =
  | "data:manage"        // CRUD empreendimentos/construtoras
  | "comparativos:use"   // comparativos livres
  | "users:read"
  | "users:invite"
  | "dashboard:view"
  | "crm:use";           // futuro

const rolePerms: Record<UserRole, Permission[]> = {
  OWNER:     ["data:manage", "comparativos:use", "users:read", "users:invite", "dashboard:view", "crm:use"],
  DIRECTOR:  ["data:manage", "comparativos:use", "users:read", "users:invite", "dashboard:view", "crm:use"],
  MANAGER:   ["comparativos:use", "users:read", "users:invite", "dashboard:view", "crm:use"],
  BROKER:    ["comparativos:use", "dashboard:view", "crm:use"],
  DATA_ENTRY:["data:manage"],
};

export function hasPermission(role: UserRole, perm: Permission) {
  return rolePerms[role]?.includes(perm) ?? false;
}

export function canInviteRole(inviter: UserRole, target: UserRole) {
  if (inviter === "OWNER") {
    return target !== "OWNER"; // não faz sentido convidar OWNER
  }
  if (inviter === "DIRECTOR") {
    return target === "MANAGER" || target === "BROKER" || target === "DATA_ENTRY";
  }
  if (inviter === "MANAGER") {
    return target === "BROKER";
  }
  return false;
}
