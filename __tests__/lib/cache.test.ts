import { getCached, setCache, cacheKey, clearCache, cacheStats, MAX_CACHE_ENTRIES, MAX_CACHE_WEIGHT } from '@/lib/cache';

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

    it('evicts least recently used entries when the cache grows too large', () => {
      for (let i = 0; i < MAX_CACHE_ENTRIES; i++) {
        setCache(`k${i}`, i);
      }
      getCached('k0'); // touch: k0 becomes most recently used
      setCache('extra', 'x');
      expect(getCached<number>('k0')).toBe(0);
      expect(getCached('k1')).toBeNull();
      expect(getCached<string>('extra')).toBe('x');
    });

    it('bounds the cache by weight so one large download cannot flush everything', () => {
      setCache('small', 'keep-me');
      getCached('small');
      for (let i = 0; i < 10; i++) {
        setCache(`chunk${i}`, i, undefined, MAX_CACHE_WEIGHT / 4);
      }
      expect(cacheStats().weight).toBeLessThanOrEqual(MAX_CACHE_WEIGHT);
      expect(getCached('small')).toBeNull();
      expect(getCached<number>('chunk9')).toBe(9);
      expect(getCached('chunk0')).toBeNull();
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
