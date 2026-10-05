import { marketingSession, json, failure } from "@/lib/marketing/http.server";
import { configureConnection, selectAccount } from "@/lib/marketing/admin.server";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(req: Request, ctx: Context) {
  try { const viewer = await marketingSession(true); return json(await configureConnection(viewer, (await ctx.params).id, await req.json())); } catch (error) { return failure(error); }
}
export async function PUT(req: Request, ctx: Context) {
  try { const viewer = await marketingSession(true); return json(await selectAccount(viewer, (await ctx.params).id, await req.json())); } catch (error) { return failure(error); }
}
