import { NextRequest, NextResponse } from 'next/server';
import { cacheKey, getCached, setCache } from '@/lib/cache';
import { photonFeatureToResult, type PlaceSearchResult, type PhotonFeature } from '@/lib/places';

export type { PlaceSearchResult };

const PHOTON_URL = 'https://photon.komoot.io/api/';
const USER_AGENT =
  process.env.PHOTON_USER_AGENT?.trim() ||
  `GBIF3D/1.0 (${process.env.NEXT_PUBLIC_GITHUB_REPO_URL?.trim() || 'https://github.com/karimogit/GBIF3D'})`;
const RESULT_TTL_MS = 60 * 60 * 1000;
const MAX_QUERY_LENGTH = 200;

interface PhotonResponse {
  features?: PhotonFeature[];
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
    limit: '8',
  });

  try {
    const res = await fetch(`${PHOTON_URL}?${params}`, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return NextResponse.json({ results: [] }, { status: 502 });
    }
    const data = (await res.json()) as PhotonResponse;
    const features = Array.isArray(data.features) ? data.features : [];
    const results = features
      .map(photonFeatureToResult)
      .filter((r): r is PlaceSearchResult => r != null);
    setCache(key, results, RESULT_TTL_MS);
    return NextResponse.json({ results });
  } catch (err) {
    console.error('Places search error:', err);
    return NextResponse.json({ results: [] }, { status: 502 });
  }
}
