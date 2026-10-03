import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/authz.server";
import { documentScope } from "@/lib/documentacoes/document-access.server";
import { prisma } from "@/lib/prisma";
import FolderWorkflow from "./FolderWorkflow";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser(); const { id } = await params;
  if (session.user.role !== "BROKER" || session.tenant.isPlatform) notFound();
  const folder = await prisma.documentationFolder.findFirst({ where: { id, ...documentScope(session) }, select: { people: { where: { relationship: "TITULAR" }, select: { name: true }, take: 1 } } });
  if (!folder) notFound();
  return <main className="min-h-screen bg-gray-50 p-4"><div className="mx-auto max-w-6xl space-y-4"><Link href="/documentacoes" className="underline">Minhas pastas</Link><h1 className="text-xl font-semibold">{folder.people[0]?.name ?? "Pasta documental"}</h1><FolderWorkflow id={id} /></div></main>;
}
