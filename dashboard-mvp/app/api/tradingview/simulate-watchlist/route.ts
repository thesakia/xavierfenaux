import { Direction, OpportunitySource, OpportunityStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { auditLog } from "@/lib/db/audit";
import { scoreOpportunity } from "@/lib/scoring/scoreOpportunity";
import { jsonError, requireApiSession } from "@/lib/security/api";

export const runtime = "nodejs";

const simulatedWatchlist = [
  {
    symbol: "CAC40",
    assetName: "CAC 40",
    price: 8248,
    direction: Direction.SHORT,
    entryZone: "8200/8300",
    invalidation: "8370",
    targets: ["7990", "7600"],
    variationPct: -0.82,
    source: "Watchlist TradingView simulee",
  },
  {
    symbol: "DAX",
    assetName: "DAX",
    price: 23840,
    direction: Direction.NEUTRAL,
    entryZone: "23750/23900",
    invalidation: "24080",
    targets: ["23560", "23200"],
    variationPct: 0.34,
    source: "Watchlist TradingView simulee",
  },
  {
    symbol: "EURUSD",
    assetName: "EURUSD",
    price: 1.1742,
    direction: Direction.SHORT,
    entryZone: "1.1740/1.1760",
    invalidation: "1.1810",
    targets: ["1.1680", "1.1600"],
    variationPct: -0.21,
    source: "Stratageme impulsion",
  },
  {
    symbol: "NASDAQ",
    assetName: "Nasdaq",
    price: 21320,
    direction: Direction.NEUTRAL,
    entryZone: "21250/21400",
    invalidation: "21620",
    targets: ["21050", "20780"],
    variationPct: 1.08,
    source: "Watchlist TradingView simulee",
  },
  {
    symbol: "GOLD",
    assetName: "Gold",
    price: 3294,
    direction: Direction.LONG,
    entryZone: "3275/3300",
    invalidation: "3248",
    targets: ["3335", "3370"],
    variationPct: 0.76,
    source: "Watchlist TradingView simulee",
  },
];

export async function POST() {
  const session = await requireApiSession();
  if (!session) return jsonError("Authentification requise.", 401);

  const created = [];

  for (const item of simulatedWatchlist) {
    const alert = await prisma.tradingViewAlert.create({
      data: {
        symbol: item.symbol,
        timeframe: "15m",
        price: item.price,
        signal: "watchlist_zone_reached",
        direction: item.direction,
        indicator: "watchlist_simulation",
        message: `${item.symbol} arrive sur une zone a surveiller`,
        processed: true,
        rawPayload: {
          symbol: item.symbol,
          timeframe: "15m",
          price: item.price,
          signal: "watchlist_zone_reached",
          direction: item.direction,
          indicator: "watchlist_simulation",
          variationPct: item.variationPct,
        },
      },
    });

    const scored = scoreOpportunity({
      hasTradingView: true,
      hasIvtNotification: item.symbol === "EURUSD" || item.symbol === "CAC40",
      coherentNewsScore: item.symbol === "EURUSD" ? 80 : 45,
      entryZone: item.entryZone,
      invalidation: item.invalidation,
      targets: item.targets,
      createdAt: alert.createdAt,
      riskPenalty: item.direction === Direction.NEUTRAL ? 8 : 0,
    });

    const opportunity = await prisma.opportunity.create({
      data: {
        symbol: item.symbol,
        assetName: item.assetName,
        direction: item.direction,
        entryZone: item.entryZone,
        invalidation: item.invalidation,
        targets: item.targets,
        score: scored.score,
        status: OpportunityStatus.WATCHING,
        source: OpportunitySource.TRADINGVIEW,
        summary: `${item.assetName} est proche d'une zone issue de la watchlist. Contexte a surveiller, sans validation automatique.`,
        riskNotes:
          item.direction === Direction.NEUTRAL
            ? "Biais neutre: attendre une reaction plus lisible avant de classer le scenario."
            : `Variation jour simulee: ${item.variationPct > 0 ? "+" : ""}${item.variationPct}%. Invalidation a respecter.`,
        aiReasoningSummary: `${item.source}. ${scored.reasons.join(" ")}`,
      },
    });

    created.push({ alertId: alert.id, opportunityId: opportunity.id, symbol: item.symbol });
  }

  await auditLog("watchlist_simulated", "Simulated TradingView watchlist alerts", {
    count: created.length,
    symbols: created.map((item) => item.symbol),
  });

  return NextResponse.json({ ok: true, created });
}
