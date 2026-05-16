import { Direction, OpportunitySource, OpportunityStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { auditLog } from "@/lib/db/audit";
import { assetMatchesText, defaultUniverse, extractSymbolsFromText, findAssetDefinition } from "@/lib/market/universe";
import { defaultQuoteUniverse, getMarketQuotes } from "@/lib/market/priceProvider";
import { parseNotificationsBatch } from "@/lib/market/notificationParser";
import { getRecentPrepMemory, prepMemoryForSymbol, storePrepMemory } from "@/lib/market/prepMemory";
import { scoreOpportunity } from "@/lib/scoring/scoreOpportunity";
import { reviewWithXavierMethod } from "@/lib/agents/xavierMethodAgent";
import { reviewCoherence } from "@/lib/agents/coherenceAgent";

type ScanInput = {
  brief?: string;
  notifications?: string;
  methodContext?: string;
  triggerOpenAI?: boolean;
  useXavierAssetMemory?: boolean;
};

function parseZone(zone?: string | null) {
  const numbers = zone?.match(/\d+(?:[.,]\d+)?/g)?.map((item) => Number(item.replace(",", "."))) ?? [];
  if (!numbers.length) return null;
  return { low: Math.min(...numbers), high: Math.max(...numbers) };
}

function proximityPct(price?: number | null, zone?: string | null) {
  const parsed = parseZone(zone);
  if (!price || !parsed) return null;
  return Math.min(Math.abs(price - parsed.low), Math.abs(price - parsed.high)) / price * 100;
}

function symbolNewsContext(symbol: string, news: Awaited<ReturnType<typeof prisma.marketNews.findMany>>) {
  return news.filter((item) => {
    const text = `${item.title} ${item.summary ?? ""}`;
    const assets = Array.isArray(item.relatedAssets) ? item.relatedAssets.map(String) : [];
    return assets.includes(symbol) || assetMatchesText(symbol, text);
  });
}

function priorityFromScore(score: number) {
  if (score >= 75) return 1;
  if (score >= 50) return 2;
  return 3;
}

function briefContextForSymbol(symbol: string, brief?: string | null) {
  if (!brief?.trim()) return null;
  const blocks = brief
    .split(/\n\s*\n/)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return blocks.find((block) => assetMatchesText(symbol, block))?.slice(0, 700) ?? null;
}

function formatVariation(value?: number | null) {
  if (!Number.isFinite(value ?? NaN)) return null;
  const number = Number(value);
  return `${number > 0 ? "+" : ""}${number.toFixed(2)}%`;
}

function learnedXavierContext(memories: Awaited<ReturnType<typeof getRecentPrepMemory>>) {
  const examples = memories
    .filter((memory) => memory.kind === "xavier_import")
    .slice(0, 20)
    .map((memory, index) => `${index + 1}. ${memory.summary ?? memory.rawText}`)
    .join("\n");

  if (!examples) return null;

  return [
    "Exemples historiques Xavier a utiliser uniquement pour ajuster le filtre interne.",
    "Ne pas utiliser les actifs cites dans ces exemples comme candidats du radar.",
    examples,
  ].join("\n");
}

export async function scanMarket(input: ScanInput) {
  const allowOpenAI = process.env.ENABLE_OPENAI_MARKET_SCAN === "true" && input.triggerOpenAI === true;
  const useXavierAssetMemory = input.useXavierAssetMemory === true;
  const parsedNotifications = input.notifications ? parseNotificationsBatch(input.notifications) : [];
  const briefSymbols = input.brief ? extractSymbolsFromText(input.brief) : [];
  const notificationSymbols = useXavierAssetMemory ? parsedNotifications.flatMap((item) => (item.symbol ? [item.symbol] : [])) : [];

  await storePrepMemory({
    kind: "brief",
    rawText: input.brief,
    relatedAssets: briefSymbols,
  });

  await storePrepMemory({
    kind: "xavier_import",
    rawText: input.notifications,
    relatedAssets: useXavierAssetMemory ? notificationSymbols : [],
  });

  await storePrepMemory({
    kind: "xavier_method",
    rawText: input.methodContext,
    relatedAssets: [],
  });

  if (useXavierAssetMemory) {
    for (const parsed of parsedNotifications) {
      await prisma.xavierNotification.create({
        data: {
          rawText: parsed.rawText,
          symbol: parsed.symbol,
          assetName: parsed.assetName,
          direction: parsed.direction,
          timeframe: parsed.timeframe,
          zone: parsed.zone,
          invalidation: parsed.invalidation,
          targets: parsed.targets,
          confidenceLevel: parsed.confidenceLevel,
          riskNotes: parsed.riskNotes,
          extractedSummary: parsed.extractedSummary,
        },
      });
    }
  }

  const watchedAssets = await prisma.watchedAsset.findMany();
  const recentPrepMemory = await getRecentPrepMemory(50);
  const recentNotifications = await prisma.xavierNotification.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const memorySymbols = useXavierAssetMemory
    ? recentPrepMemory.flatMap((memory) => (Array.isArray(memory.relatedAssets) ? memory.relatedAssets.map(String) : []))
    : [];
  const historicalNotificationSymbols = useXavierAssetMemory
    ? recentNotifications.flatMap((item) => (item.symbol ? [item.symbol] : []))
    : [];
  const methodContext = input.methodContext ?? learnedXavierContext(recentPrepMemory);

  const symbols = Array.from(
    new Set([
      ...defaultQuoteUniverse(),
      ...watchedAssets.map((asset) => asset.symbol),
      ...briefSymbols,
      ...notificationSymbols,
      ...memorySymbols,
      ...historicalNotificationSymbols,
    ]),
  );

  const quotes = await getMarketQuotes(symbols);
  const recentNews = await prisma.marketNews.findMany({
    where: {
      source: {
        not: "mock",
      },
    },
    orderBy: { publishedAt: "desc" },
    take: 80,
  });
  const run = await prisma.marketScanRun.create({
    data: {
      status: "running",
      usedOpenAI: allowOpenAI,
      summary: "Scan marche lance.",
    },
  });

  const createdRadarItems = [];
  let createdOpportunities = 0;

  for (const symbol of symbols) {
    const definition = findAssetDefinition(symbol) ?? defaultUniverse.find((asset) => asset.symbol === symbol);
    const quote = quotes.find((item) => item.symbol === symbol);
    const watched = watchedAssets.find((asset) => asset.symbol === symbol);
    const currentNotification = useXavierAssetMemory ? parsedNotifications.find((item) => item.symbol === symbol) : null;
    const historicalNotification = useXavierAssetMemory ? recentNotifications.find((item) => item.symbol === symbol) : null;
    const notification = currentNotification ?? historicalNotification;
    const symbolPrepMemory = prepMemoryForSymbol(symbol, recentPrepMemory).filter(
      (memory) => memory.kind !== "xavier_method" && (useXavierAssetMemory || memory.kind !== "xavier_import"),
    );
    const briefMemory = input.brief ? null : symbolPrepMemory.find((memory) => memory.kind === "brief");
    const importMemory = useXavierAssetMemory ? symbolPrepMemory.find((memory) => memory.kind === "xavier_import") : null;
    const news = symbolNewsContext(symbol, recentNews);
    const symbolBriefContext = briefContextForSymbol(symbol, input.brief);
    const zone = notification?.zone ?? watched?.shortZone ?? watched?.mediumZone ?? watched?.longZone ?? null;
    const invalidation = notification?.invalidation ?? watched?.invalidation ?? null;
    const notificationTargets = Array.isArray(notification?.targets) ? notification.targets.map(String) : [];
    const targets = notificationTargets.length ? notificationTargets : Array.isArray(watched?.targets) ? watched?.targets.map(String) : [];
    const proximity = proximityPct(quote?.price, zone);
    const leadNews = news[0];
    const leadNewsContext = leadNews?.summary ?? leadNews?.title;
    const symbolInCurrentBrief = Boolean(symbolBriefContext);
    const reasons = [];
    const missingData = [];

    if (leadNews) {
      reasons.push(`News: ${leadNews.title}${leadNews.source ? ` (${leadNews.source})` : ""}.`);
    }
    if (news.length > 1) reasons.push(`${news.length} news recentes recoupent cet actif.`);
    if (useXavierAssetMemory && currentNotification) reasons.push("Notification Xavier / IVT ajoutee au scan.");
    else if (useXavierAssetMemory && historicalNotification) reasons.push("Memoire Xavier / IVT recente reprise.");
    if (symbolInCurrentBrief) reasons.push("Brief: actif relie au contexte marche du jour.");
    else if (briefMemory) reasons.push("Brief: actif relie a un contexte marche recent.");
    if (importMemory && !currentNotification) reasons.push("Actif deja present dans un import recent.");
    if (zone) reasons.push(`Cadre: zone connue ${zone}.`);
    else missingData.push("zone");
    if (invalidation) reasons.push(`Risque: invalidation connue ${invalidation}.`);
    else missingData.push("invalidation");
    if (targets.length) reasons.push(`Objectifs theoriques: ${targets.join(" / ")}.`);
    else missingData.push("objectifs");
    if (proximity !== null && proximity <= 2) reasons.push(`Prix: a ${proximity.toFixed(2)}% d'une zone suivie.`);
    const variation = formatVariation(quote?.variationPct);
    if (variation && Math.abs(quote?.variationPct ?? 0) >= 1) {
      reasons.push(`Reaction prix: ${definition?.assetName ?? symbol} varie de ${variation} sur le dernier cours disponible.`);
    }

    let score = 0;
    if (news.length) score += Math.min(20, news.length * 8);
    if (useXavierAssetMemory && currentNotification) score += 25;
    else if (useXavierAssetMemory && historicalNotification) score += 15;
    if (briefMemory) score += 8;
    if (importMemory && !currentNotification) score += 6;
    if (zone) score += 15;
    if (invalidation) score += 15;
    if (targets.length) score += 10;
    if (proximity !== null && proximity <= 2) score += 15;
    if (Math.abs(quote?.variationPct ?? 0) >= 1) score += 8;
    if (Math.abs(quote?.variationPct ?? 0) >= 2) score += 5;
    if (!invalidation) score -= 10;
    score = Math.max(0, Math.min(100, score));

    const methodReview = await reviewWithXavierMethod({
      symbol,
      assetName: definition?.assetName ?? symbol,
      category: definition?.category ?? "Autres",
      direction: notification?.direction ?? Direction.NEUTRAL,
      score,
      price: quote?.price,
      variationPct: quote?.variationPct,
      newsContext: leadNewsContext,
      briefContext: symbolBriefContext ?? briefMemory?.summary,
      knownZone: zone,
      invalidation,
      targets,
      methodContext,
    });
    const coherence = await reviewCoherence({
      symbol,
      assetName: definition?.assetName ?? symbol,
      category: definition?.category ?? "Autres",
      direction: notification?.direction ?? Direction.NEUTRAL,
      score,
      price: quote?.price,
      variationPct: quote?.variationPct,
      newsContext: leadNewsContext,
      briefContext: symbolBriefContext ?? briefMemory?.summary,
      knownZone: zone,
      invalidation,
      targets,
      methodContext,
      methodReview,
      reasons,
      missingData,
    });
    score = Math.max(0, Math.min(100, score + coherence.scoreAdjustment));

    if (!coherence.display) {
      continue;
    }

    await prisma.watchedAsset.upsert({
      where: { symbol },
      update: {
        assetName: definition?.assetName ?? watched?.assetName,
        category: definition?.category ?? watched?.category,
        currentPrice: quote?.price,
        variationPct: quote?.variationPct,
        shortZone: notification?.zone ?? watched?.shortZone,
        invalidation: notification?.invalidation ?? watched?.invalidation,
        targets: targets.length ? targets : Prisma.JsonNull,
        macroNotes: leadNewsContext ?? watched?.macroNotes,
        lastPriceAt: quote?.timestamp,
      },
      create: {
        symbol,
        assetName: definition?.assetName ?? symbol,
        category: definition?.category ?? "Autres",
        currentPrice: quote?.price,
        variationPct: quote?.variationPct,
        shortZone: notification?.zone,
        invalidation: notification?.invalidation,
        targets,
        macroNotes: leadNewsContext,
        lastPriceAt: quote?.timestamp,
      },
    });

    const radarItem = await prisma.generatedRadarItem.create({
      data: {
        scanRunId: run.id,
        symbol,
        assetName: definition?.assetName ?? symbol,
        category: definition?.category ?? "Autres",
        currentPrice: quote?.price,
        variationPct: quote?.variationPct,
        direction: notification?.direction ?? Direction.NEUTRAL,
        priority: coherence.priority || priorityFromScore(score),
        score,
        status: coherence.status,
        knownZone: zone,
        zoneProximityPct: proximity,
        invalidation,
        targets,
        newsContext: leadNewsContext,
        xavierContext: notification?.extractedSummary ?? importMemory?.summary,
        briefContext: symbolBriefContext ?? briefMemory?.summary,
        reasons,
        missingData,
        riskNotes: methodReview.riskNotes || (invalidation ? "Risque encadre par une invalidation connue." : "Risque incomplet: invalidation manquante."),
        sources: {
          quote: quote?.source ?? "none",
          news: news.slice(0, 5).map((item) => ({ title: item.title, source: item.source, url: item.url })),
          notification: notification?.rawText ?? null,
          prepMemory: symbolPrepMemory.slice(0, 5).map((memory) => ({
            kind: memory.kind,
            summary: memory.summary,
            createdAt: memory.createdAt,
          })),
          openAI: allowOpenAI,
          xavierMethod: methodReview.methodNotes,
          coherence: coherence.summary,
        },
      },
    });
    createdRadarItems.push(radarItem);

    if (coherence.status === "setup_candidate" && score >= 65 && zone && invalidation && targets.length) {
      const scored = scoreOpportunity({
        hasTradingView: false,
        hasIvtNotification: Boolean(currentNotification ?? historicalNotification),
        coherentNewsScore: news[0]?.importanceScore ?? 0,
        entryZone: zone,
        invalidation,
        targets,
        createdAt: new Date(),
        riskPenalty: notification?.direction === Direction.NEUTRAL ? 8 : 0,
      });

      await prisma.opportunity.create({
        data: {
          symbol,
          assetName: definition?.assetName ?? symbol,
          direction: notification?.direction ?? Direction.NEUTRAL,
          entryZone: zone,
          invalidation,
          targets,
          score: scored.score,
          status: OpportunityStatus.WATCHING,
          source: OpportunitySource.MIX,
          summary: coherence.summary,
          riskNotes: methodReview.riskNotes,
          aiReasoningSummary: [methodReview.methodNotes, ...reasons].filter(Boolean).join(" "),
        },
      });
      createdOpportunities += 1;
    }
  }

  await prisma.marketScanRun.update({
    where: { id: run.id },
    data: {
      status: "completed",
      summary: `${createdRadarItems.length} actifs analyses, ${createdOpportunities} setup(s) a surveiller cree(s). Memoire recente: ${recentPrepMemory.length} brief/import(s), ${recentNotifications.length} notification(s) Xavier / IVT.`,
      createdRadarItems: createdRadarItems.length,
      createdOpportunities,
    },
  });

  await auditLog("market_scan_completed", "Market scan completed", {
    scanRunId: run.id,
    createdRadarItems: createdRadarItems.length,
    createdOpportunities,
    usedOpenAI: allowOpenAI,
    prepMemoryItems: recentPrepMemory.length,
    xavierNotifications: recentNotifications.length,
  });

  return {
    scanRunId: run.id,
    createdRadarItems: createdRadarItems.length,
    createdOpportunities,
    usedOpenAI: allowOpenAI,
  };
}
