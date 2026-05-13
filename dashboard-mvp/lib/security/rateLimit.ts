import { NextRequest } from "next/server";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function rateLimit(
  request: NextRequest,
  key: string,
  options: { windowMs: number; max: number } = { windowMs: 60_000, max: 30 },
) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "local";
  const now = Date.now();
  const bucketKey = `${key}:${ip}`;
  const bucket = buckets.get(bucketKey);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + options.windowMs });
    return { ok: true, remaining: options.max - 1 };
  }

  bucket.count += 1;
  return { ok: bucket.count <= options.max, remaining: Math.max(0, options.max - bucket.count) };
}
