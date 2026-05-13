import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { auditLog } from "@/lib/db/audit";
import { jsonError } from "@/lib/security/api";
import { rateLimit } from "@/lib/security/rateLimit";
import { tradingViewAlertSchema } from "@/lib/tradingview/schema";
import { getTradingViewQueue } from "@/lib/queues/queues";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const limited = rateLimit(request, "tradingview-webhook", { windowMs: 60_000, max: 60 });
  if (!limited.ok) return jsonError("Rate limit atteint.", 429);

  const body = (await request.json()) as Record<string, unknown>;
  const secret =
    request.headers.get("x-tradingview-secret") ??
    request.nextUrl.searchParams.get("secret") ??
    (typeof body.secret === "string" ? body.secret : null);

  if (!process.env.TRADINGVIEW_WEBHOOK_SECRET || secret !== process.env.TRADINGVIEW_WEBHOOK_SECRET) {
    await auditLog("webhook_rejected", "TradingView webhook rejected");
    return jsonError("Webhook non autorise.", 401);
  }

  const parsed = tradingViewAlertSchema.safeParse(body);
  if (!parsed.success) {
    await auditLog("webhook_invalid", "TradingView webhook payload invalid", parsed.error.flatten());
    return jsonError("Payload TradingView invalide.", 422);
  }

  const alert = await prisma.tradingViewAlert.create({
    data: {
      symbol: parsed.data.symbol.toUpperCase(),
      timeframe: parsed.data.timeframe,
      price: parsed.data.price,
      signal: parsed.data.signal,
      direction: parsed.data.direction,
      indicator: parsed.data.indicator,
      message: parsed.data.message,
      rawPayload: body as Prisma.InputJsonObject,
    },
  });

  await getTradingViewQueue().add("process-alert", { alertId: alert.id }, { attempts: 3, backoff: { type: "exponential", delay: 5000 } });
  await auditLog("webhook_received", `TradingView webhook received for ${alert.symbol}`, { alertId: alert.id });

  return NextResponse.json({ ok: true, alertId: alert.id });
}
