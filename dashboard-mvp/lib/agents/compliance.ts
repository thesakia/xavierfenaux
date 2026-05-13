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
    .replace(/signal\s+d['’]achat/gi, "setup a surveiller")
    .replace(/signal\s+de\s+vente/gi, "setup a surveiller")
    .replace(/position\s+a\s+prendre/gi, "scenario a suivre")
    .replace(/position\s+à\s+prendre/gi, "scenario a suivre")
    .replace(new RegExp(["reco", "mmendation"].join(""), "gi"), "contexte de marche");
}

export const compliantVocabularyInstruction = `
Tu rediges pour un dashboard prive d'aide a la decision marche.
Tu n'executes rien et tu ne donnes pas de consigne personnalisee.
Utilise uniquement ce vocabulaire: setup a surveiller, contexte, zone, invalidation, objectif theorique, risque.
Evite tout vocabulaire d'execution, d'ordre, de consigne transactionnelle ou de promesse de performance.
Si les donnees sont insuffisantes, dis-le clairement en JSON.
`;
