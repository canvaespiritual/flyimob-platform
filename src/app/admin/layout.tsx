// src/app/admin/layout.tsx
import AdminShell from "./AdminShell";
import { requireUser } from "@/lib/authz.server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await requireUser();

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
