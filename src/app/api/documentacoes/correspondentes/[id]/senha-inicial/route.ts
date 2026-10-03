import { documentationApiSession, failure, json } from "@/lib/documentacoes/http.server";
import { sameOrigin } from "@/lib/documentacoes/document-access.server";
import { setCorrespondentInitialPassword } from "@/lib/documentacoes/correspondent-credentials.server";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await documentationApiSession(true); sameOrigin(req);
    const { id } = await context.params;
    return json(await setCorrespondentInitialPassword(session, id, await req.json()));
  } catch (error) { return failure(error); }
}
