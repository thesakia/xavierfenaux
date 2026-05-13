import { OpportunityStatus } from "@prisma/client";
import { Worker } from "bullmq";
import { auditLog } from "@/lib/db/audit";
import { prisma } from "@/lib/db/prisma";
import { getRedisConnection } from "@/lib/queues/connection";
import { getScoringQueue } from "@/lib/queues/queues";
import { scoreOpportunity } from "@/lib/scoring/scoreOpportunity";

await getScoringQueue().add(
  "score-open-opportunities",
  {},
  {
    repeat: { every: 30 * 60 * 1000 },
    jobId: "scheduled-opportunity-scoring",
  },
);

const worker = new Worker(
  "opportunity-scoring",
  async () => {
    const opportunities = await prisma.opportunity.findMany({
      where: { status: OpportunityStatus.WATCHING },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    for (const opportunity of opportunities) {
      const scored = scoreOpportunity({
        hasTradingView: opportunity.source === "TRADINGVIEW" || opportunity.source === "MIX",
        hasIvtNotification: opportunity.source === "IVT" || opportunity.source === "MIX",
        coherentNewsScore: opportunity.source === "NEWS" || opportunity.source === "MIX" ? 50 : 0,
        entryZone: opportunity.entryZone,
        invalidation: opportunity.invalidation,
        targets: opportunity.targets,
        createdAt: opportunity.createdAt,
        riskPenalty: opportunity.riskNotes?.toLowerCase().includes("incertitude") ? 8 : 0,
      });

      await prisma.opportunity.update({
        where: { id: opportunity.id },
        data: { score: scored.score },
      });
    }

    await auditLog("opportunities_scored", `Scored ${opportunities.length} open opportunities`, {
      count: opportunities.length,
    });
  },
  { connection: getRedisConnection(), concurrency: 1 },
);

worker.on("failed", async (job, error) => {
  await auditLog("worker_error", "Scoring worker failed", {
    jobId: job?.id ?? null,
    error: error.message,
  });
});

console.log("Opportunity scoring worker started. Scheduled every 30 minutes.");
