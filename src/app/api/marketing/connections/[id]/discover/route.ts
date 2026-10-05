import { discoverAccounts } from "@/lib/marketing/connections.server";
import { marketingSession, json, failure } from "@/lib/marketing/http.server";
export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  try { return json(await discoverAccounts(await marketingSession(true), (await context.params).id)); } catch (error) { return failure(error); }
}
