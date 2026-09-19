/**
 * @jest-environment node
 */
import { createHash } from 'crypto';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/occurrence/[key]/image/route';
import { clearRateLimitStore } from '@/lib/rate-limit';

const fetchMock = jest.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function call(key: string, ip = '203.0.113.9') {
  const request = new NextRequest(`http://localhost/api/occurrence/${key}/image`, {
    headers: { 'x-forwarded-for': ip },
  });
  return GET(request, { params: Promise.resolve({ key }) });
}

beforeEach(() => {
  clearRateLimitStore();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('GET /api/occurrence/[key]/image', () => {
  it.each(['abc', '-1', '0', '1.5', '', '12abc', 'NaN', 'Infinity'])(
    'rejects invalid key %p with 400',
    async (key) => {
      const res = await call(key);
      expect(res.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it('maps StillImage media to GBIF image-cache URLs (max 2)', async () => {
    const media = [
      { type: 'StillImage', identifier: 'https://host/1.jpg' },
      { type: 'Sound', identifier: 'https://host/bird.mp3' },
      { format: 'image/png', identifier: 'https://host/2.png' },
      { type: 'StillImage', identifier: 'https://host/3.jpg' },
    ];
    fetchMock.mockImplementation(() => jsonResponse({ key: 123, media }));

    const res = await call('123');
    expect(res.status).toBe(200);
    const { urls } = (await res.json()) as { urls: string[] };

    const md5 = (s: string) => createHash('md5').update(s, 'utf8').digest('hex');
    expect(urls).toEqual([
      `https://api.gbif.org/v1/image/cache/200x/occurrence/123/media/${md5('https://host/1.jpg')}`,
      `https://api.gbif.org/v1/image/cache/200x/occurrence/123/media/${md5('https://host/2.png')}`,
    ]);

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('https://api.gbif.org/v1/occurrence/123');
  });

  it('returns an empty list when the occurrence has no media', async () => {
    fetchMock.mockImplementation(() => jsonResponse({ key: 7 }));
    const res = await call('7');
    expect(await res.json()).toEqual({ urls: [] });
  });

  it('maps upstream 404 to 404 and other failures to 502', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 404));
    expect((await call('1')).status).toBe(404);

    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
    expect((await call('2')).status).toBe(502);
  });
});
