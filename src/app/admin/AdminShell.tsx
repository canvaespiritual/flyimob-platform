"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV = [
  { href: "/admin/empreendimentos", label: "Empreendimentos" },
  { href: "/admin/construtoras", label: "Construtoras" },
  { href: "/admin/comparativos", label: "Comparativos" },
  { href: "/admin/clientes", label: "Clientes" },
  { href: "/admin/dashboard", label: "Dashboard" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

function Sidebar({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <aside className="h-full w-[260px] border-r bg-white flex flex-col">
      <div className="h-16 px-4 flex items-center gap-3 border-b">
        <img src="/brand/flyimob-icon.png" alt="FlyImob" className="w-9 h-9" />
        <div className="leading-tight">
          <div className="font-semibold text-sm text-gray-900">FlyImob</div>
          <div className="text-xs text-gray-500">Painel</div>
        </div>
      </div>

      <nav className="p-3 space-y-1">
        {NAV.map((item) => {
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
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: "#F37021" }}
                  aria-hidden
                />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto p-4 border-t">
        <div className="text-xs text-gray-500">
          Versão MVP • <span className="font-mono">flyimob</span>
        </div>
        <div className="mt-2 h-[2px] w-full bg-gray-100 rounded" />
        <div className="mt-2 h-[2px] w-2/3 rounded" style={{ backgroundColor: "#1FB6B2" }} />
      </div>
    </aside>
  );
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      <div className="flex min-h-screen">
        {/* Sidebar desktop */}
        <div className="hidden md:block">
          <Sidebar pathname={pathname} />
        </div>

        {/* Drawer mobile */}
        {open && (
          <div className="fixed inset-0 z-[9999] md:hidden">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setOpen(false)}
            />
            <div className="absolute left-0 top-0 h-full">
              <Sidebar pathname={pathname} onNavigate={() => setOpen(false)} />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Topbar */}
          <header className="h-16 border-b bg-white px-4 md:px-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Botão mobile */}
              <button
                type="button"
                className="md:hidden border rounded px-3 py-2 hover:bg-gray-50"
                onClick={() => setOpen(true)}
                aria-label="Abrir menu"
              >
                ☰
              </button>

              <div className="flex items-center gap-3">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: "#1FB6B2" }}
                  aria-hidden
                />
                <div className="text-sm text-gray-700">Área administrativa</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <a
                href="/"
                className="text-sm border rounded px-3 py-2 hover:bg-gray-50"
                title="Voltar ao mapa público"
              >
                Ver mapa
              </a>

              <div
                className="hidden sm:block text-sm px-3 py-2 rounded border"
                style={{ borderColor: "rgba(31,182,178,0.35)" }}
              >
                <span className="text-gray-500">Tenant:</span>{" "}
                <span className="font-mono text-gray-900">flyimob</span>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 md:px-6 py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
