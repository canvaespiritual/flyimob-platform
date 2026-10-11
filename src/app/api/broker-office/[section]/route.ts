import { getSessionUser } from "@/lib/session.server";
import { officeIdentity } from "@/lib/broker-office/identity.server";
import { authorizeOffice, officePeriod } from "@/lib/broker-office/policy";
import { officeFinance } from "@/lib/broker-office/finance.server";
import { officeMarketing } from "@/lib/broker-office/marketing.server";
import { officeDashboard } from "@/lib/broker-office/dashboard.server";
import { MarketingError } from "@/lib/marketing/policy";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET(request: Request, context: { params: Promise<{ section: string }> }) {
  try {
    const viewer = await getSessionUser(); if (!viewer) return json({ error: "Entre na Flyimob para consultar sua operação." }, 401);
    authorizeOffice(viewer);
    const { section } = await context.params;
    if (!["dashboard", "finance", "marketing"].includes(section)) return json({ error: "Visão não encontrada." }, 404);
    const range = officePeriod(new URL(request.url).searchParams);
    const data = await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const identity = await officeIdentity(viewer, tx);
      if (section === "finance") return officeFinance(identity, range, tx);
      if (section === "marketing") return officeMarketing(identity, range, tx);
      const [operation, finance, marketing] = await Promise.all([officeDashboard(viewer, range, tx), officeFinance(identity, range, tx), officeMarketing(identity, range, tx)]);
      return { operation, finance: { linked: finance.linked, position: finance.position, period: finance.period }, marketing: { linked: marketing.linked, totals: marketing.totals, unavailable: marketing.unavailable } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000, maxWait: 5000 });
    return json({ range, data });
  } catch (e) { return json({ error: e instanceof MarketingError ? e.message : "Não foi possível consultar esta visão. Nenhum lançamento foi alterado." }, e instanceof MarketingError ? e.status : 503); }
}
