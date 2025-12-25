// src/app/admin/usuarios/page.tsx
import { requirePermission } from "@/lib/authz.server";
import UsersClient from "./UsersClient";

export default async function UsuariosPage() {
  // Se não tiver users:read, cai em /admin/forbidden
  await requirePermission("users:read");

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Usuários</h1>
        <p className="text-sm text-gray-500">
          Convide novos usuários e gerencie acesso (ativo/inativo).
        </p>
      </div>

      <UsersClient />
    </div>
  );
}
