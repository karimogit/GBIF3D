import { NextRequest, NextResponse } from 'next/server';

const GBIF_SPECIES_SUGGEST = 'https://api.gbif.org/v1/species/suggest';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim();
  const limit = request.nextUrl.searchParams.get('limit') ?? '20';

  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  const params = new URLSearchParams({ q, limit });

  try {
    const res = await fetch(`${GBIF_SPECIES_SUGGEST}?${params}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 120 },
    });
    if (!res.ok) {
      return NextResponse.json([], { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error('Species suggest error:', err);
    return NextResponse.json([], { status: 502 });
  }
}
