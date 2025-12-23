import { requirePermission } from "@/lib/authz.server";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePermission("comparativos:use");
  return children;
}
