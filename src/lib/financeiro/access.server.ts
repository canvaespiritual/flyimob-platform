import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session.server";

const FINANCE_ALLOWED_ROLES = ["OWNER", "DIRECTOR"] as const;

function roleCanAccessFinance(role: string) {
  return FINANCE_ALLOWED_ROLES.includes(
    role as (typeof FINANCE_ALLOWED_ROLES)[number]
  );
}

/**
 * Verifica se uma sessão pode acessar o módulo Financeiro.
 *
 * Regra atual:
 * - Tenant master / plataforma: NÃO acessa
 * - Tenant regional: acessa
 * - Dentro da regional: apenas OWNER ou DIRECTOR
 */
export function canAccessFinance(session: {
  tenant: {
    isPlatform: boolean;
  };
  user: {
    role: string;
  };
}) {
  if (session.tenant.isPlatform) {
    return false;
  }

  return roleCanAccessFinance(session.user.role);
}

/**
 * Usar nas páginas Server Component do Financeiro.
 *
 * - Sem sessão -> /login
 * - Master/plataforma -> /admin/forbidden
 * - Role não autorizado -> /admin/forbidden
 * - Regional OWNER/DIRECTOR -> retorna a sessão
 */
export async function requireFinanceAccess() {
  const session = await getSessionUser();

  if (!session) {
    redirect("/login");
  }

  if (!canAccessFinance(session)) {
    redirect("/admin/forbidden");
  }

  return session;
}

/**
 * Usar nas APIs do Financeiro.
 *
 * Diferente de requireFinanceAccess(), não faz redirect.
 * Retorna um objeto simples para a API decidir a resposta HTTP.
 */
export async function getFinanceApiSession() {
  const session = await getSessionUser();

  if (!session) {
    return {
      ok: false as const,
      status: 401,
      error: "unauthorized",
    };
  }

  if (!canAccessFinance(session)) {
    return {
      ok: false as const,
      status: 403,
      error: "forbidden",
    };
  }

  return {
    ok: true as const,
    session,
  };
}