import { marketingSession, json, failure } from "@/lib/marketing/http.server";
import { configureConnection } from "@/lib/marketing/admin.server";
export async function POST(req: Request) {
  try { const viewer = await marketingSession(true); return json(await configureConnection(viewer, null, await req.json()), 201); } catch (error) { return failure(error); }
}
