import { requireUser } from "@/lib/authz.server";
import { notFound } from "next/navigation";
import CorretorPwa from "@/components/CorretorPwa";
export default async function Layout({ children }: { children: React.ReactNode }) {
  const s = await requireUser();
  if (s.user.role !== "BROKER" || s.tenant.isPlatform) notFound();
  return <div className="broker-workspace"><div className="px-4"><CorretorPwa /></div>{children}</div>;
}
