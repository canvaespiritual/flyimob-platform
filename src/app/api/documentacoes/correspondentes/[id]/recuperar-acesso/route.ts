import { POST as forgotPassword } from "@/app/api/auth/forgot-password/route";
import { prisma } from "@/lib/prisma";
import { documentationApiSession, failure } from "@/lib/documentacoes/http.server";
import { DocumentationError } from "@/lib/documentacoes/validation";
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await documentationApiSession(true); const { id } = await context.params;
    const user = await prisma.user.findFirst({ where: { id, tenantId: session.tenant.id, role: "CORRESPONDENTE", isActive: true }, select: { email: true } });
    if (!user) throw new DocumentationError(404, "Correspondente ativo não encontrado.");
    if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL || !process.env.BREVO_SENDER_NAME || !process.env.APP_URL || !Number.isSafeInteger(Number(process.env.BREVO_TEMPLATE_RESET_ID)) || Number(process.env.BREVO_TEMPLATE_RESET_ID) < 1) throw new DocumentationError(503, "A recuperação por e-mail não está configurada.");
    return await forgotPassword(new Request(req.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: user.email }) }));
  } catch (error) { return failure(error); }
}
