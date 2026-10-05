import { marketingSession, json, failure } from "@/lib/marketing/http.server";
import { syncSelected } from "@/lib/marketing/worker.server";
export const maxDuration = 300;
export async function POST(req: Request) {
  try { return json(await syncSelected(await marketingSession(true), await req.json())); } catch (error) { return failure(error); }
}
