import { searchOccurrences, suggestSpecies, GBIFApiError, TAXON_CLASS_KEYS } from '@/lib/gbif';
import { clearCache } from '@/lib/cache';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Response;
}

describe('GBIF API', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    clearCache();
    fetchMock = jest.fn();
    (global as typeof globalThis & { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
    jest.restoreAllMocks();
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'fetch');
  });

  describe('searchOccurrences', () => {
    it('returns occurrence results for a geometry query', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          offset: 0,
          limit: 10,
          endOfRecords: true,
          count: 1,
          results: [
            {
              key: 123,
              decimalLatitude: 60,
              decimalLongitude: 15,
            },
          ],
        })
      );
      const geometry = 'POLYGON((10 58, 20 58, 20 62, 10 62, 10 58))'; // Sweden bbox approx
      const res = await searchOccurrences({
        geometry,
        limit: 10,
      });
      expect(res).toHaveProperty('results');
      expect(Array.isArray(res.results)).toBe(true);
      expect(res.limit).toBe(10);
      expect(res.results.length).toBeLessThanOrEqual(10);
      const o = res.results[0];
      expect(o).toHaveProperty('key');
      expect(o).toHaveProperty('decimalLatitude');
      expect(o).toHaveProperty('decimalLongitude');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0][0])).toContain('geometry=');
    });

    it('filters by taxonKey when provided', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          offset: 0,
          limit: 5,
          endOfRecords: true,
          count: 1,
          results: [{ key: 456, kingdom: 'Plantae' }],
        })
      );
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
      expect(String(fetchMock.mock.calls[0][0])).toContain(`taxonKey=${TAXON_CLASS_KEYS.plants}`);
    });

    it('throws GBIFApiError on invalid geometry without echoing the request payload', async () => {
      expect.assertions(2);
      fetchMock.mockResolvedValueOnce(jsonResponse({}, 400));
      await searchOccurrences({ geometry: 'INVALID', limit: 1 }).catch((err) => {
        expect(err).toBeInstanceOf(GBIFApiError);
        expect(String(err.message)).not.toContain('Sent:');
      });
    });
  });

  describe('suggestSpecies', () => {
    it('returns species suggestions for a query', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse([{ key: 1, scientificName: 'Pinus sylvestris', canonicalName: 'Pinus sylvestris' }])
      );
      const results = await suggestSpecies('Pinus sylvestris');
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('key');
      expect(results[0]).toHaveProperty('scientificName');
    });

    it('returns empty array for short query', async () => {
      const results = await suggestSpecies('P');
      expect(results).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
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
