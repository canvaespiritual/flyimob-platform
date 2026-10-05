import { getPermissionApiSession } from "@/lib/api-access.server";
import { failure, json } from "@/lib/marketing/http.server";
import { savePerson } from "@/lib/team/service.server";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getPermissionApiSession("users:invite");
  if (!auth.ok) return auth.response;
  try { return json(await savePerson(auth.session, (await context.params).id, await request.json())); }
  catch (error) { return failure(error); }
}
