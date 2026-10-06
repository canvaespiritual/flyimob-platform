import { prisma } from "@/lib/prisma";
import { civilToday } from "./policy";
import { enqueueSync, claimSync } from "./sync.server";
import { executeSync, syncRange } from "./worker.server";
import { syncAccountBalance } from "./balances.server";

/** One bounded pass; account queue leases and daily keys serialize replicas. */
export async function scheduledMarketingPass(db = prisma, now = new Date()) {
  const accounts = await db.metaAdAccount.findMany({ where: { tenant: { isPlatform: false }, connections: { some: { selected: true, accessible: true, connection: { status: "AUTHORIZED", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } } } },
    select: { id: true, tenantId: true, timezone: true, status: true, sourceAccountStatus: true, lastSyncedAt: true, connections: { where: { selected: true, accessible: true, connection: { status: "AUTHORIZED", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } }, select: { connectionId: true }, orderBy: { connectionId: "asc" }, take: 1 } }, orderBy: [{ lastSyncedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }], take: 100 });
  let attempted=0, succeeded=0;
  for (const account of accounts) {
    const connectionId=account.connections[0]?.connectionId; if (!connectionId) continue;
    try {
      const today=civilToday(account.timezone,now);
      if (account.status === "ACTIVE" && account.sourceAccountStatus === 1) {
        const existing=await db.marketingSyncRun.findFirst({ where: { tenantId: account.tenantId, accountId: account.id, status: { in: ["PENDING", "RUNNING"] } }, select: { id: true } });
        const dailyRun=await db.marketingSyncRun.findUnique({where:{tenantId_accountId_idempotencyKey:{tenantId:account.tenantId,accountId:account.id,idempotencyKey:`scheduled:${today}`}},select:{id:true}});
        if (!existing && !dailyRun) await enqueueSync({ tenantId: account.tenantId, accountId: account.id, connectionId, idempotencyKey: `scheduled:${today}`, ...syncRange(account.timezone,!account.lastSyncedAt,now) },db);
        const run=await claimSync(account.tenantId,account.id,now,db);
        if (run) { attempted++; if ((await executeSync(run,db)).status === "SUCCEEDED") succeeded++; }
      }
      await syncAccountBalance(account.tenantId, account.id, connectionId, `daily:${today}`, db);
    } catch { /* Each account remains independent; safe statuses are persisted by synchronization boundaries. */ }
  }
  return { attempted,succeeded };
}
export function startMarketingScheduler() {
  if (!process.argv.includes("start") || process.env.NODE_ENV !== "production" || process.env.NEXT_PHASE === "phase-production-build") return;
  const globalState=globalThis as typeof globalThis & { marketingScheduler?: ReturnType<typeof setInterval> };
  if (globalState.marketingScheduler) return;
  let busy=false;
  const run=async()=> { if(busy)return; busy=true; try { await scheduledMarketingPass(); } catch { /* Database unavailable or migration pending: retry next bounded hourly pass; no secrets logged. */ } finally { busy=false; } };
  globalState.marketingScheduler=setInterval(()=>{void run();},60*60*1000); globalState.marketingScheduler.unref();
  const initial=setTimeout(()=>{void run();},60000); initial.unref();
}
