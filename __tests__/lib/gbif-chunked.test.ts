import { searchOccurrencesChunked, GBIFApiError } from '@/lib/gbif';
import { clearCache } from '@/lib/cache';

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => {
        const h = init.headers ?? {};
        const key = Object.keys(h).find((k) => k.toLowerCase() === name.toLowerCase());
        return key != null ? h[key] : null;
      },
    },
    json: async () => body,
  } as unknown as Response;
}

function page(results: { key: number }[], opts: { offset?: number; endOfRecords?: boolean; count?: number } = {}) {
  return {
    offset: opts.offset ?? 0,
    limit: results.length,
    endOfRecords: opts.endOfRecords ?? false,
    count: opts.count ?? results.length,
    results,
  };
}

describe('searchOccurrencesChunked', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    clearCache();
    fetchMock = jest.fn();
    (global as typeof globalThis & { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    Reflect.deleteProperty(globalThis, 'fetch');
  });

  it('fetches multiple chunks across the 300-record boundary', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(page(Array.from({ length: 300 }, (_, i) => ({ key: i + 1 })), { offset: 0, count: 450 }))
      )
      .mockResolvedValueOnce(
        jsonResponse(
          page(Array.from({ length: 150 }, (_, i) => ({ key: 301 + i })), {
            offset: 300,
            endOfRecords: true,
            count: 450,
          })
        )
      );

    const promise = searchOccurrencesChunked({ geometry: 'POLYGON((0 0,1 0,1 1,0 1,0 0))', limit: 450 });
    // Flush the inter-chunk delay
    await jest.runAllTimersAsync();
    const res = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.results).toHaveLength(450);
    expect(res.endOfRecords).toBe(true);
    const firstUrl = String(fetchMock.mock.calls[0][0]);
    const secondUrl = String(fetchMock.mock.calls[1][0]);
    expect(firstUrl).toContain('limit=300');
    expect(firstUrl).toContain('offset=0');
    expect(secondUrl).toContain('limit=150');
    expect(secondUrl).toContain('offset=300');
  });

  it('short-circuits when endOfRecords is true before maxTotal', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(page([{ key: 1 }, { key: 2 }], { endOfRecords: true, count: 2 }))
    );

    const res = await searchOccurrencesChunked({
      geometry: 'POLYGON((0 0,1 0,1 1,0 1,0 0))',
      limit: 1000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.results).toHaveLength(2);
    expect(res.endOfRecords).toBe(true);
  });

  it('aborts mid-loop when the signal is aborted', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(async () => {
      controller.abort();
      return jsonResponse(
        page(Array.from({ length: 300 }, (_, i) => ({ key: i + 1 })), { count: 900 })
      );
    });

    const promise = searchOccurrencesChunked(
      { geometry: 'POLYGON((0 0,1 0,1 1,0 1,0 0))', limit: 900 },
      { signal: controller.signal }
    );

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('retries on 429 using Retry-After then continues', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ message: 'Too Many Requests' }, { status: 429, headers: { 'Retry-After': '1' } })
      )
      .mockResolvedValueOnce(
        jsonResponse(page([{ key: 7 }], { endOfRecords: true, count: 1 }))
      );

    const promise = searchOccurrencesChunked({
      geometry: 'POLYGON((0 0,1 0,1 1,0 1,0 0))',
      limit: 100,
    });
    await jest.runAllTimersAsync();
    const res = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.results).toEqual([{ key: 7 }]);
  });

  it('throws GBIFApiError after exhausting 429 retries', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ message: 'rate limited' }, { status: 429, headers: { 'Retry-After': '1' } })
    );

    const promise = searchOccurrencesChunked({
      geometry: 'POLYGON((0 0,1 0,1 1,0 1,0 0))',
      limit: 50,
    }).catch((e: unknown) => e);

    await jest.runAllTimersAsync();
    const err = await promise;
    expect(err).toBeInstanceOf(GBIFApiError);
    expect((err as GBIFApiError).status).toBe(429);
  });
});
