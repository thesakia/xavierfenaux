import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { auditLog } from "@/lib/db/audit";
import { extractXavierNotification } from "@/lib/agents/setupAgent";
import { createOpportunityFromNotification } from "@/lib/opportunities/createOpportunity";
import { jsonError, requireApiSession } from "@/lib/security/api";
import { rateLimit } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await requireApiSession();
  if (!session) return jsonError("Authentification requise.", 401);

  const limited = rateLimit(request, "notification-import", { windowMs: 60_000, max: 20 });
  if (!limited.ok) return jsonError("Rate limit atteint.", 429);

  const body = (await request.json()) as { rawText?: string };
  const rawText = body.rawText?.trim();
  if (!rawText) return jsonError("Notification vide.", 422);

  const extracted = await extractXavierNotification(rawText);
  const notification = await prisma.xavierNotification.create({
    data: {
      rawText,
      symbol: extracted.symbol,
      assetName: extracted.assetName,
      direction: extracted.direction,
      timeframe: extracted.timeframe,
      zone: extracted.zone,
      invalidation: extracted.invalidation,
      targets: extracted.targets,
      confidenceLevel: extracted.confidenceLevel,
      riskNotes: extracted.riskNotes,
      extractedSummary: extracted.extractedSummary,
    },
  });

  const opportunity = await createOpportunityFromNotification(notification.id);
  await auditLog("notification_imported", "Notification Xavier / IVT imported", {
    notificationId: notification.id,
    opportunityId: opportunity?.id ?? null,
  });

  return NextResponse.json({ ok: true, notification, opportunity });
}
