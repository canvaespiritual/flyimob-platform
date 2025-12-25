// src/app/admin/clientes/page.tsx
import { requirePermission } from "@/lib/authz.server";
import CrmLeadsClient from "./ui/CrmLeadsClient";

export default async function ClientesPage() {
  await requirePermission("crm:use");
  return <CrmLeadsClient />;
}
