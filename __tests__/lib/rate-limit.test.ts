import { checkRateLimit, clearRateLimitStore } from '@/lib/rate-limit';

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
});
