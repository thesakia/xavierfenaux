import { prisma } from "@/lib/db/prisma";
import { extractSymbolsFromText, findAssetDefinition } from "@/lib/market/universe";

export type PrepMemoryKind = "brief" | "xavier_import" | "xavier_method" | "market_scan";

type PrepMemoryInput = {
  kind: PrepMemoryKind;
  rawText?: string | null;
  relatedAssets?: string[];
  summary?: string | null;
};

function cleanText(rawText: string) {
  return rawText.replace(/\s+/g, " ").trim();
}

export function summarizePrepText(rawText: string) {
  const cleaned = cleanText(rawText);
  if (cleaned.length <= 420) return cleaned;
  return `${cleaned.slice(0, 420)}...`;
}

export function uniqueSymbolsFromText(rawText?: string | null) {
  if (!rawText?.trim()) return [];
  return Array.from(new Set(extractSymbolsFromText(rawText)));
}

export async function storePrepMemory(input: PrepMemoryInput) {
  const rawText = input.rawText?.trim();
  if (!rawText) return null;

  const extractedAssets = input.kind === "xavier_method" ? [] : uniqueSymbolsFromText(rawText);
  const relatedAssets = Array.from(new Set([...(input.relatedAssets ?? []), ...extractedAssets]));

  return prisma.marketPrepMemory.create({
    data: {
      kind: input.kind,
      rawText,
      summary: input.summary ?? summarizePrepText(rawText),
      relatedAssets,
    },
  });
}

export async function getRecentPrepMemory(limit = 30) {
  return prisma.marketPrepMemory.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export function prepMemoryForSymbol(
  symbol: string,
  memories: Awaited<ReturnType<typeof getRecentPrepMemory>>,
) {
  const definition = findAssetDefinition(symbol);
  const aliases = [symbol, ...(definition?.aliases ?? [])].map((item) => item.toUpperCase());

  return memories.filter((memory) => {
    const assets = Array.isArray(memory.relatedAssets) ? memory.relatedAssets.map(String).join(" ").toUpperCase() : "";
    const text = `${memory.rawText} ${memory.summary ?? ""}`.toUpperCase();
    return aliases.some((alias) => assets.includes(alias) || text.includes(alias));
  });
}
