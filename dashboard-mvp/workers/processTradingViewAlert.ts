import { Worker } from "bullmq";
import { auditLog } from "@/lib/db/audit";
import { createOpportunityFromTradingViewAlert } from "@/lib/opportunities/createOpportunity";
import { getRedisConnection } from "@/lib/queues/connection";

const worker = new Worker(
  "tradingview-alerts",
  async (job) => {
    const alertId = String(job.data.alertId);
    await createOpportunityFromTradingViewAlert(alertId);
  },
  { connection: getRedisConnection(), concurrency: 3 },
);

worker.on("failed", async (job, error) => {
  await auditLog("worker_error", "TradingView worker failed", {
    jobId: job?.id ?? null,
    error: error.message,
  });
});

console.log("TradingView alert worker started.");
