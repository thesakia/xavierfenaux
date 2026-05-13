import { Worker } from "bullmq";
import { auditLog } from "@/lib/db/audit";
import { scanNewsNow } from "@/lib/news/scan";
import { getRedisConnection } from "@/lib/queues/connection";
import { getNewsQueue } from "@/lib/queues/queues";

await getNewsQueue().add(
  "scan-news",
  {},
  {
    repeat: { every: 45 * 60 * 1000 },
    jobId: "scheduled-news-scan",
  },
);

const worker = new Worker(
  "news-scan",
  async () => {
    await scanNewsNow();
  },
  { connection: getRedisConnection(), concurrency: 1 },
);

worker.on("failed", async (job, error) => {
  await auditLog("worker_error", "News worker failed", {
    jobId: job?.id ?? null,
    error: error.message,
  });
});

console.log("News scan worker started. Scheduled every 45 minutes.");
