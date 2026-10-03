import { POST as invite } from "@/app/api/admin/users/invite/route";
import { documentationApiSession, failure } from "@/lib/documentacoes/http.server";
import { input, text, DocumentationError } from "@/lib/documentacoes/validation";
export async function POST(req: Request) {
  try {
    await documentationApiSession(true); const body = input(await req.json()); const email = text(body.email, "E-mail", true, 320)!;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new DocumentationError(400, "E-mail inválido.");
    if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL || !process.env.APP_URL) throw new DocumentationError(503, "O envio de convites não está configurado.");
    return await invite(new Request(req.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, role: "CORRESPONDENTE" }) }));
  } catch (error) { return failure(error); }
}
