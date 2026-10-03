import { FolderDetailView } from "../../ui";
import { requireDocumentationAdmin } from "@/lib/documentacoes/access.server";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const session = await requireDocumentationAdmin(); const { id } = await params; return <FolderDetailView id={id} owner={session.user.role === "OWNER"} />; }
