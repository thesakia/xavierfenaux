import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function requireApiSession() {
  const session = await getSession();
  return session;
}
