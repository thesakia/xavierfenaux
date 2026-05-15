import { prisma } from "@/lib/db/prisma";
import { requireDashboardSession } from "@/lib/auth/requireSession";
import { DashboardClient } from "@/components/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireDashboardSession();

  const opportunities = await prisma.opportunity.findMany({
    orderBy: [{ status: "asc" }, { score: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
  const latestScan = await prisma.marketScanRun.findFirst({
    orderBy: { createdAt: "desc" },
    include: {
      radarItems: {
        orderBy: [{ priority: "asc" }, { score: "desc" }],
        take: 40,
      },
    },
  });

  return (
    <DashboardClient
      latestScan={
        latestScan
          ? {
              ...latestScan,
              createdAt: latestScan.createdAt.toISOString(),
              radarItems: latestScan.radarItems.map((item) => ({
                ...item,
                createdAt: item.createdAt.toISOString(),
                updatedAt: item.updatedAt.toISOString(),
                currentPrice: item.currentPrice?.toString() ?? null,
                variationPct: item.variationPct?.toString() ?? null,
                zoneProximityPct: item.zoneProximityPct?.toString() ?? null,
              })),
            }
          : null
      }
      opportunities={opportunities.map((opportunity) => ({
        ...opportunity,
        createdAt: opportunity.createdAt.toISOString(),
        updatedAt: opportunity.updatedAt.toISOString(),
      }))}
    />
  );
}
