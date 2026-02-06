/**
 * Unit tests for GBIF API integration
 * Uses real GBIF API with sample queries (e.g. forest species in Sweden)
 */

import { searchOccurrences, suggestSpecies, GBIFApiError, TAXON_CLASS_KEYS } from '@/lib/gbif';

describe('GBIF API', () => {
  describe('searchOccurrences', () => {
    it('returns occurrence results for a geometry query', async () => {
      const geometry = 'POLYGON((10 58, 20 58, 20 62, 10 62, 10 58))'; // Sweden bbox approx
      const res = await searchOccurrences({
        geometry,
        limit: 10,
      });
      expect(res).toHaveProperty('results');
      expect(Array.isArray(res.results)).toBe(true);
      expect(res.limit).toBe(10);
      expect(res.results.length).toBeLessThanOrEqual(10);
      if (res.results.length > 0) {
        const o = res.results[0];
        expect(o).toHaveProperty('key');
        expect(o).toHaveProperty('decimalLatitude');
        expect(o).toHaveProperty('decimalLongitude');
      }
    }, 15000);

    it('filters by taxonKey when provided', async () => {
      const geometry = 'POLYGON((10 58, 20 58, 20 62, 10 62, 10 58))';
      const res = await searchOccurrences({
        geometry,
        taxonKey: TAXON_CLASS_KEYS.plants,
        limit: 5,
      });
      expect(res.results.length).toBeLessThanOrEqual(5);
      res.results.forEach((o) => {
        expect(o.kingdom).toBeDefined();
      });
    }, 15000);

    it('throws GBIFApiError on invalid geometry', async () => {
      await expect(
        searchOccurrences({
          geometry: 'INVALID',
          limit: 1,
        })
      ).rejects.toThrow(GBIFApiError);
    }, 10000);
  });

  describe('suggestSpecies', () => {
    it('returns species suggestions for a query', async () => {
      const results = await suggestSpecies('Pinus sylvestris');
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('key');
      expect(results[0]).toHaveProperty('scientificName');
    }, 10000);

    it('returns empty array for short query', async () => {
      const results = await suggestSpecies('P');
      expect(results).toEqual([]);
    });
  });

  describe('TAXON_CLASS_KEYS', () => {
    it('has expected taxonomic class keys', () => {
      expect(TAXON_CLASS_KEYS.birds).toBe(212);
      expect(TAXON_CLASS_KEYS.plants).toBe(6);
      expect(TAXON_CLASS_KEYS.mammals).toBe(359);
    });
  });
});
