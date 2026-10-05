export const operationalRoles = {
  DIRECTION: "Direção", DIRECTOR: "Diretor", MANAGER: "Gerente", BROKER: "Corretor",
  ADMINISTRATIVE: "Administrativo", PARTNER: "Parceiro", OTHER: "Outro",
} as const;
/** Operational capability, never authentication or authorization. DIRECTION is OWNER. */
export const salesResponsibleRoles = ["BROKER", "MANAGER", "DIRECTOR", "DIRECTION"] as const;
export function canActAsSalesResponsible(person: { active: boolean; mergedIntoId: string | null; operationalRole: string }) {
  return person.active && !person.mergedIntoId && salesResponsibleRoles.some(role => role === person.operationalRole);
}
export function eligiblePerson(person: { active: boolean; mergedIntoId: string | null; independent: boolean; user: { isActive: boolean } | null; financialParticipant: { active: boolean } | null }) {
  return person.active && !person.mergedIntoId && (person.independent || !!person.user?.isActive || !!person.financialParticipant?.active);
}
