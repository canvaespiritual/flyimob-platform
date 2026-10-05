import { redirect } from "next/navigation";
import { marketingPageSession } from "@/lib/marketing/http.server";
import { canConfigureMarketing } from "@/lib/marketing/policy";
import { SettingsScreen } from "../ui";
export default async function SettingsPage() {
  if (!canConfigureMarketing(await marketingPageSession())) redirect("/admin/forbidden");
  return <SettingsScreen />;
}
