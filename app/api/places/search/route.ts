import { NextRequest, NextResponse } from 'next/server';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'GBIF-Globe/1.0 (https://github.com/gbif-globe)';

export interface PlaceSearchResult {
  display_name: string;
  place_id: number;
  bounds: { west: number; south: number; east: number; north: number };
}

interface NominatimItem {
  display_name: string;
  place_id: number;
  boundingbox: [string, string, string, string]; // [south, north, west, east] = [min_lat, max_lat, min_lon, max_lon]
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const params = new URLSearchParams({
    q,
    format: 'json',
    limit: '8',
    addressdetails: '0',
  });

  try {
    const res = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'en',
      },
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      return NextResponse.json({ results: [] }, { status: 502 });
    }
    const data = (await res.json()) as NominatimItem[];
    const results: PlaceSearchResult[] = data.map((item) => {
      const [south, north, west, east] = item.boundingbox;
      return {
        display_name: item.display_name,
        place_id: item.place_id,
        bounds: {
          west: parseFloat(west),
          south: parseFloat(south),
          east: parseFloat(east),
          north: parseFloat(north),
        },
      };
    });
    return NextResponse.json({ results });
  } catch (err) {
    console.error('Places search error:', err);
    return NextResponse.json({ results: [] }, { status: 502 });
  }
}
