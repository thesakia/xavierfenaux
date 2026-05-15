import { Direction } from "@prisma/client";
import { extractSymbolsFromText, findAssetDefinition, normalizeSymbol } from "@/lib/market/universe";

export type ParsedNotificationInput = {
  rawText: string;
  symbol: string | null;
  assetName: string | null;
  direction: Direction;
  zone: string | null;
  invalidation: string | null;
  targets: string[];
  timeframe: string | null;
  confidenceLevel: number;
  riskNotes: string | null;
  extractedSummary: string;
};

function extractFirst(pattern: RegExp, text: string) {
  return text.match(pattern)?.[1]?.trim() ?? null;
}

export function parseNotificationDeterministic(rawText: string): ParsedNotificationInput {
  const symbolCandidate = extractSymbolsFromText(rawText)[0] ?? rawText.split(/[:;-]/)[0] ?? "";
  const symbol = symbolCandidate ? normalizeSymbol(symbolCandidate) : null;
  const definition = symbol ? findAssetDefinition(symbol) : null;
  const lower = rawText.toLowerCase();
  const direction = lower.includes("baiss") || lower.includes("vendeur") || lower.includes("short") || lower.includes("vends")
    ? Direction.SHORT
    : lower.includes("hauss") || lower.includes("long") || lower.includes("achat")
      ? Direction.LONG
      : Direction.NEUTRAL;

  const zone =
    extractFirst(/zone\s+([0-9.,/ -]+)/i, rawText) ??
    extractFirst(/sous\s+([0-9.,/ -]+)/i, rawText) ??
    extractFirst(/au-dessus\s+de\s+([0-9.,/ -]+)/i, rawText);
  const invalidation = extractFirst(/invalidation\s+([0-9.,/ -]+)/i, rawText) ?? extractFirst(/stop\s+([0-9.,/ -]+)/i, rawText);
  const targets = Array.from(rawText.matchAll(/(?:TP|objectif)\s*\d*\s*[:=]?\s*([0-9]+(?:[.,][0-9]+)?)/gi)).map((match) =>
    match[1].replace(",", "."),
  );
  const timeframe = extractFirst(/\b(1m|5m|15m|30m|1h|2h|4h|h1|h4|daily|weekly|mensuel)\b/i, rawText);

  return {
    rawText,
    symbol,
    assetName: definition?.assetName ?? symbol,
    direction,
    zone,
    invalidation,
    targets,
    timeframe,
    confidenceLevel: zone || invalidation ? 70 : 45,
    riskNotes: invalidation ? "Invalidation detectee dans la notification." : "Invalidation non detectee.",
    extractedSummary: rawText,
  };
}

export function parseNotificationsBatch(rawInput: string) {
  return rawInput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.toLowerCase().startsWith("symbol,"))
    .map((line) => parseNotificationDeterministic(line));
}
