import { NextRequest, NextResponse } from "next/server";
import { verifyDashboardLogin } from "@/lib/auth/password";
import { createSessionCookie } from "@/lib/auth/session";
import { auditLog } from "@/lib/db/audit";
import { jsonError } from "@/lib/security/api";
import { rateLimit } from "@/lib/security/rateLimit";

export async function POST(request: NextRequest) {
  const limited = rateLimit(request, "auth-login", { windowMs: 60_000, max: 8 });
  if (!limited.ok) return jsonError("Trop de tentatives. Reessaie dans une minute.", 429);

  const body = (await request.json()) as { username?: string; password?: string };
  const user = await verifyDashboardLogin(body.username ?? "", body.password ?? "");

  if (!user) {
    await auditLog("auth_failed", "Dashboard login failed", { username: body.username ?? null });
    return jsonError("Identifiants invalides.", 401);
  }

  await createSessionCookie(user.id);
  await auditLog("auth_success", "Dashboard login succeeded", { userId: user.id });
  return NextResponse.json({ ok: true });
}
