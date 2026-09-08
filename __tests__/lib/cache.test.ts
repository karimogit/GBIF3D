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

    it('preserves nested object properties (bounds) in the key', () => {
      const key = cacheKey('occ', {
        bounds: { west: 10, south: 58, east: 20, north: 62 },
      });
      expect(key).toContain('"west":10');
      expect(key).toContain('"south":58');
      expect(key).toContain('"east":20');
      expect(key).toContain('"north":62');
    });

    it('includes nested selectedSpeciesOptions label/key', () => {
      const key = cacheKey('occ', {
        selectedSpeciesOptions: [{ label: 'Pinus sylvestris', key: 5284861 }],
      });
      expect(key).toContain('"label":"Pinus sylvestris"');
      expect(key).toContain('"key":5284861');
    });

    it('different nested values produce different keys', () => {
      const a = cacheKey('occ', { bounds: { west: 10, south: 58, east: 20, north: 62 } });
      const b = cacheKey('occ', { bounds: { west: 11, south: 58, east: 20, north: 62 } });
      expect(a).not.toBe(b);
    });

    it('same nested values with different key order produce the same key', () => {
      const a = cacheKey('occ', { bounds: { west: 10, south: 58, east: 20, north: 62 } });
      const b = cacheKey('occ', { bounds: { north: 62, east: 20, south: 58, west: 10 } });
      expect(a).toBe(b);
    });
  });

  describe('getCached expiry isolation', () => {
    it('expired entry returns null while unexpired sibling remains', () => {
      jest.useFakeTimers();
      try {
        const now = Date.now();
        jest.setSystemTime(now);
        setCache('short', 'gone-soon', 1000);
        setCache('long', 'still-here', 60_000);
        jest.setSystemTime(now + 2000);
        expect(getCached('short')).toBeNull();
        expect(getCached<string>('long')).toBe('still-here');
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
