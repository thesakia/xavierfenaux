import { NewsCategory } from "@prisma/client";
import { getLightModel, runJsonAgent } from "@/lib/agents/openaiClient";
import { compliantVocabularyInstruction } from "@/lib/agents/compliance";
import type { MarketContextResult, MarketNewsInput } from "@/lib/agents/types";

function fallbackContext(news: MarketNewsInput): MarketContextResult {
  const text = `${news.title} ${news.summary ?? ""}`.toUpperCase();
  const assets = ["BTC", "ETH", "CAC", "DAX", "NASDAQ", "SP500", "GOLD", "OIL"].filter((asset) =>
    text.includes(asset),
  );

  return {
    title: news.title,
    summary: news.summary || news.title,
    relatedAssets: assets,
    category: NewsCategory.OTHER,
    importanceScore: 45,
  };
}

export async function analyzeMarketNews(news: MarketNewsInput): Promise<MarketContextResult> {
  const result = await runJsonAgent<MarketContextResult>({
    agent: "marketAgent",
    model: getLightModel(),
    system: `${compliantVocabularyInstruction}
Mission:
- resumer les actualites marche sans inventer de donnees
- identifier les actifs concernes
- classer en MACRO, SENTIMENT, RISK, TECHNICAL ou OTHER
- retourner un JSON strict avec title, summary, relatedAssets, category, importanceScore`,
    user: JSON.stringify(news),
  });

  if (!result) return fallbackContext(news);

  return {
    title: result.title || news.title,
    summary: result.summary || news.summary || news.title,
    relatedAssets: Array.isArray(result.relatedAssets) ? result.relatedAssets : [],
    category: Object.values(NewsCategory).includes(result.category) ? result.category : NewsCategory.OTHER,
    importanceScore: Math.max(0, Math.min(100, Number(result.importanceScore ?? 50))),
  };
}
