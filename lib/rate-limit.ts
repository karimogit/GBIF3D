/**
 * Simple in-memory rate limiter for Next.js API routes (per client IP).
 * Resets on cold starts; sufficient for abuse mitigation on serverless.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
/** Hard cap so a client cannot grow the map with forged forwarding headers. */
export const MAX_RATE_LIMIT_BUCKETS = 5_000;

export interface RateLimitOptions {
  /** Max requests per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

function boundedIp(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 128);
}

/**
 * Client address for rate-limit keys.
 * Prefer `x-real-ip` (set by the edge, not the caller). Fall back to the first
 * `X-Forwarded-For` hop only when the platform did not send a real IP.
 */
export function getClientIp(request: Request): string {
  const realIp = boundedIp(request.headers.get('x-real-ip') ?? undefined);
  if (realIp) return realIp;
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = boundedIp(forwarded.split(',')[0]);
    if (first) return first;
  }
  return 'unknown';
}

function evictOldestBucket(now: number): void {
  if (buckets.size < MAX_RATE_LIMIT_BUCKETS) return;
  pruneRateLimitBuckets(now);
  if (buckets.size < MAX_RATE_LIMIT_BUCKETS) return;
  let oldestKey: string | undefined;
  let oldestReset = Infinity;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < oldestReset) {
      oldestReset = bucket.resetAt;
      oldestKey = key;
    }
  }
  if (oldestKey) buckets.delete(oldestKey);
}

export function checkRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    if (!bucket) evictOldestBucket(now);
    const resetAt = now + options.windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: options.limit - 1, resetAt };
  }
  if (bucket.count >= options.limit) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }
  bucket.count += 1;
  return { allowed: true, remaining: options.limit - bucket.count, resetAt: bucket.resetAt };
}

/** Prune stale buckets periodically so memory stays bounded. */
export function pruneRateLimitBuckets(now = Date.now()): void {
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

/** Test-only: reset all buckets. */
export function clearRateLimitStore(): void {
  buckets.clear();
}

/** Test-only: current bucket count. */
export function rateLimitBucketCount(): number {
  return buckets.size;
}

export function rateLimitResponse(result: RateLimitResult): Response {
  const retryAfterSec = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  return new Response(JSON.stringify({ error: 'Too many requests' }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(retryAfterSec),
      'X-RateLimit-Remaining': String(result.remaining),
    },
  });
}
