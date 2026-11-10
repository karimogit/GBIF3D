import {
  buildShareUrl,
  decodeShareUrlState,
  encodeShareUrlState,
  hasShareParams,
} from '@/lib/share-url';
import { todayIsoDate } from '@/lib/occurrence-date';

describe('share-url', () => {
  it('round-trips region, filters, and timeline state', () => {
    const params = encodeShareUrlState({
      selectedRegionId: 'europe',
      filters: {
        taxonKeys: [212, 359],
        selectedSpeciesOptions: [
          { key: 212, label: 'Aves' },
          { key: 359, label: 'Mammalia' },
        ],
        limit: 2000,
        iucnRedListCategory: 'EN',
        eventDate: '2020-01-01/2024-12-31',
      },
      selectedYear: 2022,
      selectedMonth: 6,
      sceneMode: '2D',
      baseMap: 'opentopomap',
    });
    const decoded = decodeShareUrlState(params, 'opentopomap');
    expect(decoded.selectedRegionId).toBe('europe');
    expect(decoded.filters?.taxonKeys).toEqual([212, 359]);
    expect(decoded.filters?.limit).toBe(2000);
    expect(decoded.filters?.eventDate).toBe('2020-01-01/2024-12-31');
    expect(decoded.selectedYear).toBe(2022);
    expect(decoded.selectedMonth).toBe(6);
    expect(decoded.sceneMode).toBe('2D');
    expect(decoded.baseMap).toBe('opentopomap');
  });

  it('encodes place search bounds', () => {
    const params = encodeShareUrlState({
      selectedRegionId: 'place',
      placeSearchResult: {
        name: 'Paris',
        bounds: { west: 2.2, south: 48.8, east: 2.5, north: 48.9 },
        countryCode: 'FR',
      },
    });
    const decoded = decodeShareUrlState(params, 'opentopomap');
    expect(decoded.placeSearchResult?.name).toBe('Paris');
    expect(decoded.placeSearchResult?.countryCode).toBe('FR');
  });

  it('buildShareUrl produces query string', () => {
    const url = buildShareUrl({ selectedRegionId: 'world' }, 'https://example.com');
    expect(url).toBe('https://example.com/?r=world');
  });

  it('detects when decoded params contain share state', () => {
    expect(hasShareParams({})).toBe(false);
    expect(hasShareParams({ selectedYear: 2020 })).toBe(true);
    expect(hasShareParams({ filters: { taxonKey: 212 } })).toBe(true);
  });

  it('round-trips place names that contain the field delimiter', () => {
    const params = encodeShareUrlState({
      selectedRegionId: 'place',
      placeSearchResult: {
        name: 'A|B',
        bounds: { west: 1, south: 2, east: 3, north: 4 },
        countryCode: 'FR',
      },
    });
    const decoded = decodeShareUrlState(params, 'opentopomap');
    expect(decoded.placeSearchResult?.name).toBe('A|B');
    expect(decoded.placeSearchResult?.bounds).toEqual({ west: 1, south: 2, east: 3, north: 4 });
    expect(decoded.placeSearchResult?.countryCode).toBe('FR');
    expect(decoded.selectedRegionId).toBe('place');
  });

  it('clamps limit, drops invalid timeline values, and caps taxon keys', () => {
    const params = new URLSearchParams({
      lim: '5',
      y: '0',
      m: '13',
      tks: Array.from({ length: 50 }, (_, i) => String(i + 1)).join(','),
      ed: '2024-02-30~2024-03-01',
      iucn: 'NOT_REAL',
      co: 'USA',
    });
    const decoded = decodeShareUrlState(params, 'opentopomap');
    expect(decoded.filters?.limit).toBe(100);
    expect(decoded.selectedYear).toBeUndefined();
    expect(decoded.selectedMonth).toBeUndefined();
    expect(decoded.filters?.taxonKeys).toHaveLength(40);
    expect(decoded.filters?.eventDate).toBeUndefined();
    expect(decoded.filters?.iucnRedListCategory).toBeUndefined();
    expect(decoded.filters?.country).toBeUndefined();
  });

  it('clamps a future event date to today', () => {
    const params = new URLSearchParams({ ed: '2020-01-01~2099-01-01' });
    const decoded = decodeShareUrlState(params, 'opentopomap');
    expect(decoded.filters?.eventDate).toBe(`2020-01-01/${todayIsoDate()}`);
  });

  it('round-trips a drawn polygon and ignores a drawn id with no geometry', () => {
    const polygon: [number, number][] = [
      [10, 50],
      [11, 50],
      [11, 51],
    ];
    const encoded = encodeShareUrlState({
      selectedRegionId: 'drawn',
      drawnPolygon: polygon,
    });
    const decoded = decodeShareUrlState(encoded, 'opentopomap');
    expect(decoded.selectedRegionId).toBe('drawn');
    expect(decoded.drawnPolygon).toEqual(polygon);

    const bare = decodeShareUrlState(new URLSearchParams('r=drawn'), 'opentopomap');
    expect(bare.selectedRegionId).toBeUndefined();
  });

  it('does not let a leftover place search override a drawn region', () => {
    const params = encodeShareUrlState({
      selectedRegionId: 'drawn',
      drawnBounds: { west: 10, south: 50, east: 12, north: 52 },
      placeSearchResult: {
        name: 'Paris',
        bounds: { west: 2, south: 48, east: 3, north: 49 },
      },
    });
    const decoded = decodeShareUrlState(params, 'opentopomap');
    expect(decoded.selectedRegionId).toBe('drawn');
    expect(decoded.placeSearchResult).toBeUndefined();
    expect(params.get('place')).toBeNull();
  });
});
