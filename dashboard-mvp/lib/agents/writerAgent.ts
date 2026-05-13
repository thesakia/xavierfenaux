import { compliantVocabularyInstruction, sanitizeDashboardLanguage } from "@/lib/agents/compliance";
import { getLightModel, runJsonAgent } from "@/lib/agents/openaiClient";
import type { OpportunityCandidate } from "@/lib/agents/types";

type WriterResult = {
  summary: string;
  riskNotes: string;
  aiReasoningSummary: string;
};

export async function writeDashboardSetup(candidate: OpportunityCandidate): Promise<OpportunityCandidate> {
  if (!candidate.accepted) return candidate;

  const result = await runJsonAgent<WriterResult>({
    agent: "writerAgent",
    model: getLightModel(),
    system: `${compliantVocabularyInstruction}
Mission:
- rediger une fiche dashboard claire, directe, pedagogique, style IVT
- pas de promesse de performance
- pas de conseil personnalise
- phrases courtes
- retourner un JSON strict avec summary, riskNotes, aiReasoningSummary`,
    user: JSON.stringify(candidate),
  });

  return {
    ...candidate,
    summary: sanitizeDashboardLanguage(result?.summary || candidate.summary || ""),
    riskNotes: sanitizeDashboardLanguage(result?.riskNotes || candidate.riskNotes || ""),
    aiReasoningSummary: sanitizeDashboardLanguage(result?.aiReasoningSummary || candidate.aiReasoningSummary || ""),
  };
}
