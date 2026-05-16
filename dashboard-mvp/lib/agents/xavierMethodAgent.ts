import { getLightModel, runJsonAgent } from "@/lib/agents/openaiClient";
import { compliantVocabularyInstruction, sanitizeDashboardLanguage } from "@/lib/agents/compliance";
import type { XavierMethodReview, XavierMethodReviewInput } from "@/lib/agents/types";

function fallbackReview(input: XavierMethodReviewInput): XavierMethodReview {
  const hasMarketDriver = Boolean(input.newsContext?.trim() || input.briefContext?.trim());
  const hasRiskFrame = Boolean(input.invalidation?.trim());
  const hasZone = Boolean(input.knownZone?.trim());
  const hasTargets = input.targets.length > 0;
  const isMoving = Math.abs(input.variationPct ?? 0) >= 1;

  let scoreAdjustment = 0;
  if (hasMarketDriver) scoreAdjustment += 8;
  if (hasRiskFrame) scoreAdjustment += 6;
  if (hasZone) scoreAdjustment += 4;
  if (hasTargets) scoreAdjustment += 3;
  if (isMoving) scoreAdjustment += 3;
  if (!hasMarketDriver) scoreAdjustment -= 12;
  if (!hasRiskFrame) scoreAdjustment -= 8;

  const passesMethod = hasMarketDriver && (hasRiskFrame || hasZone || isMoving);
  const methodNotes = passesMethod
    ? "Contexte exploitable avec driver marché et cadre de risque à vérifier avant action."
    : "Ne remonte pas assez selon la méthode: il manque un driver marché ou un cadre de risque clair.";

  return {
    scoreAdjustment,
    passesMethod,
    methodNotes,
    riskNotes: hasRiskFrame ? "Invalidation ou niveau de risque présent." : "Risque incomplet: invalidation à définir.",
  };
}

export async function reviewWithXavierMethod(input: XavierMethodReviewInput): Promise<XavierMethodReview> {
  const fallback = fallbackReview(input);

  if (process.env.ENABLE_OPENAI_MARKET_SCAN !== "true") {
    return fallback;
  }

  const result = await runJsonAgent<XavierMethodReview>({
    agent: "xavierMethodAgent",
    model: getLightModel(),
    system: `${compliantVocabularyInstruction}
Mission:
- appliquer la méthode d'action de Xavier comme filtre, sans utiliser ses notifications pour choisir un actif
- vérifier driver d'actualité, réaction du prix, zone, invalidation, objectifs théoriques et risque
- ne jamais remonter un actif uniquement parce qu'il a été cité dans une note Xavier
- retourner un JSON strict avec scoreAdjustment, passesMethod, methodNotes, riskNotes`,
    user: JSON.stringify(input),
  });

  if (!result) return fallback;

  return {
    scoreAdjustment: Math.max(-25, Math.min(25, Number(result.scoreAdjustment ?? fallback.scoreAdjustment))),
    passesMethod: Boolean(result.passesMethod),
    methodNotes: sanitizeDashboardLanguage(result.methodNotes || fallback.methodNotes),
    riskNotes: sanitizeDashboardLanguage(result.riskNotes || fallback.riskNotes),
  };
}
