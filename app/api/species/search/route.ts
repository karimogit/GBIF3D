import { NextRequest, NextResponse } from 'next/server';

const GBIF_SPECIES_SEARCH = 'https://api.gbif.org/v1/species/search';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim();
  const qField = request.nextUrl.searchParams.get('qField') ?? 'VERNACULAR';
  const status = request.nextUrl.searchParams.get('status') ?? 'ACCEPTED';
  const limit = request.nextUrl.searchParams.get('limit') ?? '20';

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const params = new URLSearchParams({ q, qField, status, limit });

  try {
    const res = await fetch(`${GBIF_SPECIES_SEARCH}?${params}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 120 },
    });
    if (!res.ok) {
      return NextResponse.json({ results: [] }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error('Species search error:', err);
    return NextResponse.json({ results: [] }, { status: 502 });
  }
}
