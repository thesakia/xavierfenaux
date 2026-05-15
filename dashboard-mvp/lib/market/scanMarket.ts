import { Direction, OpportunitySource, OpportunityStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { auditLog } from "@/lib/db/audit";
import { defaultUniverse, extractSymbolsFromText, findAssetDefinition } from "@/lib/market/universe";
import { defaultQuoteUniverse, getMarketQuotes } from "@/lib/market/priceProvider";
import { parseNotificationsBatch } from "@/lib/market/notificationParser";
import { scoreOpportunity } from "@/lib/scoring/scoreOpportunity";

type ScanInput = {
  brief?: string;
  notifications?: string;
  triggerOpenAI?: boolean;
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
  const definition = findAssetDefinition(symbol);
  const aliases = [symbol, ...(definition?.aliases ?? [])].map((item) => item.toUpperCase());
  return news.filter((item) => {
    const text = `${item.title} ${item.summary ?? ""}`.toUpperCase();
    const assets = Array.isArray(item.relatedAssets) ? item.relatedAssets.map(String).join(" ").toUpperCase() : "";
    return aliases.some((alias) => text.includes(alias) || assets.includes(alias));
  });
}

function priorityFromScore(score: number) {
  if (score >= 75) return 1;
  if (score >= 50) return 2;
  return 3;
}

export async function scanMarket(input: ScanInput) {
  const allowOpenAI = process.env.ENABLE_OPENAI_MARKET_SCAN === "true" && input.triggerOpenAI === true;
  const parsedNotifications = input.notifications ? parseNotificationsBatch(input.notifications) : [];
  const briefSymbols = input.brief ? extractSymbolsFromText(input.brief) : [];
  const notificationSymbols = parsedNotifications.flatMap((item) => (item.symbol ? [item.symbol] : []));

  const watchedAssets = await prisma.watchedAsset.findMany();
  const symbols = Array.from(
    new Set([
      ...defaultQuoteUniverse(),
      ...watchedAssets.map((asset) => asset.symbol),
      ...briefSymbols,
      ...notificationSymbols,
    ]),
  );

  const quotes = await getMarketQuotes(symbols);
  const recentNews = await prisma.marketNews.findMany({ orderBy: { publishedAt: "desc" }, take: 80 });
  const run = await prisma.marketScanRun.create({
    data: {
      status: "running",
      usedOpenAI: allowOpenAI,
      summary: "Scan marche lance.",
    },
  });

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

  const createdRadarItems = [];
  let createdOpportunities = 0;

  for (const symbol of symbols) {
    const definition = findAssetDefinition(symbol) ?? defaultUniverse.find((asset) => asset.symbol === symbol);
    const quote = quotes.find((item) => item.symbol === symbol);
    const watched = watchedAssets.find((asset) => asset.symbol === symbol);
    const notification = parsedNotifications.find((item) => item.symbol === symbol);
    const news = symbolNewsContext(symbol, recentNews);
    const zone = notification?.zone ?? watched?.shortZone ?? watched?.mediumZone ?? watched?.longZone ?? null;
    const invalidation = notification?.invalidation ?? watched?.invalidation ?? null;
    const targets = notification?.targets.length ? notification.targets : Array.isArray(watched?.targets) ? watched?.targets.map(String) : [];
    const proximity = proximityPct(quote?.price, zone);
    const reasons = [];
    const missingData = [];

    if (news.length) reasons.push(`${news.length} news liee(s) a l'actif.`);
    if (notification) reasons.push("Notification Xavier / IVT detectee.");
    if (zone) reasons.push("Zone connue.");
    else missingData.push("zone");
    if (invalidation) reasons.push("Invalidation connue.");
    else missingData.push("invalidation");
    if (targets.length) reasons.push("Objectifs theoriques connus.");
    else missingData.push("objectifs");
    if (proximity !== null && proximity <= 2) reasons.push("Prix a moins de 2% d'une zone.");
    if (Math.abs(quote?.variationPct ?? 0) >= 1) reasons.push("Variation jour significative.");

    let score = 0;
    if (news.length) score += Math.min(20, news.length * 8);
    if (notification) score += 25;
    if (zone) score += 15;
    if (invalidation) score += 15;
    if (targets.length) score += 10;
    if (proximity !== null && proximity <= 2) score += 15;
    if (!invalidation) score -= 10;
    score = Math.max(0, Math.min(100, score));

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
        macroNotes: news[0]?.summary ?? watched?.macroNotes,
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
        macroNotes: news[0]?.summary,
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
        priority: priorityFromScore(score),
        score,
        status: score >= 65 && zone && invalidation ? "setup_candidate" : score >= 35 ? "context" : "watch_only",
        knownZone: zone,
        zoneProximityPct: proximity,
        invalidation,
        targets,
        newsContext: news[0]?.summary ?? news[0]?.title,
        xavierContext: notification?.extractedSummary,
        briefContext: input.brief && extractSymbolsFromText(input.brief).includes(symbol) ? input.brief.slice(0, 800) : null,
        reasons,
        missingData,
        riskNotes: invalidation ? "Risque encadre par une invalidation connue." : "Risque incomplet: invalidation manquante.",
        sources: {
          quote: quote?.source ?? "none",
          news: news.slice(0, 5).map((item) => ({ title: item.title, source: item.source, url: item.url })),
          notification: notification?.rawText ?? null,
          openAI: allowOpenAI,
        },
      },
    });
    createdRadarItems.push(radarItem);

    if (score >= 65 && zone && invalidation && targets.length) {
      const scored = scoreOpportunity({
        hasTradingView: false,
        hasIvtNotification: Boolean(notification),
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
          summary: `${definition?.assetName ?? symbol}: convergence detectee entre contexte marche, donnees suivies et informations Xavier / IVT.`,
          riskNotes: invalidation ? "Scenario a surveiller avec invalidation definie." : "Invalidation manquante.",
          aiReasoningSummary: reasons.join(" "),
        },
      });
      createdOpportunities += 1;
    }
  }

  await prisma.marketScanRun.update({
    where: { id: run.id },
    data: {
      status: "completed",
      summary: `${createdRadarItems.length} actifs analyses, ${createdOpportunities} setup(s) a surveiller cree(s).`,
      createdRadarItems: createdRadarItems.length,
      createdOpportunities,
    },
  });

  await auditLog("market_scan_completed", "Market scan completed", {
    scanRunId: run.id,
    createdRadarItems: createdRadarItems.length,
    createdOpportunities,
    usedOpenAI: allowOpenAI,
  });

  return {
    scanRunId: run.id,
    createdRadarItems: createdRadarItems.length,
    createdOpportunities,
    usedOpenAI: allowOpenAI,
  };
}
