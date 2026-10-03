import { documentationApiSession, failure, json } from "@/lib/documentacoes/http.server";
import { createFolder } from "@/lib/documentacoes/folders.server";
import { listFolders } from "@/lib/documentacoes/queries.server";
export async function GET(req: Request) {
  try { const session = await documentationApiSession(); return json(await listFolders(session.tenant.id, new URL(req.url).searchParams)); } catch (error) { return failure(error); }
}
export async function POST(req: Request) {
  try { const session = await documentationApiSession(); return json(await createFolder(session, await req.json()), 201); } catch (error) { return failure(error); }
}
