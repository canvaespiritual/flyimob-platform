// src/app/admin/usuarios/page.tsx
import { requirePermission } from "@/lib/authz.server";
import UsersClient from "./UsersClient";
import TeamClient from "./TeamClient";

export default async function UsuariosPage() {
  // Se não tiver users:read, cai em /admin/forbidden
  await requirePermission("users:read");

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Usuários / Equipe</h1>
        <p className="text-sm text-gray-500">
          Pessoas, funções operacionais, vínculos financeiros e acesso ao sistema.
        </p>
      </div>

      <TeamClient />
      <details className="mt-6 rounded-lg border p-4"><summary className="cursor-pointer font-medium">Convites e gestão de acesso existente</summary><div className="mt-4"><UsersClient /></div></details>
    </div>
  );
}
