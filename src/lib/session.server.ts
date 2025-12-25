// src/lib/session.server.ts
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { sessionCookieName, verifySessionToken } from "@/lib/auth.server";

export async function getSessionUser() {
  // ✅ Next 16: cookies() pode ser async (Promise)
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;

  if (!token) return null;

  const v = verifySessionToken(token);
  if (!v.ok) return null;

  const { uid, tid } = v.payload;

  const user = await prisma.user.findFirst({
    where: { id: uid, tenantId: tid },
    include: { tenant: true },
  });

  if (!user) return null;

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    },
    tenant: {
      id: user.tenant.id,
      name: user.tenant.name,
      slug: user.tenant.slug,
      isPlatform: user.tenant.isPlatform,   // ADD
     parentId: user.tenant.parentId ?? null // opcional
    },
  };
}
