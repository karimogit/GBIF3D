/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/places/search/route';
import { clearCache } from '@/lib/cache';
import { clearRateLimitStore } from '@/lib/rate-limit';

const fetchMock = jest.fn();

/** Photon `extent` is [minLon, maxLat, maxLon, minLat]. */
function photonFeature(
  name: string,
  box: { west: number; south: number; east: number; north: number },
  countrycode = 'SE'
) {
  return {
    geometry: {
      coordinates: [(box.west + box.east) / 2, (box.south + box.north) / 2],
    },
    properties: {
      osm_id: 42,
      name,
      countrycode,
      extent: [box.west, box.north, box.east, box.south],
      country: 'Sweden',
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function call(q: string, ip = '203.0.113.5') {
  return GET(
    new NextRequest(`http://localhost/api/places/search?q=${encodeURIComponent(q)}`, {
      headers: { 'x-forwarded-for': ip },
    })
  );
}

beforeEach(() => {
  clearRateLimitStore();
  clearCache();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('GET /api/places/search', () => {
  it('returns empty results without calling Photon for short queries', async () => {
    const res = await call('a');
    expect(await res.json()).toEqual({ results: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('queries Photon in English and the local language, with a User-Agent', async () => {
    fetchMock.mockImplementation(() =>
      jsonResponse({
        features: [
          photonFeature('Gothenburg', { west: 11.7, south: 57.6, east: 12.1, north: 57.8 }),
        ],
      })
    );
    const res = await call('Gothenburg');
    expect(res.status).toBe(200);
    const { results } = (await res.json()) as {
      results: Array<{ display_name: string; bounds: unknown }>;
    };
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].display_name).toContain('Gothenburg');
    expect(results[0].bounds).toEqual({ west: 11.7, south: 57.6, east: 12.1, north: 57.8 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map(([u]) => new URL(u as string));
    expect(urls.every((u) => u.origin === 'https://photon.komoot.io')).toBe(true);
    expect(urls.some((u) => u.searchParams.get('lang') === 'en')).toBe(true);
    expect(urls.some((u) => u.searchParams.get('lang') == null)).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['User-Agent']).toMatch(/GBIF3D/);
  });

  it('serves repeated queries from the cache (case-insensitive)', async () => {
    fetchMock.mockImplementation(() =>
      jsonResponse({
        features: [
          photonFeature('Oslo', { west: 10.5, south: 59.8, east: 10.9, north: 60.0 }, 'NO'),
        ],
      })
    );
    await call('Oslo');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const res = await call('oslo');
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('treats a non-OK Photon response as no results rather than an error', async () => {
    fetchMock.mockImplementation(() => jsonResponse({}, 503));
    const res = await call('Nowhere');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [] });
  });

  it('returns 502 when Photon is unreachable', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockRejectedValue(new Error('timeout'));
    const res = await call('Somewhere');
    expect(res.status).toBe(502);
    consoleError.mockRestore();
  });
});
