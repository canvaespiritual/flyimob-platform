import Link from "next/link";
import { marketingPageSession } from "@/lib/marketing/http.server";
import { canConfigureMarketing } from "@/lib/marketing/policy";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const viewer = await marketingPageSession();
  return <div className="mx-auto max-w-7xl space-y-6">
    <header><p className="text-xs font-semibold uppercase tracking-widest text-teal-700">Flyimob · inteligência empresarial</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Marketing</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">Acompanhe investimento, leads reportados e a participação de cada corretor.</p></header>
    <nav aria-label="Marketing" className="flex flex-wrap gap-2 border-b pb-4">
      <Link className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50" href="/admin/marketing">Visão geral</Link>
      <Link className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50" href="/admin/marketing/campanhas">Campanhas</Link>
      <Link className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50" href="/admin/marketing/desempenho">Desempenho</Link>
      <Link className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50" href="/admin/marketing/aportes">Aportes</Link>
      <Link className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50" href="/admin/marketing/pulmao">Pulmão</Link>
      {canConfigureMarketing(viewer) && <Link className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50" href="/admin/marketing/configuracoes">Configurações</Link>}
    </nav>{children}
  </div>;
}
