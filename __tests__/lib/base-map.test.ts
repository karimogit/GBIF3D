import { VALID_BASE_MAPS, normalizeBaseMapId, toImageryBaseMap } from '@/lib/base-map';

describe('base-map', () => {
  it('does not include Carto styles', () => {
    expect(VALID_BASE_MAPS).toEqual(['bing', 'osm', 'opentopomap']);
  });

  it('maps current ids through and remaps removed Carto ids', () => {
    expect(normalizeBaseMapId('osm', 'opentopomap')).toBe('osm');
    expect(normalizeBaseMapId('bing', 'opentopomap')).toBe('bing');
    expect(normalizeBaseMapId('opentopomap', 'bing')).toBe('opentopomap');
    expect(normalizeBaseMapId('positron', 'bing')).toBe('opentopomap');
    expect(normalizeBaseMapId('dark-matter', 'bing')).toBe('opentopomap');
  });

  it('falls back for missing or unknown ids', () => {
    expect(normalizeBaseMapId(null, 'opentopomap')).toBe('opentopomap');
    expect(normalizeBaseMapId(undefined, 'bing')).toBe('bing');
    expect(normalizeBaseMapId('not-a-map', 'opentopomap')).toBe('opentopomap');
  });

  it('maps bing UI id to Ion aerial imagery key', () => {
    expect(toImageryBaseMap('bing')).toBe('bing-aerial');
    expect(toImageryBaseMap('osm')).toBe('osm');
    expect(toImageryBaseMap('opentopomap')).toBe('opentopomap');
  });
});
