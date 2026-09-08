import { getDisplayedOccurrences } from '@/lib/displayed-occurrences';
import type { GBIFOccurrence } from '@/types/gbif';
import type { Bounds, LonLat } from '@/lib/geometry';

function occ(
  key: number,
  lon: number,
  lat: number,
  extra: Partial<GBIFOccurrence> = {}
): GBIFOccurrence {
  return { key, decimalLongitude: lon, decimalLatitude: lat, ...extra };
}

describe('getDisplayedOccurrences', () => {
  const sweden: Bounds = { west: 10, south: 55, east: 25, north: 70 };

  it('filters live occurrences by region bounds', () => {
    const live = [occ(1, 15, 60), occ(2, 0, 50)];
    const result = getDisplayedOccurrences(live, [], sweden, null, null);
    expect(result.map((o) => o.key)).toEqual([1]);
  });

  it('filters by drawn polygon when provided', () => {
    // Small triangle around (15, 60)
    const polygon: LonLat[] = [
      [14, 59],
      [16, 59],
      [15, 61],
      [14, 59],
    ];
    const live = [occ(1, 15, 60), occ(2, 20, 65)];
    const result = getDisplayedOccurrences(live, [], sweden, null, null, polygon);
    expect(result.map((o) => o.key)).toEqual([1]);
  });

  it('filters by year and month combinations', () => {
    const live = [
      occ(1, 15, 60, { year: 2020, month: 5 }),
      occ(2, 15, 60, { year: 2020, month: 6 }),
      occ(3, 15, 60, { year: 2021, month: 5 }),
      occ(4, 15, 60, { eventDate: '2020-05-12' }),
    ];
    expect(getDisplayedOccurrences(live, [], sweden, 2020, null).map((o) => o.key)).toEqual([
      1, 2, 4,
    ]);
    expect(getDisplayedOccurrences(live, [], sweden, 2020, 5).map((o) => o.key)).toEqual([1, 4]);
  });

  it('always includes imported occurrences (bypasses region filter)', () => {
    const live = [occ(1, 15, 60)];
    const imported = [occ(-2, 0, 0, { scientificName: 'Imported' })];
    const result = getDisplayedOccurrences(live, imported, sweden, null, null);
    expect(result.map((o) => o.key).sort()).toEqual([-2, 1]);
  });

  it('merges saved occurrences even when not in the live set', () => {
    const live = [occ(1, 15, 60)];
    const saved = [occ(99, 12, 61, { scientificName: 'Saved' })];
    const result = getDisplayedOccurrences(live, [], sweden, null, null, null, saved);
    expect(result.map((o) => o.key).sort()).toEqual([1, 99]);
  });

  it('does not duplicate a saved occurrence already present in live', () => {
    const live = [occ(1, 15, 60, { scientificName: 'Live' })];
    const saved = [occ(1, 15, 60, { scientificName: 'SavedCopy' })];
    const result = getDisplayedOccurrences(live, [], sweden, null, null, null, saved);
    expect(result).toHaveLength(1);
    expect(result[0].scientificName).toBe('Live');
  });
});
