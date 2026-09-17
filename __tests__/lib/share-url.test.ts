import {
  buildShareUrl,
  decodeShareUrlState,
  encodeShareUrlState,
  hasShareParams,
} from '@/lib/share-url';

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
});
