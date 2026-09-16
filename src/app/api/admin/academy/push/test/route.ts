import { academyAdmin, assertAdminOrigin } from "@/lib/academy/admin-access.server";
import { academyError, academyJson, readLimitedJson } from "@/lib/academy/http.server";
import { testNotification } from "@/lib/academy/push.server";

export async function POST(request: Request) {
  try {
    const user = await academyAdmin();
    assertAdminOrigin(request);
    const body = await readLimitedJson(request) as { endpoint?: unknown; kind?: unknown };
    await testNotification(user.id, body?.endpoint, body?.kind);
    return academyJson({ ok: true });
  } catch (error) { return academyError(error); }
}
