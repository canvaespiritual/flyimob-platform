"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  {
    href: "/admin/financeiro",
    label: "Visão geral",
  },

  {
    href: "/admin/financeiro/vendas",
    label: "Vendas",
  },

  {
    href: "/admin/financeiro/participantes",
    label: "Participantes",
  },

  {
    href: "/admin/financeiro/recebimentos",
    label: "Recebimentos",
  },

  {
    href: "/admin/financeiro/impostos",
    label: "Impostos",
  },

  {
    href: "/admin/financeiro/fechamentos",
    label: "Fechamentos",
  },

  {
    href: "/admin/financeiro/relatorios",
    label: "Relatórios",
  },

  {
    href: "/admin/financeiro/configuracoes",
    label: "Configurações",
  },
];

function isActive(
  pathname: string,
  href: string
) {
  if (href === "/admin/financeiro") {
    return pathname === href;
  }

  return (
    pathname === href ||
    pathname.startsWith(`${href}/`)
  );
}

export default function FinanceiroNav() {
  const pathname = usePathname();

  return (
    <div className="overflow-x-auto">
      <nav className="flex min-w-max gap-2">
        {items.map((item) => {
          const active =
            isActive(
              pathname,
              item.href
            );

          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "rounded-md",
                "border",
                "px-3",
                "py-2",
                "text-sm",
                "transition",
                active
                  ? "border-gray-300 bg-gray-100 font-medium text-gray-900"
                  : "border-transparent text-gray-600 hover:border-gray-200 hover:bg-gray-50",
              ].join(" ")}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}