import { marketingSession, json, failure } from "@/lib/marketing/http.server";
import { campaignList } from "@/lib/marketing/queries.server";
export async function GET(req: Request) {
  try { return json(await campaignList(await marketingSession(), new URL(req.url).searchParams)); } catch (error) { return failure(error); }
}
