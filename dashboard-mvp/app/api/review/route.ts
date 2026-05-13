import { OpportunityStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { auditLog } from "@/lib/db/audit";
import { jsonError, requireApiSession } from "@/lib/security/api";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
  const session = await requireApiSession();
  if (!session) return jsonError("Authentification requise.", 401);

  const body = (await request.json()) as { id?: string; status?: OpportunityStatus };
  if (!body.id || !body.status || !Object.values(OpportunityStatus).includes(body.status)) {
    return jsonError("Changement de statut invalide.", 422);
  }

  const opportunity = await prisma.opportunity.update({
    where: { id: body.id },
    data: { status: body.status },
  });

  await auditLog("status_changed", `Opportunity ${opportunity.symbol} status changed`, {
    opportunityId: opportunity.id,
    status: opportunity.status,
  });

  return NextResponse.json({ ok: true, opportunity });
}
