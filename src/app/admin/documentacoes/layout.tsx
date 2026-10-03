import Link from "next/link";
import { requireDocumentationAdmin } from "@/lib/documentacoes/access.server";
export default async function DocumentationLayout({ children }: { children: React.ReactNode }) {
  await requireDocumentationAdmin();
  return <div className="space-y-5"><nav aria-label="Documentações" className="flex flex-wrap gap-4 border-b pb-3 text-sm">{[["", "Visão geral"], ["/pastas", "Pastas"], ["/correspondentes", "Correspondentes"], ["/configuracoes", "Configurações"]].map(([path, name]) => <Link className="underline underline-offset-4" key={path} href={`/admin/documentacoes${path}`}>{name}</Link>)}</nav>{children}</div>;
}
