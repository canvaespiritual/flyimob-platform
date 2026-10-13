import { FolderDetailView } from "../../ui";
import { requireDocumentationAdmin } from "@/lib/documentacoes/access.server";
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) { const session = await requireDocumentationAdmin(); const { id } = await params; const query = await searchParams; return <FolderDetailView key={`${id}:${query.tab ?? ""}`} id={id} owner={session.user.role === "OWNER"} initialTab={query.tab === "analise" ? "Análise" : "Resumo"} />; }
