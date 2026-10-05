export const operationalRoles = {
  DIRECTION: "Direção", DIRECTOR: "Diretor", MANAGER: "Gerente", BROKER: "Corretor",
  ADMINISTRATIVE: "Administrativo", PARTNER: "Parceiro", OTHER: "Outro",
} as const;
export function eligiblePerson(person: { active: boolean; mergedIntoId: string | null; independent: boolean; user: { isActive: boolean } | null; financialParticipant: { active: boolean } | null }) {
  return person.active && !person.mergedIntoId && (person.independent || !!person.user?.isActive || !!person.financialParticipant?.active);
}
