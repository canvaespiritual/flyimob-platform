import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz.server";
import { correspondentFolders } from "@/lib/documentacoes/correspondent-queries.server";
import { correspondentQueues, correspondentStatus, documentationDate } from "@/lib/documentacoes/correspondent-presentation";
import { DocumentationError } from "@/lib/documentacoes/validation";

export default async function CorrespondentePage({ searchParams = Promise.resolve({}) }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  const session = await requireUser();
  if (session.user.role !== "CORRESPONDENTE") redirect("/admin");
  if (session.tenant.isPlatform || session.user.tenantId !== session.tenant.id) redirect("/login");
  const values = await searchParams;
  const params = new URLSearchParams();
  for (const key of ["q", "queue", "from", "to", "page"]) if (typeof values[key] === "string") params.set(key, values[key]);
  const selected = correspondentQueues.find(queue => queue.value === params.get("queue"));
  let data: Awaited<ReturnType<typeof correspondentFolders>> | undefined; let error = "";
  try { data = await correspondentFolders(session, params); } catch (cause) { if (!(cause instanceof DocumentationError)) throw cause; error = cause.message; }
  function href(changes: Record<string, string>) { const query = new URLSearchParams(params); for (const [key, value] of Object.entries(changes)) { if (value) query.set(key, value); else query.delete(key); } return "/correspondente?" + query; }
  const control = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm";
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
    <div><h1 className="text-2xl font-bold tracking-tight">Seus clientes</h1><p className="mt-1 text-sm text-slate-600">Documentos, correções e análises em um só lugar. As atualizações mais recentes aparecem primeiro.</p></div>
    <form className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]" action="/correspondente">
      <input type="hidden" name="queue" value={selected?.value ?? ""} />
      <label className="space-y-1 text-sm font-medium">Buscar cliente<input name="q" placeholder="Nome ou CPF" maxLength={160} defaultValue={params.get("q") ?? ""} className={control} /></label>
      <label className="space-y-1 text-sm font-medium">Cadastrado de<input name="from" type="date" defaultValue={params.get("from") ?? ""} className={control} /></label>
      <label className="space-y-1 text-sm font-medium">Até<input name="to" type="date" defaultValue={params.get("to") ?? ""} className={control} /></label>
      <div className="flex items-end gap-2"><button className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Buscar</button><Link className="rounded-lg border px-3 py-2.5 text-sm" href="/correspondente">Limpar</Link></div>
    </form>
    <nav className="flex flex-wrap gap-2" aria-label="Filas de análise">{[{ value: "", title: "Todas", statuses: [] as typeof correspondentQueues[number]["statuses"] }, ...correspondentQueues].map(queue => <Link key={queue.value} href={href({ queue: queue.value, page: "" })} aria-current={(selected?.value ?? "") === queue.value ? "page" : undefined} className={`rounded-full border px-4 py-2 text-sm font-semibold ${(selected?.value ?? "") === queue.value ? "border-blue-700 bg-blue-700 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-blue-300"}`}><span aria-hidden="true" className={"mr-2 inline-block h-2 w-2 rounded-full " + (({ initial: "bg-amber-400", active: "bg-blue-400", issues: "bg-red-400", closed: "bg-emerald-400" } as Record<string, string>)[queue.value] ?? "bg-slate-400")} />{queue.title} <span className="ml-1 opacity-75">{data ? data.groups.filter(group => !queue.value || queue.statuses.includes(group.status)).reduce((sum, group) => sum + group._count._all, 0) : "—"}</span></Link>)}</nav>
    {error && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-900">{error}</p>}
    {data && <><p className="text-sm text-slate-600">{data.total} {data.total === 1 ? "cliente encontrado" : "clientes encontrados"}</p><div className="grid gap-4 md:grid-cols-2">{data.items.map(folder => { const status = correspondentStatus(folder.status); const base = "/correspondente/pastas/" + folder.id; return <article key={folder.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className={`rounded-full border px-3 py-1 text-xs font-bold ${status.tone}`}>{status.title}</span><span className="text-xs text-slate-500">Atualizado {documentationDate(folder.updatedAt)}</span></div>
      <h2 className="mt-4 break-words text-lg font-bold">{folder.people[0]?.name ?? "Cliente"}</h2><p className="mt-1 text-sm text-slate-600">CPF: {folder.people[0]?.cpfDisplay ?? "Não informado"}</p><p className="mt-1 break-words text-sm text-slate-600">E-mail: {folder.people[0]?.email ?? "Não informado"}</p><p className="mt-1 text-sm text-slate-600">Telefone: {folder.people[0]?.phone ?? "Não informado"}</p><p className="mt-1 text-sm text-slate-600">Responsável comercial: {folder.broker?.name ?? "Não informado"}</p>
      {folder.correspondentMessage && <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm"><h3 className="font-semibold">Mensagem da operação</h3><p className="mt-1 whitespace-pre-wrap break-words">{folder.correspondentMessage}</p></div>}
      <p className="mt-4 text-sm font-medium">{folder._count.documents} documentos · {folder._count.pendingItems} correções em aberto</p>
      <div className="mt-5 flex flex-wrap gap-2"><Link href={base + "?tab=documentos"} className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium">Ver e baixar documentos</Link><Link href={base + "?tab=" + (["APROVADO", "CONDICIONADO", "REPROVADO"].includes(folder.status) ? "historico" : "pendencias")} className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">{status.action} →</Link></div>
      {["APROVADO", "CONDICIONADO", "REPROVADO"].includes(folder.status) && <Link href={base + "?tab=historico"} className="mt-3 text-sm font-medium text-blue-700 underline">Ver histórico</Link>}
    </article>; })}</div>
    {!data.items.length && <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center"><h2 className="font-semibold">{params.get("q") ? "Nenhum cliente encontrado para esta busca." : selected?.empty ?? "Nenhum cliente atribuído a você neste período."}</h2><p className="mt-2 text-sm text-slate-500">Os clientes aparecem aqui quando a operação atribui a documentação a você.</p></div>}
    <nav className="flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Paginação de clientes"><span>Página {data.page} de {Math.max(1, Math.ceil(data.total / data.pageSize))}</span><div className="flex gap-3">{data.page > 1 && <Link className="rounded-lg border bg-white px-4 py-2" href={href({ page: String(data.page - 1) })}>Anterior</Link>}{data.page * data.pageSize < data.total && <Link className="rounded-lg border bg-white px-4 py-2" href={href({ page: String(data.page + 1) })}>Próxima</Link>}</div></nav></>}
  </main>;
}
