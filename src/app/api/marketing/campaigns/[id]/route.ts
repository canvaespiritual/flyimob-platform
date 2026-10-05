import { marketingSession, json, failure } from "@/lib/marketing/http.server";
import { campaignDetail } from "@/lib/marketing/queries.server";
import { updateCampaign } from "@/lib/marketing/admin.server";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, ctx: Context) {
  try { const viewer = await marketingSession(); return json(await campaignDetail(viewer, (await ctx.params).id, new URL(req.url).searchParams)); } catch (error) { return failure(error); }
}
export async function PATCH(req: Request, ctx: Context) {
  try { const viewer = await marketingSession(); return json(await updateCampaign(viewer, (await ctx.params).id, await req.json())); } catch (error) { return failure(error); }
}
