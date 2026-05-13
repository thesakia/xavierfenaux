import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonError, requireApiSession } from "@/lib/security/api";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireApiSession();
  if (!session) return jsonError("Authentification requise.", 401);

  const opportunities = await prisma.opportunity.findMany({
    orderBy: [{ status: "asc" }, { score: "desc" }, { createdAt: "desc" }],
    take: 100,
  });

  return NextResponse.json({ ok: true, opportunities });
}
