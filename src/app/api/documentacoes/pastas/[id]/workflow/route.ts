import { documentSession, sameOrigin } from "@/lib/documentacoes/document-access.server";
import { workflowMutation, workflowView, type WorkflowAction } from "@/lib/documentacoes/workflow.server";
import { failure, json } from "@/lib/documentacoes/http.server";
import { DocumentationError, input } from "@/lib/documentacoes/validation";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, context: Context) {
  try { const session = await documentSession(); const { id } = await context.params; return json(await workflowView(session, id, new URL(req.url).searchParams)); } catch (error) { return failure(error); }
}
export async function POST(req: Request, context: Context) {
  try {
    const session = await documentSession(); sameOrigin(req); const { id } = await context.params;
    const body = input(await req.json().catch(() => { throw new DocumentationError(400, "JSON inválido."); }));
    return json(await workflowMutation(session, id, body?.action as WorkflowAction, body));
  } catch (error) { return failure(error); }
}
