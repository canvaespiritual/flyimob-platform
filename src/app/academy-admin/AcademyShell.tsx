"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  ["/academy-admin", "Visão geral"],
  ["/academy-admin/analytics", "Analytics"],
  ["/academy-admin/checkouts", "Leads e Checkouts"],
  ["/academy-admin/financeiro", "Financeiro"],
  ["/academy-admin/administracao", "Administração"],
] as const;

export default function AcademyShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/95">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/academy-admin" className="text-lg font-bold tracking-tight">Flyimob Academy</Link>
          <nav className="flex flex-wrap gap-1" aria-label="Navegação Academy">
            {links.map(([href, label]) => (
              <Link key={href} href={href} className={`rounded-lg px-3 py-2 text-sm transition ${pathname === href ? "bg-orange-500 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`}>
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
