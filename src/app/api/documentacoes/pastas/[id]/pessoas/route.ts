import { documentationApiSession, failure, json } from "@/lib/documentacoes/http.server";
import { mutatePerson } from "@/lib/documentacoes/folders.server";
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try { const session = await documentationApiSession(); const { id } = await context.params; return json(await mutatePerson(session, id, null, "POST", await req.json()), 201); } catch (error) { return failure(error); }
}
