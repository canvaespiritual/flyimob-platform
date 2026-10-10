"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { UserRole } from "@prisma/client";
import { hasPermission } from "@/lib/rbac";
import CorretorPwa from "@/components/CorretorPwa";

type NavItem = { href: string; label: string; perm?: Parameters<typeof hasPermission>[1] };

const ALL_NAV: NavItem[] = [
  { href: "/admin/empreendimentos", label: "Empreendimentos", perm: "data:manage" },
  { href: "/admin/construtoras", label: "Construtoras", perm: "data:manage" },
  { href: "/admin/comparativos", label: "Comparativos", perm: "comparativos:use" },
  { href: "/admin/clientes", label: "Clientes", perm: "crm:use" }, // pode remover por ora
  { href: "/admin/dashboard", label: "Dashboard", perm: "dashboard:view" },
  { href: "/admin/usuarios", label: "Usuários", perm: "users:read" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

function Sidebar({
  pathname,
  onNavigate,
  nav,
  tenantSlug,
}: {
  pathname: string;
  onNavigate?: () => void;
  nav: NavItem[];
  tenantSlug: string;
}) {
  return (
    <aside className="h-full w-[260px] max-w-[85vw] overflow-y-auto border-r bg-white flex flex-col">
      <div className="h-16 px-4 flex items-center gap-3 border-b">
        <img src="/brand/flyimob-icon.png" alt="FlyImob" className="w-9 h-9" />
        <div className="leading-tight">
          <div className="font-semibold text-sm text-gray-900">FlyImob</div>
          <div className="text-xs text-gray-500">Painel</div>
        </div>
      </div>

      <nav className="p-3 space-y-1" aria-label="Menu principal">
        {onNavigate && <button onClick={onNavigate} className="w-full border rounded p-3 mb-2">Fechar menu</button>}
        {nav.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => onNavigate?.()}
              className={[
                "flex items-center justify-between rounded px-3 py-2 text-sm border",
                active
                  ? "bg-gray-50 border-gray-200"
                  : "bg-white border-transparent hover:bg-gray-50 hover:border-gray-200",
              ].join(" ")}
            >
              <span className={active ? "text-gray-900 font-medium" : "text-gray-700"}>
                {item.label}
              </span>
              {active && (
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#F37021" }} />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto p-4 border-t">
        <div className="text-xs text-gray-500">
          Versão MVP • <span className="font-mono">{tenantSlug}</span>
        </div>
        <div className="mt-2 h-[2px] w-full bg-gray-100 rounded" />
        <div className="mt-2 h-[2px] w-2/3 rounded" style={{ backgroundColor: "#1FB6B2" }} />
      </div>
    </aside>
  );
}

export default function AdminShell({
  children,
  tenantSlug,
  tenantName,
  userName,
  userRole,
  isPlatform,
}: {
  children: React.ReactNode;
  tenantSlug: string;
  tenantName: string;
  userName: string;
  userRole: UserRole;
  isPlatform: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const drawer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(drawer.current?.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [tabindex='0']") ?? []);
    focusable()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key !== "Tab") return;
      const nodes = focusable(), first = nodes[0], last = nodes.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener("keydown", key); previous?.focus(); };
  }, [open]);

    const nav = useMemo<NavItem[]>(() => {
    const base = ALL_NAV.filter((i) => !i.perm || hasPermission(userRole, i.perm));

   if (isPlatform && userRole === "OWNER") {
  return [
    {
      href: "/admin/operacoes",
      label: "Operações",
    },
    ...base,
  ];
}

if (
  !isPlatform &&
  (userRole === "OWNER" ||
    userRole === "DIRECTOR")
) {
  return [
    ...base,
    { href: "/admin/treinamentos/acessos", label: "Acesso a treinamentos" },
    {
      href: "/admin/marketing",
      label: "Marketing",
    },
    {
      href: "/admin/financeiro",
      label: "Financeiro",
    },
    {
      href: "/admin/documentacoes",
      label: "Documentações",
      perm: "documentacoes:manage",
    },
  ];
}

if (!isPlatform && userRole === "BROKER") return [...base, { href: "/documentacoes", label: "Minhas documentações" }, { href: "/admin/treinamentos", label: "Treinamentos" }];
return base;
  }, [userRole, isPlatform]);

  return (
    <div className="min-h-screen bg-white">
      <div className="flex min-h-screen">
        <div className="hidden md:block">
          <Sidebar pathname={pathname} nav={nav} tenantSlug={tenantSlug} />
        </div>

        {open && (
          <div className="fixed inset-0 z-[9999] md:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
            <div ref={drawer} role="dialog" aria-modal="true" aria-label="Navegação" className="absolute left-0 top-0 h-full">
              <Sidebar
                pathname={pathname}
                nav={nav}
                tenantSlug={tenantSlug}
                onNavigate={() => setOpen(false)}
              />
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0">
          <header className="min-h-16 border-b bg-white px-3 md:px-6 py-2 flex flex-wrap gap-2 items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="md:hidden border rounded px-3 py-2 hover:bg-gray-50"
                onClick={() => setOpen(true)}
                aria-label="Abrir menu"
                aria-expanded={open}
              >
                ☰
              </button>

              <div className="text-sm text-gray-700 max-w-[45vw] break-words">
                {tenantName} • <span className="font-mono">{tenantSlug}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Link href="/" className="text-sm border rounded px-3 py-2 hover:bg-gray-50">
                Ver mapa
              </Link>

              <div className="hidden sm:block text-sm px-3 py-2 rounded border">
                <span className="text-gray-500">{userName}</span>{" "}
                <span className="font-mono text-gray-700">({userRole})</span>
              </div>

              <form action="/api/auth/logout" method="post">
                <button className="text-sm border rounded px-3 py-2 hover:bg-gray-50" type="submit">
                  Sair
                </button>
              </form>
            </div>
          </header>

          <main className="broker-workspace flex-1 min-w-0 px-4 md:px-6 py-6">{userRole === "BROKER" && <CorretorPwa />}{children}</main>
        </div>
      </div>
    </div>
  );
}
