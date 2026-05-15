import { NextRequest, NextResponse } from "next/server";
import { Direction } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { auditLog } from "@/lib/db/audit";
import { parseNotificationsBatch } from "@/lib/market/notificationParser";
import { storePrepMemory } from "@/lib/market/prepMemory";
import { jsonError, requireApiSession } from "@/lib/security/api";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await requireApiSession();
  if (!session) return jsonError("Authentification requise.", 401);

  const body = (await request.json()) as { content?: string };
  const content = body.content?.trim();
  if (!content) return jsonError("Import vide.", 422);

  const parsed = parseNotificationsBatch(content);
  const created = [];
  const relatedAssets = [];

  for (const item of parsed) {
    const notification = await prisma.xavierNotification.create({
      data: {
        rawText: item.rawText,
        symbol: item.symbol,
        assetName: item.assetName,
        direction: item.direction ?? Direction.NEUTRAL,
        timeframe: item.timeframe,
        zone: item.zone,
        invalidation: item.invalidation,
        targets: item.targets,
        confidenceLevel: item.confidenceLevel,
        riskNotes: item.riskNotes,
        extractedSummary: item.extractedSummary,
      },
    });
    created.push(notification.id);
    if (item.symbol) relatedAssets.push(item.symbol);
  }

  await storePrepMemory({
    kind: "xavier_import",
    rawText: content,
    relatedAssets,
  });

  await auditLog("notifications_batch_imported", "Batch Xavier / IVT notifications imported", {
    count: created.length,
  });

  return NextResponse.json({ ok: true, count: created.length, ids: created });
}
