type ScoreInput = {
  hasTradingView: boolean;
  hasIvtNotification: boolean;
  coherentNewsScore?: number | null;
  entryZone?: string | null;
  invalidation?: string | null;
  targets?: unknown;
  createdAt?: Date;
  riskPenalty?: number;
};

function hasTargets(value: unknown) {
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

export function scoreOpportunity(input: ScoreInput) {
  let score = 0;
  const reasons: string[] = [];

  if (input.hasTradingView && input.hasIvtNotification) {
    score += 30;
    reasons.push("Confluence TradingView + notification IVT.");
  }

  if ((input.coherentNewsScore ?? 0) > 0) {
    const points = Math.min(15, Math.max(0, Math.round((input.coherentNewsScore ?? 0) * 0.15)));
    score += points;
    reasons.push("Contexte news coherent.");
  }

  if (input.entryZone) {
    score += 15;
    reasons.push("Zone claire.");
  }

  if (input.invalidation) {
    score += 15;
    reasons.push("Invalidation claire.");
  }

  if (hasTargets(input.targets)) {
    score += 10;
    reasons.push("Objectifs theoriques clairs.");
  }

  const ageHours = input.createdAt ? (Date.now() - input.createdAt.getTime()) / 3_600_000 : 0;
  if (ageHours <= 24) {
    score += 10;
    reasons.push("Donnees recentes.");
  } else if (ageHours <= 72) {
    score += 5;
    reasons.push("Donnees encore exploitables.");
  }

  const penalty = Math.min(20, Math.max(0, input.riskPenalty ?? 0));
  score -= penalty;
  if (penalty) reasons.push(`Malus risque/incertitude: -${penalty}.`);

  return {
    score: Math.max(0, Math.min(100, score)),
    reasons,
  };
}
