import { academyAdmin, assertAdminOrigin } from "@/lib/academy/admin-access.server";
import { academyError, academyJson, readLimitedJson } from "@/lib/academy/http.server";
import { pushConfiguration, subscribe, unsubscribe } from "@/lib/academy/push.server";
import { AcademyError } from "@/lib/academy/limits";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await academyAdmin();
    assertAdminOrigin(request);
    if (!pushConfiguration()) throw new AcademyError(503, "push_not_configured");
    await subscribe(user.id, await readLimitedJson(request));
    return academyJson({ ok: true });
  } catch (error) { return academyError(error); }
}

export async function DELETE(request: Request) {
  try {
    const user = await academyAdmin();
    assertAdminOrigin(request);
    const body = await readLimitedJson(request) as { endpoint?: unknown };
    await unsubscribe(user.id, body?.endpoint);
    return academyJson({ ok: true });
  } catch (error) { return academyError(error); }
}
