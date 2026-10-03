import type { DocumentationFolderStatus } from "@prisma/client";

export const correspondentQueues: { value: string; title: string; statuses: DocumentationFolderStatus[]; empty: string }[] = [
  { value: "initial", title: "Para analisar", statuses: ["AGUARDANDO_CORRESPONDENTE"], empty: "Nenhuma documentação aguardando sua análise." },
  { value: "active", title: "Em análise", statuses: ["EM_ANALISE"], empty: "Nenhuma análise em andamento." },
  { value: "issues", title: "Correções", statuses: ["PENDENCIA_DOCUMENTAL", "EM_REANALISE"], empty: "Nenhuma documentação com correções pendentes ou aguardando reanálise." },
  { value: "closed", title: "Concluídas", statuses: ["APROVADO", "CONDICIONADO", "REPROVADO"], empty: "Suas análises concluídas aparecerão aqui." },
];
export function correspondentStatus(status: string) {
  const values: Record<string, { title: string; action: string; tone: string }> = {
    AGUARDANDO_CORRESPONDENTE: { title: "Nova análise", action: "Analisar", tone: "border-amber-200 bg-amber-50 text-amber-900" },
    EM_ANALISE: { title: "Em análise", action: "Continuar análise", tone: "border-blue-200 bg-blue-50 text-blue-900" },
    EM_REANALISE: { title: "Correção recebida", action: "Reanalisar", tone: "border-red-200 bg-red-50 text-red-900" },
    PENDENCIA_DOCUMENTAL: { title: "Aguardando correções", action: "Consultar pendências", tone: "border-orange-200 bg-orange-50 text-orange-900" },
    APROVADO: { title: "Documentação aprovada", action: "Consultar análise", tone: "border-emerald-200 bg-emerald-50 text-emerald-900" },
    CONDICIONADO: { title: "Aprovada com condições", action: "Consultar análise", tone: "border-emerald-200 bg-emerald-50 text-emerald-900" },
    REPROVADO: { title: "Documentação reprovada", action: "Consultar análise", tone: "border-red-200 bg-red-50 text-red-900" },
  };
  return values[status] ?? { title: "Em preparação", action: "Consultar documentos", tone: "border-slate-200 bg-slate-50 text-slate-700" };
}
export function maskDocumentationCpf(cpf?: string | null) {
  const digits = cpf?.replace(/\D/g, "");
  return digits?.length === 11 ? `***.***.${digits.slice(6, 9)}-**` : "Não informado";
}
export function documentationDate(value: Date | string) {
  return new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}
export const documentationEventLabels: Record<string, string> = {
  FOLDER_CREATED: "Cliente cadastrado para documentação", FOLDER_UPDATED: "Dados do cliente atualizados",
  BROKER_ASSIGNED: "Corretor responsável definido", CORRESPONDENT_ASSIGNED: "Correspondente responsável definido", CORRESPONDENT_CHANGED: "Correspondente responsável alterado",
  PERSON_ADDED: "Pessoa adicionada", PERSON_UPDATED: "Dados de uma pessoa atualizados", PERSON_REMOVED: "Pessoa removida",
  DOCUMENT_UPLOAD_STARTED: "Envio de documento iniciado", DOCUMENT_ADDED: "Documento anexado", DOCUMENT_INVALIDATED: "Documento retirado da análise", DOCUMENT_REPLACED: "Documento corrigido",
  DOCUMENT_REVIEW_SUBMITTED: "Documentação enviada para análise", DOCUMENT_REVIEW_RESUBMITTED: "Documentação corrigida reenviada",
  DOCUMENT_REVIEW_STARTED: "Análise iniciada", DOCUMENT_ISSUE_CREATED: "Correção solicitada", DOCUMENT_ISSUE_UPDATED: "Solicitação de correção atualizada",
  DOCUMENT_ISSUE_CANCELLED: "Solicitação de correção cancelada", DOCUMENT_ISSUE_RESOLVED: "Correção informada como resolvida",
  DOCUMENT_REVIEW_NOTE_SAVED: "Parecer da análise salvo", DOCUMENT_REVIEW_CHANGES_REQUESTED: "Documentação devolvida para correções",
  DOCUMENT_REVIEW_APPROVED: "Documentação aprovada", DOCUMENT_REVIEW_CONDITIONED: "Documentação aprovada com condições", DOCUMENT_REVIEW_REJECTED: "Documentação reprovada",
};
export function correspondentMessage(input: { clientName: string; documentCount: number; email: string; origin: string; password?: string; reanalysis?: boolean; inProgress?: boolean }) {
  const origin = new URL(input.origin).origin;
  return `📄 ${input.reanalysis ? "Documentação corrigida para reanálise" : input.inProgress ? "Documentação em análise" : "Nova pasta para análise"} — Flyimob\n\nCliente: ${input.clientName}\nDocumentos disponíveis: ${input.documentCount}\n\nAcesse sua área para visualizar, baixar e analisar os documentos:\n${origin}/correspondente\n\nLogin: ${input.email}${input.password ? `\nSenha inicial: ${input.password}` : "\nUse sua senha de acesso."}\n\nApós entrar, procure o cliente em “${input.reanalysis ? "Correções" : input.inProgress ? "Em análise" : "Para analisar"}”. A fila mostra as atualizações mais recentes primeiro.`;
}
