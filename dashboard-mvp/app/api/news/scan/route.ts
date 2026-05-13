import { NextResponse } from "next/server";
import { getNewsQueue } from "@/lib/queues/queues";
import { auditLog } from "@/lib/db/audit";
import { jsonError, requireApiSession } from "@/lib/security/api";

export const runtime = "nodejs";

export async function POST() {
  const session = await requireApiSession();
  if (!session) return jsonError("Authentification requise.", 401);

  const job = await getNewsQueue().add("scan-news", {}, { attempts: 2, backoff: { type: "exponential", delay: 10000 } });
  await auditLog("news_scan_requested", "Manual news scan requested", { jobId: job.id });
  return NextResponse.json({ ok: true, jobId: job.id });
}
