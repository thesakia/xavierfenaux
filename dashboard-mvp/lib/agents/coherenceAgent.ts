import { getLightModel, runJsonAgent } from "@/lib/agents/openaiClient";
import { compliantVocabularyInstruction, sanitizeDashboardLanguage } from "@/lib/agents/compliance";
import type { CoherenceReview, CoherenceReviewInput } from "@/lib/agents/types";

function fallbackCoherence(input: CoherenceReviewInput): CoherenceReview {
  const hasNewsOrBrief = Boolean(input.newsContext?.trim() || input.briefContext?.trim());
  const hasRiskFrame = Boolean(input.invalidation?.trim());
  const hasZone = Boolean(input.knownZone?.trim());
  const hasTargets = input.targets.length > 0;
  const score = input.score + input.methodReview.scoreAdjustment;
  const driver = input.newsContext?.trim() || input.briefContext?.trim();
  const summary = driver
    ? `${input.assetName ?? input.symbol}: ${driver.replace(/\s+/g, " ").slice(0, 220)}`
    : `${input.assetName ?? input.symbol}: contexte insuffisant.`;

  if (!hasNewsOrBrief) {
    return {
      display: false,
      status: "watch_only",
      priority: 3,
      scoreAdjustment: -20,
      summary: `${input.assetName ?? input.symbol}: pas de driver news ou brief assez clair pour le radar du jour.`,
      refusalReason: "Actif non retenu: sélection non justifiée par les news du jour ou de la veille.",
    };
  }

  if (input.methodReview.passesMethod && score >= 65 && hasZone && hasRiskFrame && hasTargets) {
    return {
      display: true,
      status: "setup_candidate",
      priority: 1,
      scoreAdjustment: input.methodReview.scoreAdjustment,
      summary,
    };
  }

  return {
    display: true,
    status: "context",
    priority: score >= 50 ? 2 : 3,
    scoreAdjustment: input.methodReview.scoreAdjustment,
    summary,
  };
}

export async function reviewCoherence(input: CoherenceReviewInput): Promise<CoherenceReview> {
  const fallback = fallbackCoherence(input);

  if (process.env.ENABLE_OPENAI_MARKET_SCAN !== "true") {
    return fallback;
  }

  const result = await runJsonAgent<CoherenceReview>({
    agent: "coherenceAgent",
    model: getLightModel(),
    system: `${compliantVocabularyInstruction}
Mission:
- recouper news, réaction des cours et méthode Xavier
- decider si l'actif merite d'apparaitre dans le radar du jour
- refuser si l'actif est seulement cité dans une note Xavier sans driver news ou réaction cohérente
- status doit etre setup_candidate, context ou watch_only
- retourner un JSON strict avec display, status, priority, scoreAdjustment, summary, refusalReason`,
    user: JSON.stringify(input),
  });

  if (!result) return fallback;

  const status = ["setup_candidate", "context", "watch_only"].includes(result.status) ? result.status : fallback.status;

  return {
    display: Boolean(result.display),
    status,
    priority: Math.max(1, Math.min(3, Number(result.priority ?? fallback.priority))),
    scoreAdjustment: Math.max(-30, Math.min(30, Number(result.scoreAdjustment ?? fallback.scoreAdjustment))),
    summary: sanitizeDashboardLanguage(result.summary || fallback.summary),
    refusalReason: result.refusalReason ? sanitizeDashboardLanguage(result.refusalReason) : fallback.refusalReason,
  };
}
