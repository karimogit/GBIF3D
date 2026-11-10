import { checkRateLimit, clearRateLimitStore, getClientIp, MAX_RATE_LIMIT_BUCKETS, rateLimitBucketCount } from '@/lib/rate-limit';

describe('rate-limit', () => {
  beforeEach(() => {
    clearRateLimitStore();
  });

  it('allows requests under the limit', () => {
    const r1 = checkRateLimit('test-ip', { limit: 3, windowMs: 60_000 });
    const r2 = checkRateLimit('test-ip', { limit: 3, windowMs: 60_000 });
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
  });

  it('blocks requests over the limit', () => {
    const opts = { limit: 2, windowMs: 60_000 };
    checkRateLimit('blocked-ip', opts);
    checkRateLimit('blocked-ip', opts);
    const r3 = checkRateLimit('blocked-ip', opts);
    expect(r3.allowed).toBe(false);
  });

  it('prefers x-real-ip over a caller-supplied forwarding header', () => {
    const headers = new Map([
      ['x-real-ip', '198.51.100.10'],
      ['x-forwarded-for', '1.2.3.4, 198.51.100.10'],
    ]);
    const request = { headers: { get: (name: string) => headers.get(name) ?? null } } as Request;
    expect(getClientIp(request)).toBe('198.51.100.10');
  });

  it('does not grow the bucket map without bound', () => {
    const opts = { limit: 5, windowMs: 60_000 };
    for (let i = 0; i < MAX_RATE_LIMIT_BUCKETS + 25; i++) {
      checkRateLimit(`ip-${i}`, opts);
    }
    expect(rateLimitBucketCount()).toBeLessThanOrEqual(MAX_RATE_LIMIT_BUCKETS);
  });
});
