// Same application, background dispatch client. No database access or secrets in logs.
import { setTimeout as delay } from "node:timers/promises";
const origin = process.env.ACADEMY_ADMIN_ORIGIN;
const secret = process.env.ACADEMY_PUSH_WORKER_SECRET;
if (!origin || !secret) throw new Error("Academy worker configuration missing");
async function dispatch() {
  const response = await fetch(new URL("/api/admin/academy/push/dispatch", origin), {
    method: "POST", headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok) throw new Error(`Academy worker HTTP ${response.status}`);
  console.log("Academy push cycle completed");
}

if (process.argv.includes("--loop")) {
  // One request at a time; restarting the worker is safe because deliveries persist.
  for (;;) {
    try { await dispatch(); } catch { console.error("Academy push cycle failed; retrying in 20 seconds"); }
    await delay(20_000);
  }
} else {
  await dispatch();
}
