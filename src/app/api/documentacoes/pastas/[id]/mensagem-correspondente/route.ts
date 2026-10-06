import { documentationApiSession, failure, json } from "@/lib/documentacoes/http.server";
import { sameOrigin } from "@/lib/documentacoes/document-access.server";
import { updateCorrespondentMessage } from "@/lib/documentacoes/folders.server";
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await documentationApiSession(); sameOrigin(req);
    const { id } = await context.params;
    return json(await updateCorrespondentMessage(session, id, await req.json()));
  } catch (error) { return failure(error); }
}
