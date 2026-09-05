import { NextRequest, NextResponse } from 'next/server';
import { cacheKey, getCached, setCache } from '@/lib/cache';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
/**
 * Nominatim's usage policy requires an identifying User-Agent with a way to contact the operator,
 * and at most one request per second. Set NOMINATIM_USER_AGENT (e.g. "MyApp/1.0 (me@example.org)").
 */
const USER_AGENT =
  process.env.NOMINATIM_USER_AGENT?.trim() ||
  `GBIF3D/1.0 (${process.env.NEXT_PUBLIC_GITHUB_REPO_URL?.trim() || 'https://github.com/karimogit/GBIF3D'})`;
const MIN_REQUEST_INTERVAL_MS = 1000;
const RESULT_TTL_MS = 60 * 60 * 1000;
const MAX_QUERY_LENGTH = 200;

export interface PlaceSearchResult {
  display_name: string;
  place_id: number;
  bounds: { west: number; south: number; east: number; north: number };
  /** ISO 3166-1 alpha-2 country code (e.g. SE, NO) when place is in a country; for API filter */
  country_code?: string;
}

interface NominatimItem {
  display_name: string;
  place_id: number;
  boundingbox: [string, string, string, string]; // [south, north, west, east] = [min_lat, max_lat, min_lon, max_lon]
  address?: { country_code?: string };
}

// Serialises upstream calls from this server instance so they are spaced >= 1s apart.
let upstreamQueue: Promise<unknown> = Promise.resolve();
let lastUpstreamAt = 0;

function throttledFetch(url: string, init: RequestInit): Promise<Response> {
  const run = async () => {
    const wait = lastUpstreamAt + MIN_REQUEST_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastUpstreamAt = Date.now();
    return fetch(url, init);
  };
  const next = upstreamQueue.then(run, run);
  upstreamQueue = next.catch(() => undefined);
  return next;
}

function toResult(item: NominatimItem): PlaceSearchResult | null {
  const [south, north, west, east] = item.boundingbox.map(parseFloat);
  if (![south, north, west, east].every(Number.isFinite)) return null;
  const cc = item.address?.country_code?.trim().toUpperCase();
  return {
    display_name: item.display_name,
    place_id: item.place_id,
    bounds: { west, south, east, north },
    ...(cc && /^[A-Z]{2}$/.test(cc) ? { country_code: cc } : {}),
  };
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim().slice(0, MAX_QUERY_LENGTH);
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const key = cacheKey('places', { q: q.toLowerCase() });
  const cached = getCached<PlaceSearchResult[]>(key);
  if (cached) return NextResponse.json({ results: cached });

  const params = new URLSearchParams({
    q,
    format: 'json',
    limit: '8',
    addressdetails: '1',
  });

  try {
    const res = await throttledFetch(`${NOMINATIM_URL}?${params}`, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'en',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return NextResponse.json({ results: [] }, { status: 502 });
    }
    const data = (await res.json()) as NominatimItem[];
    const results = data.map(toResult).filter((r): r is PlaceSearchResult => r != null);
    setCache(key, results, RESULT_TTL_MS);
    return NextResponse.json({ results });
  } catch (err) {
    console.error('Places search error:', err);
    return NextResponse.json({ results: [] }, { status: 502 });
  }
}
