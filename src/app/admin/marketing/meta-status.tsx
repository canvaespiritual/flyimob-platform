export function MetaStatusBadge({ status }: { status: string | null | undefined }) {
  const label = status === "ACTIVE" ? "Ativa" : status === "PAUSED" ? "Pausada" : status === "ARCHIVED" ? "Arquivada" : status === "DELETED" ? "Excluída" : status || "Não informado";
  const color = status === "ACTIVE" ? "bg-green-600" : status === "PAUSED" ? "bg-amber-500" : "bg-slate-400";
  return <span className="inline-flex items-center gap-2 whitespace-nowrap" title={`Status Meta: ${status || "UNKNOWN"} · somente leitura`}><span aria-hidden="true" className={`h-2 w-2 rounded-full ${color}`} />{label}</span>;
}
