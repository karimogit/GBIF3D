import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-guard';
import { cacheKey, getCached, setCache } from '@/lib/cache';
import {
  mergeBilingualPlaceResults,
  photonFeatureToResult,
  type PlaceSearchResult,
  type PhotonFeature,
} from '@/lib/places';

export type { PlaceSearchResult };

const PHOTON_URL = 'https://photon.komoot.io/api/';
const USER_AGENT =
  process.env.PHOTON_USER_AGENT?.trim() ||
  `GBIF3D/1.0 (${process.env.NEXT_PUBLIC_GITHUB_REPO_URL?.trim() || 'https://github.com/karimogit/GBIF3D'})`;
const RESULT_TTL_MS = 60 * 60 * 1000;
const MAX_QUERY_LENGTH = 200;
const RESULT_LIMIT = 8;

interface PhotonResponse {
  features?: PhotonFeature[];
}

async function fetchPhotonPlaces(q: string, lang?: string): Promise<PlaceSearchResult[]> {
  const params = new URLSearchParams({
    q,
    limit: String(RESULT_LIMIT),
  });
  if (lang) params.set('lang', lang);

  const res = await fetch(`${PHOTON_URL}?${params}`, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return [];

  const data = (await res.json()) as PhotonResponse;
  const features = Array.isArray(data.features) ? data.features : [];
  return features
    .map(photonFeatureToResult)
    .filter((r): r is PlaceSearchResult => r != null);
}

export async function GET(request: NextRequest) {
  const blocked = guardApiRoute(request, 'places-search', { limit: 30, windowMs: 60_000 });
  if (blocked) return blocked;

  const q = request.nextUrl.searchParams.get('q')?.trim().slice(0, MAX_QUERY_LENGTH);
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const key = cacheKey('places', { q: q.toLowerCase(), lang: 'bilingual' });
  const cached = getCached<PlaceSearchResult[]>(key);
  if (cached) return NextResponse.json({ results: cached });

  try {
    const [englishResults, localResults] = await Promise.all([
      fetchPhotonPlaces(q, 'en'),
      fetchPhotonPlaces(q),
    ]);
    const results = mergeBilingualPlaceResults(englishResults, localResults, RESULT_LIMIT);
    setCache(key, results, RESULT_TTL_MS);
    return NextResponse.json({ results });
  } catch (err) {
    console.error('Places search error:', err);
    return NextResponse.json({ results: [] }, { status: 502 });
  }
}
