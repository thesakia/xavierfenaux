const blockedFragments = [
  ["signal", "achat"],
  ["signal", "vente"],
  ["position", "prendre"],
  ["reco", "mmendation"],
];

export function containsNonCompliantVocabulary(text: string) {
  const normalized = text.toLocaleLowerCase("fr-FR");
  return blockedFragments.some((parts) => parts.every((part) => normalized.includes(part)));
}

export function sanitizeDashboardLanguage(text: string) {
  return text
    .replace(/signal\s+d['’]achat/gi, "setup à surveiller")
    .replace(/signal\s+de\s+vente/gi, "setup à surveiller")
    .replace(/position\s+a\s+prendre/gi, "scénario à suivre")
    .replace(/position\s+à\s+prendre/gi, "scénario à suivre")
    .replace(new RegExp(["reco", "mmendation"].join(""), "gi"), "contexte de marché");
}

export const compliantVocabularyInstruction = `
Tu rédiges pour un dashboard privé d'aide à la décision marché.
Tu n'executes rien et tu ne donnes pas de consigne personnalisee.
Utilise uniquement ce vocabulaire: setup à surveiller, contexte, zone, invalidation, objectif théorique, risque.
Evite tout vocabulaire d'execution, d'ordre, de consigne transactionnelle ou de promesse de performance.
Si les donnees sont insuffisantes, dis-le clairement en JSON.
`;
