import { Prisma } from "@prisma/client";
import { analyzeMarketNews } from "@/lib/agents/marketAgent";
import { auditLog } from "@/lib/db/audit";
import { prisma } from "@/lib/db/prisma";
import { getNewsProvider } from "@/lib/news/providers";

export async function scanNewsNow() {
  const provider = getNewsProvider();
  const items = await provider.scan();
  const stored = [];

  for (const item of items) {
    const context = await analyzeMarketNews({
      title: item.title,
      source: item.source,
      url: item.url,
      publishedAt: item.publishedAt.toISOString(),
      summary: item.summary,
    });

    try {
      const news = await prisma.marketNews.create({
        data: {
          title: item.title,
          source: item.source,
          url: item.url,
          publishedAt: item.publishedAt,
          summary: context.summary || item.summary,
          relatedAssets: context.relatedAssets,
          importanceScore: context.importanceScore,
          category: context.category,
        },
      });

      await prisma.marketContext.create({
        data: {
          title: context.title,
          summary: context.summary,
          relatedAssets: context.relatedAssets,
          category: context.category,
          importanceScore: context.importanceScore,
        },
      });

      stored.push(news);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        continue;
      }
      throw error;
    }
  }

  await auditLog("news_scanned", `News scan stored ${stored.length} item(s)`, { count: stored.length });
  return stored;
}
