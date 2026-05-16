import { Direction, OpportunitySource } from "@prisma/client";
import { compliantVocabularyInstruction } from "@/lib/agents/compliance";
import { getStrongModel, runJsonAgent } from "@/lib/agents/openaiClient";
import type { ExtractedNotification, OpportunityCandidate } from "@/lib/agents/types";

function normalizeDirection(raw: string | null | undefined): Direction {
  const text = (raw ?? "").toLowerCase();
  if (text.includes("short") || text.includes("baiss") || text.includes("vendeur")) return Direction.SHORT;
  if (text.includes("long") || text.includes("hauss") || text.includes("acheteur")) return Direction.LONG;
  return Direction.NEUTRAL;
}

function extractTargets(text: string) {
  const targets = Array.from(text.matchAll(/TP\s*\d*\s*[:=]?\s*([0-9]+(?:[.,][0-9]+)?)/gi)).map((match) =>
    match[1].replace(",", "."),
  );
  return targets.length ? targets : Array.from(text.matchAll(/objectif\w*\s*[:=]?\s*([0-9]+(?:[.,][0-9]+)?)/gi)).map(
    (match) => match[1].replace(",", "."),
  );
}

export function fallbackExtractNotification(rawText: string): ExtractedNotification {
  const symbolMatch = rawText.match(/^([^:,-]+)/);
  const zoneMatch = rawText.match(/zone\s+([0-9.,/ -]+)/i);
  const invalidationMatch = rawText.match(/invalidation\s+([0-9.,/ -]+)/i);
  const timeframeMatch = rawText.match(/\b(1m|5m|15m|30m|1h|2h|4h|daily|weekly|mensuel)\b/i);
  const targets = extractTargets(rawText);

  return {
    symbol: symbolMatch?.[1]?.trim().toUpperCase() ?? null,
    assetName: symbolMatch?.[1]?.trim() ?? null,
    direction: normalizeDirection(rawText),
    timeframe: timeframeMatch?.[1] ?? null,
    zone: zoneMatch?.[1]?.trim() ?? null,
    invalidation: invalidationMatch?.[1]?.trim() ?? null,
    targets,
    confidenceLevel: zoneMatch && invalidationMatch ? 70 : 45,
    riskNotes: invalidationMatch ? "Risque encadre par une invalidation explicite." : "Incertitude elevee: invalidation absente.",
    extractedSummary: rawText,
  };
}

export async function extractXavierNotification(rawText: string): Promise<ExtractedNotification> {
  const result = await runJsonAgent<ExtractedNotification>({
    agent: "setupAgent.extractNotification",
    model: getStrongModel(),
    system: `${compliantVocabularyInstruction}
Mission:
- extraire actif, biais, zone, invalidation, objectifs, timeframe, niveau de confiance, notes de risque, resume exploitable
- ne rien inventer
- si un champ manque, retourner null ou une liste vide
- direction doit etre LONG, SHORT ou NEUTRAL
- retourner un JSON strict`,
    user: rawText,
  });

  const fallback = fallbackExtractNotification(rawText);
  if (!result) return fallback;

  return {
    symbol: result.symbol || fallback.symbol,
    assetName: result.assetName || fallback.assetName,
    direction: Object.values(Direction).includes(result.direction) ? result.direction : fallback.direction,
    timeframe: result.timeframe || fallback.timeframe,
    zone: result.zone || fallback.zone,
    invalidation: result.invalidation || fallback.invalidation,
    targets: Array.isArray(result.targets) ? result.targets : fallback.targets,
    confidenceLevel: Math.max(0, Math.min(100, Number(result.confidenceLevel ?? fallback.confidenceLevel))),
    riskNotes: result.riskNotes || fallback.riskNotes,
    extractedSummary: result.extractedSummary || fallback.extractedSummary,
  };
}

export async function buildOpportunityCandidate(input: unknown): Promise<OpportunityCandidate> {
  const result = await runJsonAgent<OpportunityCandidate>({
    agent: "setupAgent.buildOpportunity",
    model: getStrongModel(),
    system: `${compliantVocabularyInstruction}
Mission:
- croiser alertes TradingView, notifications IVT et contexte news
- générer une opportunité candidate seulement si la convergence est claire
- refuser si les données sont insuffisantes
- retourner un JSON strict avec accepted, refusalReason, symbol, assetName, direction, entryZone, invalidation, targets, source, summary, riskNotes, aiReasoningSummary`,
    user: JSON.stringify(input),
  });

  if (!result) {
    return { accepted: false, refusalReason: "Analyse IA indisponible ou donnees insuffisantes." };
  }

  if (!result.accepted) return result;
  if (!result.symbol || !result.entryZone || !result.invalidation || !result.targets?.length) {
    return { accepted: false, refusalReason: "Données insuffisantes pour créer un setup à surveiller." };
  }

  return {
    ...result,
    direction: result.direction && Object.values(Direction).includes(result.direction) ? result.direction : Direction.NEUTRAL,
    source: result.source && Object.values(OpportunitySource).includes(result.source) ? result.source : OpportunitySource.MIX,
  };
}
