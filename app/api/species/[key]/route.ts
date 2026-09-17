import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-guard';
import { cacheKey, getCached, setCache } from '@/lib/cache';
import { fetchEnglishVernacularName } from '@/lib/species-vernacular';

const RESULT_TTL_MS = 24 * 60 * 60 * 1000;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ key: string }> }
) {
  const blocked = guardApiRoute(request, 'species-detail', { limit: 60, windowMs: 60_000 });
  if (blocked) return blocked;

  const { key } = await context.params;
  const taxonKey = Number(key);
  if (!Number.isInteger(taxonKey) || taxonKey < 1) {
    return NextResponse.json({ error: 'Invalid species key' }, { status: 400 });
  }

  const cacheId = cacheKey('species-vernacular-en', { taxonKey });
  const cached = getCached<{ vernacularName: string | null }>(cacheId);
  if (cached) return NextResponse.json(cached);

  try {
    const vernacularName = await fetchEnglishVernacularName(taxonKey);
    const payload = { vernacularName };
    setCache(cacheId, payload, RESULT_TTL_MS);
    return NextResponse.json(payload);
  } catch (err) {
    console.error('Species vernacular fetch error:', err);
    return NextResponse.json({ vernacularName: null }, { status: 502 });
  }
}
