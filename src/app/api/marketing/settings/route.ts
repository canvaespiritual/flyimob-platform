import { marketingSession, json, failure } from "@/lib/marketing/http.server";
import { settings } from "@/lib/marketing/queries.server";
import { createCostRule } from "@/lib/marketing/admin.server";
export async function GET() {
  try { return json(await settings(await marketingSession(true))); } catch (error) { return failure(error); }
}
export async function POST(req: Request) {
  try { const viewer = await marketingSession(true); return json(await createCostRule(viewer, await req.json()), 201); } catch (error) { return failure(error); }
}
