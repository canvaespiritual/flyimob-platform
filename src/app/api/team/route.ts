import { prisma } from "@/lib/prisma";
import { getPermissionApiSession } from "@/lib/api-access.server";
import { failure, json } from "@/lib/marketing/http.server";
import { people, savePerson } from "@/lib/team/service.server";
export async function GET() {
  const auth = await getPermissionApiSession("users:read");
  if (!auth.ok) return auth.response;
  try {
    const tenantId = auth.session.tenant.id;
    const [rows, participants, users] = await Promise.all([
      people(tenantId),
      prisma.financialParticipant.findMany({ where: { tenantId }, select: { id: true, name: true, userId: true, personId: true }, orderBy: { name: "asc" } }),
      prisma.user.findMany({ where: { tenantId }, select: { id: true, name: true, email: true, personId: true }, orderBy: { name: "asc" } }),
    ]);
    return json({ rows, participants, users });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  const auth = await getPermissionApiSession("users:invite");
  if (!auth.ok) return auth.response;
  try { return json(await savePerson(auth.session, null, await request.json()), 201); }
  catch (error) { return failure(error); }
}
