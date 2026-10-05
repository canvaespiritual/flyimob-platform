import { prisma } from "@/lib/prisma";
import { marketingSession, failure, json } from "@/lib/marketing/http.server";
import { confirmCostCorrection, costCorrectionEvent, previewCostCorrection } from "@/lib/marketing/cost-corrections.server";
import { MarketingError } from "@/lib/marketing/policy";
type Context = { params: Promise<{ id: string }> };
export async function POST(req: Request, context: Context) {
  try { const viewer = await marketingSession(true); const { id } = await context.params; return json(await previewCostCorrection(viewer, id, await req.json())); } catch (error) { return failure(error); }
}
export async function PATCH(req: Request, context: Context) {
  try { const viewer = await marketingSession(true); const { id } = await context.params; return json(await confirmCostCorrection(viewer, id, await req.json())); } catch (error) { return failure(error); }
}
export async function GET(req: Request, context: Context) {
  try {
    const viewer = await marketingSession(true); const { id } = await context.params;
    const page = Number(new URL(req.url).searchParams.get("page") ?? "1");
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new MarketingError(400, "Página inválida.");
    const where = { tenantId: viewer.tenant.id, entityId: id, eventType: costCorrectionEvent };
    const [items, total] = await Promise.all([
      prisma.marketingAuditEvent.findMany({ where, select: { id: true, metadata: true, createdAt: true, actor: { select: { id: true, name: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20, skip: (page - 1) * 20 }),
      prisma.marketingAuditEvent.count({ where }),
    ]);
    return json({ items, total, page });
  } catch (error) { return failure(error); }
}
