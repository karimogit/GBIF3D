import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';

const GBIF_OCCURRENCE_URL = 'https://api.gbif.org/v1/occurrence';
const GBIF_IMAGE_CACHE_BASE = 'https://api.gbif.org/v1/image/cache';

interface GBIFMediaItem {
  type?: string;
  identifier?: string;
  format?: string;
}

interface GBIFOccurrenceDetail {
  key: number;
  media?: GBIFMediaItem[];
}

function md5Hex(str: string): string {
  return createHash('md5').update(str, 'utf8').digest('hex');
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ key: string }> }
) {
  const { key } = await context.params;
  const occurrenceKey = Number(key);
  if (!Number.isInteger(occurrenceKey) || occurrenceKey < 1) {
    return NextResponse.json({ error: 'Invalid occurrence key' }, { status: 400 });
  }

  try {
    const res = await fetch(`${GBIF_OCCURRENCE_URL}/${occurrenceKey}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: 'Occurrence not found' },
        { status: res.status === 404 ? 404 : 502 }
      );
    }
    const data = (await res.json()) as GBIFOccurrenceDetail;
    const media = data.media?.filter(
      (m) => m.type === 'StillImage' || m.format?.startsWith('image/')
    );
    const urls: string[] = [];
    const take = Math.min(2, media?.length ?? 0);
    for (let i = 0; i < take && media?.[i]?.identifier; i++) {
      const md5 = md5Hex(media[i].identifier!);
      urls.push(`${GBIF_IMAGE_CACHE_BASE}/200x/occurrence/${occurrenceKey}/media/${md5}`);
    }
    return NextResponse.json({ urls });
  } catch (err) {
    console.error('Occurrence image fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch occurrence' }, { status: 502 });
  }
}
