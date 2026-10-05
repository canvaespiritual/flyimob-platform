import { marketingSession, json, failure } from "@/lib/marketing/http.server";
import { options } from "@/lib/marketing/queries.server";
export async function GET() {
  try { return json(await options(await marketingSession())); } catch (error) { return failure(error); }
}
