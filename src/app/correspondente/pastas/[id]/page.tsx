import { redirect, notFound } from "next/navigation";
import { requireUser } from "@/lib/authz.server";
import { prisma } from "@/lib/prisma";
import FolderDocuments from "./FolderDocuments";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  if (session.user.role !== "CORRESPONDENTE") redirect("/admin");
  if (session.tenant.isPlatform || session.user.tenantId !== session.tenant.id) notFound();
  const { id } = await params;
  if (!await prisma.documentationFolder.count({ where: { id, tenantId: session.tenant.id, correspondentId: session.user.id } })) notFound();
  return <FolderDocuments id={id} />;
}
