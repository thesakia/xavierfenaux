import { cookies } from "next/headers";
import crypto from "crypto";

const COOKIE_NAME = "xf_dashboard_session";
const MAX_AGE_SECONDS = 60 * 60 * 12;

type SessionPayload = {
  userId: string;
  exp: number;
};

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 24) {
    throw new Error("SESSION_SECRET must be set with at least 24 characters.");
  }
  return secret;
}

function encode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(payload: string) {
  return crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

function serializeSession(payload: SessionPayload) {
  const body = encode(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

function parseSession(raw?: string): SessionPayload | null {
  if (!raw) return null;
  const [body, signature] = raw.split(".");
  if (!body || !signature || sign(body) !== signature) return null;

  try {
    const payload = JSON.parse(decode(body)) as SessionPayload;
    if (!payload.userId || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function createSessionCookie(userId: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, serializeSession({ userId, exp: Date.now() + MAX_AGE_SECONDS * 1000 }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getSession() {
  const cookieStore = await cookies();
  return parseSession(cookieStore.get(COOKIE_NAME)?.value);
}
