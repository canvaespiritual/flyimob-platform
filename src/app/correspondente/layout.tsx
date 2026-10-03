import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz.server";

export default async function CorrespondentLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser();
  if (session.user.role !== "CORRESPONDENTE") redirect("/admin");
  if (session.tenant.isPlatform || session.user.tenantId !== session.tenant.id) redirect("/login");
  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
      <Link href="/correspondente" aria-label="Flyimob — meus clientes"><Image src="/brand/flyimob-logo.png" alt="Flyimob" width={150} height={44} className="h-10 w-auto" priority /></Link>
      <div className="flex-1 sm:pl-4"><p className="font-semibold">Área do correspondente</p><p className="text-sm text-slate-600">{session.user.name} · {session.tenant.name}</p></div>
      <form action="/api/auth/logout" method="post"><button className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50">Sair</button></form>
    </div></header>
    <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6"><details className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-950"><summary className="cursor-pointer font-semibold">Como funciona?</summary><ol className="mt-3 list-decimal space-y-1 pl-5"><li>Abra o cliente e visualize ou baixe os documentos.</li><li>Clique em Iniciar análise para começar.</li><li>Se precisar, solicite a correção de um documento e devolva a documentação para correções.</li><li>Anexe seus próprios documentos quando necessário.</li><li>Quando tudo estiver correto, aprove a documentação ou registre sua conclusão.</li></ol><p className="mt-3">Quando uma correção for reenviada, o cliente voltará para sua fila de Correções. O histórico fica disponível dentro do cliente.</p></details></div>
    {children}
  </div>;
}
