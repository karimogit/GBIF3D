import { NextRequest, NextResponse } from 'next/server';

const GBIF_SPECIES_SEARCH = 'https://api.gbif.org/v1/species/search';
const MAX_QUERY_LENGTH = 120;
const MAX_LIMIT = 50;
const ALLOWED_Q_FIELDS = new Set(['SCIENTIFIC', 'VERNACULAR']);
const ALLOWED_STATUSES = new Set(['ACCEPTED', 'DOUBTFUL', 'SYNONYM', 'HETEROTYPIC_SYNONYM', 'HOMOTYPIC_SYNONYM']);

function clampLimit(raw: string | null, fallback: number): string {
  const parsed = raw == null ? fallback : Number.parseInt(raw, 10);
  const value = Number.isFinite(parsed) ? parsed : fallback;
  return String(Math.min(MAX_LIMIT, Math.max(1, value)));
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim().slice(0, MAX_QUERY_LENGTH);
  const rawQField = request.nextUrl.searchParams.get('qField')?.trim().toUpperCase() ?? 'VERNACULAR';
  const rawStatus = request.nextUrl.searchParams.get('status')?.trim().toUpperCase() ?? 'ACCEPTED';
  const qField = ALLOWED_Q_FIELDS.has(rawQField) ? rawQField : 'VERNACULAR';
  const status = ALLOWED_STATUSES.has(rawStatus) ? rawStatus : 'ACCEPTED';
  const limit = clampLimit(request.nextUrl.searchParams.get('limit'), 20);

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
