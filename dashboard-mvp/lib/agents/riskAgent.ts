import { compliantVocabularyInstruction, containsNonCompliantVocabulary, sanitizeDashboardLanguage } from "@/lib/agents/compliance";
import { getLightModel, runJsonAgent } from "@/lib/agents/openaiClient";
import type { OpportunityCandidate } from "@/lib/agents/types";

type RiskReview = {
  accepted: boolean;
  riskNotes: string;
  summary: string;
  aiReasoningSummary: string;
};

export async function reviewOpportunityRisk(candidate: OpportunityCandidate): Promise<OpportunityCandidate> {
  if (!candidate.accepted) return candidate;

  if (!candidate.invalidation) {
    return {
      accepted: false,
      refusalReason: "Invalidation absente: le scenario n'est pas assez clair.",
    };
  }

  const review = await runJsonAgent<RiskReview>({
    agent: "riskAgent",
    model: getLightModel(),
    system: `${compliantVocabularyInstruction}
Mission:
- verifier que l'invalidation existe
- verifier que le scenario est clair
- corriger le vocabulaire si necessaire
- ajouter un avertissement si le risque ou l'incertitude est important
- retourner un JSON strict avec accepted, riskNotes, summary, aiReasoningSummary`,
    user: JSON.stringify(candidate),
  });

  const summary = sanitizeDashboardLanguage(review?.summary || candidate.summary || "");
  const riskNotes = sanitizeDashboardLanguage(review?.riskNotes || candidate.riskNotes || "");
  const aiReasoningSummary = sanitizeDashboardLanguage(review?.aiReasoningSummary || candidate.aiReasoningSummary || "");

  if (containsNonCompliantVocabulary(`${summary} ${riskNotes} ${aiReasoningSummary}`)) {
    return {
      ...candidate,
      summary: sanitizeDashboardLanguage(summary),
      riskNotes: sanitizeDashboardLanguage(riskNotes),
      aiReasoningSummary: sanitizeDashboardLanguage(aiReasoningSummary),
    };
  }

  return {
    ...candidate,
    accepted: review?.accepted ?? true,
    summary,
    riskNotes,
    aiReasoningSummary,
  };
}
