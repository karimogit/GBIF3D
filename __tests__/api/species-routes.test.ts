/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { GET as suggestGET } from '@/app/api/species/suggest/route';
import { GET as searchGET } from '@/app/api/species/search/route';
import { clearRateLimitStore } from '@/lib/rate-limit';

const fetchMock = jest.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function req(path: string, ip = '203.0.113.1'): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    headers: { 'x-forwarded-for': ip },
  });
}

function upstreamUrl(): URL {
  const [url] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return new URL(url);
}

beforeEach(() => {
  clearRateLimitStore();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('GET /api/species/suggest', () => {
  it('returns an empty array without calling GBIF for short queries', async () => {
    const res = await suggestGET(req('/api/species/suggest?q=a'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('proxies to GBIF with a clamped limit and truncated query', async () => {
    fetchMock.mockImplementation(() => jsonResponse([{ key: 1, scientificName: 'Puma concolor' }]));
    const longQuery = 'x'.repeat(500);
    const res = await suggestGET(req(`/api/species/suggest?q=${longQuery}&limit=999`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ key: 1, scientificName: 'Puma concolor' }]);

    const url = upstreamUrl();
    expect(url.origin + url.pathname).toBe('https://api.gbif.org/v1/species/suggest');
    expect(url.searchParams.get('q')).toHaveLength(120);
    expect(url.searchParams.get('limit')).toBe('50');
  });

  it('falls back to the default limit when limit is not a number', async () => {
    fetchMock.mockImplementation(() => jsonResponse([]));
    await suggestGET(req('/api/species/suggest?q=puma&limit=abc'));
    expect(upstreamUrl().searchParams.get('limit')).toBe('20');
  });

  it('passes upstream error status through with an empty body', async () => {
    fetchMock.mockImplementation(() => jsonResponse({ message: 'nope' }, 503));
    const res = await suggestGET(req('/api/species/suggest?q=puma'));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual([]);
  });

  it('returns 502 when the upstream request throws', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockRejectedValue(new Error('network down'));
    const res = await suggestGET(req('/api/species/suggest?q=puma'));
    expect(res.status).toBe(502);
    consoleError.mockRestore();
  });

  it('rate-limits a single client and reports Retry-After', async () => {
    fetchMock.mockImplementation(() => jsonResponse([]));
    let last: Response | undefined;
    for (let i = 0; i < 41; i++) {
      last = await suggestGET(req('/api/species/suggest?q=puma', '198.51.100.7'));
    }
    expect(last?.status).toBe(429);
    expect(Number(last?.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
    expect(fetchMock).toHaveBeenCalledTimes(40);

    // A different client is unaffected.
    const other = await suggestGET(req('/api/species/suggest?q=puma', '198.51.100.8'));
    expect(other.status).toBe(200);
  });
});

describe('GET /api/species/search', () => {
  it('returns empty results without calling GBIF for short queries', async () => {
    const res = await searchGET(req('/api/species/search?q=a'));
    expect(await res.json()).toEqual({ results: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('whitelists qField and status, falling back to VERNACULAR / ACCEPTED', async () => {
    fetchMock.mockImplementation(() => jsonResponse({ results: [] }));
    await searchGET(req('/api/species/search?q=wolf&qField=EVIL&status=DROP%20TABLE'));
    const params = upstreamUrl().searchParams;
    expect(params.get('qField')).toBe('VERNACULAR');
    expect(params.get('status')).toBe('ACCEPTED');
    expect(params.get('limit')).toBe('20');
  });

  it('accepts allowed qField/status values case-insensitively', async () => {
    fetchMock.mockImplementation(() => jsonResponse({ results: [] }));
    await searchGET(req('/api/species/search?q=wolf&qField=scientific&status=synonym&limit=5'));
    const params = upstreamUrl().searchParams;
    expect(params.get('qField')).toBe('SCIENTIFIC');
    expect(params.get('status')).toBe('SYNONYM');
    expect(params.get('limit')).toBe('5');
  });

  it('returns the GBIF payload on success', async () => {
    const payload = {
      results: [{ key: 5219404, canonicalName: 'Canis lupus' }],
    };
    fetchMock.mockImplementation(() => jsonResponse(payload));
    const res = await searchGET(req('/api/species/search?q=wolf'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(payload);
  });
});
