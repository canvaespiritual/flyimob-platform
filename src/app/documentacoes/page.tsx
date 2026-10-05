import { documentationFolderScope } from "@/lib/documentacoes/access-policy";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/authz.server";
import { prisma } from "@/lib/prisma";
import { pagination } from "@/lib/documentacoes/queries.server";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requireUser(); if (session.user.role !== "BROKER" || session.tenant.isPlatform) notFound();
  const params = await searchParams; const paging = pagination(new URLSearchParams({ page: params.page ?? "1" }));
  const where = documentationFolderScope(session);
  const [folders, total] = await Promise.all([prisma.documentationFolder.findMany({ where, orderBy: { updatedAt: "desc" }, skip: paging.skip, take: paging.take, select: { id: true, status: true, people: { where: { relationship: "TITULAR" }, select: { name: true }, take: 1 }, _count: { select: { rounds: true } } } }), prisma.documentationFolder.count({ where })]);
  return <main className="min-h-screen bg-gray-50 p-4"><div className="mx-auto max-w-5xl space-y-4"><Link href="/admin" className="underline">Voltar ao painel</Link><h1 className="text-xl font-semibold">Minhas pastas documentais</h1>{folders.map(folder => <Link key={folder.id} href={`/documentacoes/pastas/${folder.id}`} className="block rounded border bg-white p-4"><strong>{folder.people[0]?.name ?? "Pasta"}</strong><p>{folder.status.toLowerCase().replaceAll("_", " ")} · {folder._count.rounds} rodadas</p></Link>)}{!folders.length && <p>Nenhuma pasta atribuída.</p>}<nav className="flex gap-4">{paging.page > 1 && <Link href={`?page=${paging.page - 1}`}>Anterior</Link>}<span>Página {paging.page}</span>{paging.page * paging.take < total && <Link href={`?page=${paging.page + 1}`}>Próxima</Link>}</nav></div></main>;
}
