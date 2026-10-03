import { documentationApiSession, failure, json } from "@/lib/documentacoes/http.server";
import { updateFolder } from "@/lib/documentacoes/folders.server";
import { folderDetail } from "@/lib/documentacoes/queries.server";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, context: Context) {
  try { const session = await documentationApiSession(); const { id } = await context.params; return json(await folderDetail(session.tenant.id, id, new URL(req.url).searchParams)); } catch (error) { return failure(error); }
}
export async function PATCH(req: Request, context: Context) {
  try { const session = await documentationApiSession(); const { id } = await context.params; return json(await updateFolder(session, id, await req.json())); } catch (error) { return failure(error); }
}
