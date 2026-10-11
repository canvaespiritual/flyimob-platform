import { getSessionUser } from "@/lib/session.server";
import { officeIdentity } from "@/lib/broker-office/identity.server";
import { officeReceipt } from "@/lib/broker-office/receipts.server";
import { MarketingError } from "@/lib/marketing/policy";
export async function GET(_request: Request, context: { params: Promise<{ kind: string; id: string }> }) {
  try {
    const viewer = await getSessionUser(); if (!viewer) return Response.json({ error: "Entre novamente." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
    const identity = await officeIdentity(viewer), { kind, id } = await context.params;
    const file = await officeReceipt(identity, kind, id);
    return new Response(new Uint8Array(file.bytes), { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (e) { return Response.json({ error: e instanceof MarketingError ? e.message : "Comprovante indisponível." }, { status: e instanceof MarketingError ? e.status : 503, headers: { "Cache-Control": "private, no-store" } }); }
}
