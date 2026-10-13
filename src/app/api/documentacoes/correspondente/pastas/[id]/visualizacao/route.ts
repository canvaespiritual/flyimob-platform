import { documentSession, sameOrigin } from "@/lib/documentacoes/document-access.server";
import { recordCorrespondentView } from "@/lib/documentacoes/round-tracking.server";
import { failure, json } from "@/lib/documentacoes/http.server";
import { input } from "@/lib/documentacoes/validation";
export const runtime = "nodejs";
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await documentSession(); sameOrigin(req);
    const { id } = await context.params; const body = input(await req.json());
    return json(await recordCorrespondentView(session, id, body.roundId));
  } catch (error) { return failure(error); }
}
