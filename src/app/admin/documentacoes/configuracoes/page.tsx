import { requireDocumentationAdmin } from "@/lib/documentacoes/access.server";
import { TypesView } from "../ui";
export default async function Page() { const session = await requireDocumentationAdmin(); return <TypesView owner={session.user.role === "OWNER"} />; }
