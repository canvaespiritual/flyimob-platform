import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz.server";
import { canManageDocumentation } from "./access-policy";

export async function requireDocumentationAdmin() {
  const session = await requireUser();
  if (session.user.role === "CORRESPONDENTE") redirect("/correspondente");
  if (!canManageDocumentation(session)) redirect("/admin/forbidden");
  return session;
}
