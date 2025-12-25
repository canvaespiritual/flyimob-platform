import { UserRole, TenantType } from "@prisma/client";

export function canInviteUser(inviterRole: UserRole, targetRole: UserRole) {
  if (inviterRole === "OWNER") return true;
  if (inviterRole === "DIRECTOR") {
    return ["MANAGER", "BROKER", "DATA_ENTRY"].includes(targetRole);
  }
  return false;
}

export function canInviteTenant(inviterRole: UserRole) {
  return inviterRole === "OWNER";
}
