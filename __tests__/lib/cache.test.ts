import { getCached, setCache, cacheKey, clearCache } from '@/lib/cache';

describe('cache', () => {
  beforeEach(() => {
    clearCache();
  });

  describe('getCached / setCache', () => {
    it('returns null for missing key', () => {
      expect(getCached('missing')).toBeNull();
    });

    it('returns cached value after set', () => {
      setCache('k', { foo: 1 });
      expect(getCached<{ foo: number }>('k')).toEqual({ foo: 1 });
    });

    it('clearCache removes all entries', () => {
      setCache('k', 'v');
      clearCache();
      expect(getCached('k')).toBeNull();
    });
  });

  describe('cacheKey', () => {
    it('produces deterministic key from params', () => {
      const k1 = cacheKey('occ', { a: 1, b: 2 });
      const k2 = cacheKey('occ', { b: 2, a: 1 });
      expect(k1).toBe(k2);
    });

    it('different prefix produces different key', () => {
      const k1 = cacheKey('occ', { a: 1 });
      const k2 = cacheKey('suggest', { a: 1 });
      expect(k1).not.toBe(k2);
    });
  });
});
