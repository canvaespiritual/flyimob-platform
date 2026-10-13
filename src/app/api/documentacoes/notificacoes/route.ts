import { documentSession, sameOrigin } from "@/lib/documentacoes/document-access.server";
import { documentationNotifications, readDocumentationNotification } from "@/lib/documentacoes/notifications.server";
import { failure, json } from "@/lib/documentacoes/http.server";
import { input } from "@/lib/documentacoes/validation";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try { return json(await documentationNotifications(await documentSession(), new URL(req.url).searchParams)); }
  catch (error) { return failure(error); }
}
export async function POST(req: Request) {
  try { const session = await documentSession(); sameOrigin(req); const body = input(await req.json()); return json(await readDocumentationNotification(session, body.eventId)); }
  catch (error) { return failure(error); }
}
