import { Direction, OpportunitySource, OpportunityStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { auditLog } from "@/lib/db/audit";
import { buildOpportunityCandidate } from "@/lib/agents/setupAgent";
import { reviewOpportunityRisk } from "@/lib/agents/riskAgent";
import { writeDashboardSetup } from "@/lib/agents/writerAgent";
import { scoreOpportunity } from "@/lib/scoring/scoreOpportunity";
import type { OpportunityCandidate } from "@/lib/agents/types";

function riskPenalty(notes?: string | null) {
  const text = (notes ?? "").toLowerCase();
  if (text.includes("incertitude elevee") || text.includes("absence")) return 15;
  if (text.includes("incertitude")) return 8;
  return 0;
}

async function latestContext(symbol?: string | null) {
  const normalized = symbol?.toUpperCase();
  const [news, contexts] = await Promise.all([
    prisma.marketNews.findMany({ orderBy: { publishedAt: "desc" }, take: 10 }),
    prisma.marketContext.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  const matchingNews = news.filter((item) => {
    const assets = Array.isArray(item.relatedAssets) ? item.relatedAssets.map(String) : [];
    return normalized ? assets.some((asset) => asset.toUpperCase().includes(normalized)) : true;
  });

  const matchingContexts = contexts.filter((item) => {
    const assets = Array.isArray(item.relatedAssets) ? item.relatedAssets.map(String) : [];
    return normalized ? assets.some((asset) => asset.toUpperCase().includes(normalized)) : true;
  });

  return {
    news: matchingNews.length ? matchingNews : news.slice(0, 3),
    contexts: matchingContexts.length ? matchingContexts : contexts.slice(0, 3),
  };
}

async function persistCandidate(
  candidate: OpportunityCandidate,
  scoreInput: Parameters<typeof scoreOpportunity>[0],
) {
  if (!candidate.accepted) return null;

  const scored = scoreOpportunity(scoreInput);

  const opportunity = await prisma.opportunity.create({
    data: {
      symbol: candidate.symbol!,
      assetName: candidate.assetName,
      direction: candidate.direction ?? Direction.NEUTRAL,
      entryZone: candidate.entryZone!,
      invalidation: candidate.invalidation!,
      targets: candidate.targets ?? [],
      score: scored.score,
      status: OpportunityStatus.WATCHING,
      source: candidate.source ?? OpportunitySource.MIX,
      summary: candidate.summary || "Setup à surveiller. Contexte à confirmer.",
      riskNotes: candidate.riskNotes,
      aiReasoningSummary: candidate.aiReasoningSummary || scored.reasons.join(" "),
    },
  });

  await auditLog("opportunity_created", `Opportunity created for ${opportunity.symbol}`, {
    opportunityId: opportunity.id,
    score: opportunity.score,
    reasons: scored.reasons,
  });

  return opportunity;
}

export async function createOpportunityFromTradingViewAlert(alertId: string) {
  const alert = await prisma.tradingViewAlert.findUnique({ where: { id: alertId } });
  if (!alert) return null;

  const notification = await prisma.xavierNotification.findFirst({
    where: {
      OR: [{ symbol: alert.symbol }, { assetName: { contains: alert.symbol, mode: "insensitive" } }],
      createdAt: { gte: new Date(Date.now() - 72 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
  });
  const context = await latestContext(alert.symbol);

  let candidate = await buildOpportunityCandidate({ alert, notification, context });

  if (!candidate.accepted && notification?.zone && notification.invalidation && notification.targets) {
    candidate = {
      accepted: true,
      symbol: alert.symbol,
      assetName: notification.assetName,
      direction: notification.direction,
      entryZone: notification.zone,
      invalidation: notification.invalidation,
      targets: Array.isArray(notification.targets) ? notification.targets.map(String) : [],
      source: OpportunitySource.MIX,
      summary: notification.extractedSummary || alert.message || "Setup à surveiller.",
      riskNotes: notification.riskNotes,
      aiReasoningSummary: "Convergence entre une alerte TradingView récente et une notification IVT structurée.",
    };
  }

  candidate = await reviewOpportunityRisk(candidate);
  candidate = await writeDashboardSetup(candidate);

  const newsScore = context.news[0]?.importanceScore ?? context.contexts[0]?.importanceScore ?? 0;
  const opportunity = await persistCandidate(candidate, {
    hasTradingView: true,
    hasIvtNotification: Boolean(notification),
    coherentNewsScore: newsScore,
    entryZone: candidate.entryZone,
    invalidation: candidate.invalidation,
    targets: candidate.targets,
    createdAt: alert.createdAt,
    riskPenalty: riskPenalty(candidate.riskNotes),
  });

  await prisma.tradingViewAlert.update({
    where: { id: alert.id },
    data: { processed: true },
  });

  return opportunity;
}

export async function createOpportunityFromNotification(notificationId: string) {
  const notification = await prisma.xavierNotification.findUnique({ where: { id: notificationId } });
  if (!notification?.symbol || !notification.zone || !notification.invalidation || !notification.targets) {
    return null;
  }

  const alert = await prisma.tradingViewAlert.findFirst({
    where: {
      symbol: notification.symbol,
      createdAt: { gte: new Date(Date.now() - 72 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
  });
  const context = await latestContext(notification.symbol);

  let candidate: OpportunityCandidate = {
    accepted: true,
    symbol: notification.symbol,
    assetName: notification.assetName,
    direction: notification.direction,
    entryZone: notification.zone,
    invalidation: notification.invalidation,
    targets: Array.isArray(notification.targets) ? notification.targets.map(String) : [],
    source: alert ? OpportunitySource.MIX : OpportunitySource.IVT,
    summary: notification.extractedSummary || "Setup à surveiller issu d'une notification IVT.",
    riskNotes: notification.riskNotes,
    aiReasoningSummary: alert
      ? "Notification IVT rapprochée d'une alerte TradingView récente."
      : "Notification IVT structurée, sans autre convergence récente détectée.",
  };

  candidate = await reviewOpportunityRisk(candidate);
  candidate = await writeDashboardSetup(candidate);

  const newsScore = context.news[0]?.importanceScore ?? context.contexts[0]?.importanceScore ?? 0;
  return persistCandidate(candidate, {
    hasTradingView: Boolean(alert),
    hasIvtNotification: true,
    coherentNewsScore: newsScore,
    entryZone: candidate.entryZone,
    invalidation: candidate.invalidation,
    targets: candidate.targets,
    createdAt: notification.createdAt,
    riskPenalty: riskPenalty(candidate.riskNotes),
  });
}
