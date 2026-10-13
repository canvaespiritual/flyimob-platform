import { documentationDate } from "@/lib/documentacoes/correspondent-presentation";
export type TrackingRound = { id: string; sequence: number; sentAt: Date | string; firstViewedAt: Date | string | null; closedAt: Date | string | null; events: { createdAt: Date | string }[] };
export default function DocumentationTracking({ round, compact = false }: { round?: TrackingRound | null; compact?: boolean }) {
  if (!round) return <p className="text-sm text-slate-500">Ainda não enviada</p>;
  const startedAt = round.events[0]?.createdAt;
  const title = round.closedAt ? "Rodada concluída" : startedAt ? "Análise iniciada" : round.firstViewedAt ? "Visualizada pelo correspondente" : "Aguardando visualização";
  const tone = round.closedAt ? "border-slate-200 bg-slate-50 text-slate-700" : startedAt ? "border-blue-200 bg-blue-50 text-blue-900" : round.firstViewedAt ? "border-teal-200 bg-teal-50 text-teal-900" : "border-amber-200 bg-amber-50 text-amber-900";
  const last = round.closedAt ?? startedAt ?? round.firstViewedAt ?? round.sentAt;
  if (compact) return <div className="space-y-1 text-xs"><span className={`inline-block rounded-lg border px-2 py-1 font-semibold ${tone}`}>{title}</span><p>Rodada {round.sequence} · {documentationDate(last)}</p></div>;
  return <section aria-label="Acompanhamento do correspondente" className={`space-y-3 rounded-xl border p-4 ${tone}`}><h3 className="font-semibold">Acompanhamento · rodada {round.sequence}</h3><p className="text-sm font-semibold">{title}</p><ol className="grid gap-3 text-sm sm:grid-cols-3"><li><strong>Enviada</strong><p>{documentationDate(round.sentAt)}</p></li><li><strong>Visualizada pelo correspondente</strong><p>{round.firstViewedAt ? documentationDate(round.firstViewedAt) : round.closedAt || startedAt ? "Visualização não registrada" : "Aguardando abertura da pasta"}</p></li><li><strong>Análise iniciada</strong><p>{startedAt ? documentationDate(startedAt) : "Início não registrado"}</p></li></ol><p className="text-xs">A visualização confirma a abertura da pasta. O início da análise é registrado separadamente.</p></section>;
}
