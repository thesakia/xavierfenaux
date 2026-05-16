import { NextRequest, NextResponse } from "next/server";
import { scanMarket } from "@/lib/market/scanMarket";
import { jsonError, requireApiSession } from "@/lib/security/api";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await requireApiSession();
  if (!session) return jsonError("Authentification requise.", 401);

  const body = (await request.json()) as {
    brief?: string;
    notifications?: string;
    methodContext?: string;
    triggerOpenAI?: boolean;
    useXavierAssetMemory?: boolean;
  };

  const result = await scanMarket({
    brief: body.brief,
    notifications: body.notifications,
    methodContext: body.methodContext,
    triggerOpenAI: body.triggerOpenAI === true,
    useXavierAssetMemory: body.useXavierAssetMemory === true,
  });

  return NextResponse.json({ ok: true, result });
}
