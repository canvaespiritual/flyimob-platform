// src/app/admin/layout.tsx
import AdminShell from "./AdminShell";
import { requireUser } from "@/lib/authz.server";
import { redirect } from "next/navigation";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await requireUser();
  if (s.user.role === "CORRESPONDENTE") redirect("/correspondente");

  return (
    <AdminShell
      tenantSlug={s.tenant.slug}
      tenantName={s.tenant.name}
      userName={s.user.name}
      userRole={s.user.role}
      isPlatform={s.tenant.isPlatform}
    >
      {children}
    </AdminShell>
  );
}
