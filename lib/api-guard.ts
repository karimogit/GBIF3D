import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp, pruneRateLimitBuckets, rateLimitResponse } from './rate-limit';

const DEFAULT_LIMIT = 60;
const DEFAULT_WINDOW_MS = 60_000;

export function guardApiRoute(
  request: NextRequest,
  routeId: string,
  options?: { limit?: number; windowMs?: number }
): NextResponse | null {
  pruneRateLimitBuckets();
  const ip = getClientIp(request);
  const result = checkRateLimit(`${routeId}:${ip}`, {
    limit: options?.limit ?? DEFAULT_LIMIT,
    windowMs: options?.windowMs ?? DEFAULT_WINDOW_MS,
  });
  if (!result.allowed) {
    const blocked = rateLimitResponse(result);
    return new NextResponse(blocked.body, { status: blocked.status, headers: blocked.headers });
  }
  return null;
}
