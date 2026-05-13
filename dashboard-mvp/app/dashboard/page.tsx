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

  return (
    <DashboardClient
      opportunities={opportunities.map((opportunity) => ({
        ...opportunity,
        createdAt: opportunity.createdAt.toISOString(),
        updatedAt: opportunity.updatedAt.toISOString(),
      }))}
    />
  );
}
