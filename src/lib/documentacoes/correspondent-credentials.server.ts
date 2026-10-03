import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth.server";
import { canManageDocumentation, type DocumentationViewer } from "./access-policy";
import { DocumentationError, input, text } from "./validation";

export async function setCorrespondentInitialPassword(session: DocumentationViewer, id: string, value: unknown, db = prisma) {
  if (!canManageDocumentation(session) || session.user.role !== "OWNER") throw new DocumentationError(403, "Somente o proprietário pode definir a senha inicial.");
  const body = input(value);
  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 8 || password.length > 256 || body.confirmPassword !== password) throw new DocumentationError(400, "Informe e confirme uma senha inicial de 8 a 256 caracteres.");
  const stamp = text(body.updatedAt, "Versão", true, 40)!;
  if (Number.isNaN(Date.parse(stamp))) throw new DocumentationError(400, "Versão inválida.");
  const passwordHash = await hashPassword(password);
  const changed = await db.user.updateMany({ where: { id, tenantId: session.tenant.id, role: "CORRESPONDENTE", isActive: true, updatedAt: new Date(stamp) }, data: { passwordHash, sessionVersion: { increment: 1 } } });
  if (changed.count !== 1) throw new DocumentationError(409, "Correspondente ausente, inativo ou atualizado. Recarregue antes de definir a senha.");
  // No password/hash is returned, persisted in messages or included in logs.
  return { ok: true };
}
