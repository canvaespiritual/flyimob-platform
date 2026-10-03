import { documentationApiSession, failure, json } from "@/lib/documentacoes/http.server";
import { mutatePerson } from "@/lib/documentacoes/folders.server";
type Context = { params: Promise<{ id: string; personId: string }> };
async function change(req: Request, context: Context, method: "PATCH" | "DELETE") {
  try { const session = await documentationApiSession(); const { id, personId } = await context.params; return json(await mutatePerson(session, id, personId, method, await req.json())); } catch (error) { return failure(error); }
}
export const PATCH = (req: Request, context: Context) => change(req, context, "PATCH");
export const DELETE = (req: Request, context: Context) => change(req, context, "DELETE");
