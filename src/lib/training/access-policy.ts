export type BrokerLoginStatus = "eligible" | "no_login" | "inactive_login" | "wrong_role" | "password_pending" | "inactive_person";
export const brokerLoginLabels: Record<BrokerLoginStatus, string> = {
  eligible: "Login habilitado", no_login: "Sem login habilitado", inactive_login: "Login inativo",
  wrong_role: "Permissão de sistema incompatível", password_pending: "Definição de senha pendente", inactive_person: "Cadastro de pessoa inativo",
};
export function brokerLoginStatus(user: { role: string; isActive: boolean; passwordConfigured: boolean } | null, person?: { active: boolean; mergedIntoId: string | null } | null): BrokerLoginStatus {
  if (person && (!person.active || person.mergedIntoId)) return "inactive_person";
  if (!user) return "no_login";
  if (user.role !== "BROKER") return "wrong_role";
  if (!user.isActive) return "inactive_login";
  if (!user.passwordConfigured) return "password_pending";
  return "eligible";
}
export function trainingCourseTitle(id: string) {
  return id === "cmv2etzu60000s90wahxoe74k" ? "Curso Iniciação Flyimob" : "Treinamento";
}
