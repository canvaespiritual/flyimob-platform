import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz.server";
import { prisma } from "@/lib/prisma";
import { pagination } from "@/lib/documentacoes/queries.server";
import type { DocumentationFolderStatus } from "@prisma/client";
const queues: { title: string; value: string; statuses: DocumentationFolderStatus[] }[] = [
  { title: "Primeira análise", value: "initial", statuses: ["AGUARDANDO_CORRESPONDENTE"] },
  { title: "Reanálise", value: "again", statuses: ["EM_REANALISE"] },
  { title: "Em análise", value: "active", statuses: ["EM_ANALISE"] },
  { title: "Correções", value: "issues", statuses: ["PENDENCIA_DOCUMENTAL"] },
  { title: "Concluídas", value: "closed", statuses: ["APROVADO", "CONDICIONADO", "REPROVADO"] },
];
export default async function CorrespondentePage({ searchParams = Promise.resolve({}) }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  const session = await requireUser();
  if (session.user.role !== "CORRESPONDENTE") redirect("/admin");
  if (session.tenant.isPlatform || session.user.tenantId !== session.tenant.id) redirect("/login");
  const params = await searchParams; const paging = pagination(new URLSearchParams({ page: typeof params.page === "string" ? params.page : "1" }));
  const selected = queues.find(queue => queue.value === params.queue);
  const base = { tenantId: session.tenant.id, correspondentId: session.user.id };
  const where = { ...base, ...(selected ? { status: { in: selected.statuses } } : {}) };
  const [folders, total, groups] = await Promise.all([
    prisma.documentationFolder.findMany({ where, select: { id: true, status: true, createdAt: true, broker: { select: { name: true } }, people: { where: { relationship: "TITULAR" }, select: { name: true }, take: 1 }, rounds: { orderBy: { sequence: "desc" }, take: 1, select: { sequence: true, sentAt: true } }, _count: { select: { documents: { where: { status: "ACTIVE" } }, pendingItems: { where: { status: "OPEN" } } } } }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: paging.skip, take: paging.take }),
    prisma.documentationFolder.count({ where }),
    prisma.documentationFolder.groupBy({ by: ["status"], orderBy: { status: "asc" }, where: base, _count: { _all: true } }),
  ]);
  const observedAt = new Date().getTime();
  return <main className="min-h-screen bg-gray-50 p-4 sm:p-6"><div className="mx-auto max-w-5xl space-y-5"><header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-semibold">Área do correspondente</h1><p className="text-sm text-gray-600">{session.user.name} · {session.tenant.name}</p></div><form action="/api/auth/logout" method="post"><button className="rounded border bg-white px-3 py-2 text-sm">Sair</button></form></header>
    <nav className="flex flex-wrap gap-3" aria-label="Filas de análise"><a href="/correspondente" className="rounded border bg-white p-3">Todas as atribuídas</a>{queues.map(queue => <a key={queue.value} href={`?queue=${queue.value}`} className={`rounded border p-3 ${selected?.value === queue.value ? "bg-gray-200" : "bg-white"}`}>{queue.title} · {groups.filter(group => queue.statuses.includes(group.status)).reduce((sum, group) => sum + group._count._all, 0)}</a>)}</nav>
    <div className="rounded-xl border bg-white p-4"><h2 className="font-semibold">{selected?.title ?? "Pastas atribuídas a você"} · {total}</h2>{folders.map(folder => { const round = folder.rounds?.[0]; return <div key={folder.id} className="flex flex-wrap justify-between gap-3 border-b py-4"><div><strong>{folder.people[0]?.name ?? "Pasta"}</strong><p className="text-sm capitalize">{folder.status.toLowerCase().replaceAll("_", " ")}</p><p className="text-sm">Responsável: {folder.broker?.name ?? "—"} · Rodada {round?.sequence ?? "—"} · {folder._count?.documents ?? 0} documentos · {folder._count?.pendingItems ?? 0} pendências abertas</p>{round && <p className="text-sm">Envio: {round.sentAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}{["AGUARDANDO_CORRESPONDENTE", "EM_REANALISE"].includes(folder.status) && ` · Aguardando há ${Math.max(0, Math.floor((observedAt - round.sentAt.getTime()) / 3600000))} h`}</p>}</div><a href={`/correspondente/pastas/${folder.id}`} className="rounded border px-3 py-2 text-sm">Abrir pasta</a></div>; })}{!folders.length && <p className="py-4 text-sm">Nenhuma pasta nesta fila.</p>}</div><nav className="flex gap-4 text-sm" aria-label="Paginação">{paging.page > 1 && <a className="underline" href={`?queue=${selected?.value ?? ""}&page=${paging.page - 1}`}>Anterior</a>}<span>Página {paging.page}</span>{paging.page * paging.take < total && <a className="underline" href={`?queue=${selected?.value ?? ""}&page=${paging.page + 1}`}>Próxima</a>}</nav></div></main>;
}
