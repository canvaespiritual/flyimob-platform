import { loadDocumentationEnv } from "./documentacoes-env.mjs";
import { prisma } from "../src/lib/prisma";
import { claimSync } from "../src/lib/marketing/sync.server";
import { executeSync } from "../src/lib/marketing/worker.server";
loadDocumentationEnv();
// One bounded pass, suitable for a Railway scheduled service. No provider payloads or secrets in output.
async function main() {
  const pending = await prisma.marketingSyncRun.findMany({ where: { OR: [{ status: "PENDING", nextAttemptAt: { lte: new Date() } }, { status: "RUNNING", claimedAt: { lt: new Date(Date.now() - 600000) } }] },
    distinct: ["tenantId", "accountId"], select: { tenantId: true, accountId: true }, take: 100 });
  let succeeded = 0, failed = 0;
  for (const target of pending) {
    const run = await claimSync(target.tenantId, target.accountId);
    if (!run) continue;
    const result = await executeSync(run); if (result.status === "SUCCEEDED") succeeded++; else failed++;
  }
  console.log(JSON.stringify({ attempted: succeeded + failed, succeeded, failed }));
}
main().catch(() => { console.error("Marketing worker did not complete; inspect safe sync statuses."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
