import { academyAdmin } from "@/lib/academy/admin-access.server";
import { academyError, academyJson } from "@/lib/academy/http.server";
import { mobileOverview } from "@/lib/academy/mobile.server";

export const dynamic = "force-dynamic";

export async function GET() {
  try { await academyAdmin(); return academyJson(await mobileOverview()); }
  catch (error) { return academyError(error); }
}
