export class TrainingClientError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); }
  get accessDenied() { return this.status === 401 || this.status === 403 || this.status === 404 || this.code === "upstream_authorization"; }
}
const messages: Record<string, string> = {
  login_required: "Sua sessão expirou. Entre novamente na Flyimob.",
  upstream_authorization: "A Horizonte recusou a autorização de reprodução. Tente reabrir o player.",
  session_limit: "Há cinco reproduções ativas. Feche uma das outras abas ou dispositivos e tente novamente; sessões abandonadas são liberadas automaticamente.",
  session_expired: "A sessão de reprodução expirou. Reabra o player para continuar; o progresso salvo foi preservado.",
  invalid_progress: "O progresso enviado foi recusado. O vídeo pode continuar; a posição deste envio não foi confirmada.",
  progress_rejected: "A Horizonte recusou este envio de progresso. O vídeo pode continuar; o último progresso confirmado foi preservado.",
  too_frequent: "O progresso foi enviado cedo demais. Uma nova tentativa será feita no próximo envio.",
  media_not_ready: "A mídia desta aula ainda não está pronta para reprodução.",
  upstream_error: "A Horizonte não conseguiu concluir a operação. Tente novamente.",
  invalid_response: "A Horizonte retornou uma resposta inválida. Tente novamente.",
  unavailable: "Não foi possível alcançar os treinamentos. Tente novamente quando a conexão estiver disponível.",
  broker_login_required: "O login deste corretor ainda não está pronto. Revise o acesso em Usuários / Equipe e atualize a lista antes de conceder o curso.",
};
export async function trainingFetch(path: string, method = "GET", body?: unknown, signal?: AbortSignal, keepalive = false) {
  let r: Response;
  try { r = await fetch(path, { method, signal: signal ?? AbortSignal.timeout(35000), keepalive, cache: "no-store", headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
  catch (e) { if (e instanceof Error && e.name === "AbortError") throw e; throw new TrainingClientError("unavailable", 503, messages.unavailable); }
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    const code = typeof data?.error === "string" ? data.error : "upstream_error";
    const message = messages[code] ?? (r.status === 401 ? messages.login_required : [403, 404].includes(r.status) ? "Acesso revogado ou aula indisponível. Consulte seu administrador." : messages.upstream_error);
    throw new TrainingClientError(code, r.status, message);
  }
  if (!data) throw new TrainingClientError("invalid_response", 502, messages.invalid_response);
  return data;
}
export function resumePosition(position: unknown, duration: number) {
  return typeof position === "number" && Number.isFinite(position) && position >= 0 && Number.isFinite(duration) && duration > 0 ? Math.min(position, duration) : 0;
}
