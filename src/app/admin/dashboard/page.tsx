import { getSessionUser } from "@/lib/session.server";
import { redirect } from "next/navigation";
export default async function Page() {
  const viewer = await getSessionUser();
  if (viewer?.user.role === "BROKER" && !viewer.tenant.isPlatform) redirect("/admin/corretor/dashboard");
  return <div className="text-sm text-gray-600">Em construção.</div>;
}
