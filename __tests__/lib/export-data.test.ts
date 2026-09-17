import { csvCell, occurrencesToCSV, occurrencesToGeoJSON, pdfSnapshotFrameBounds } from '@/lib/export-data';
import type { GBIFOccurrence } from '@/types/gbif';

const occ = (over: Partial<GBIFOccurrence>): GBIFOccurrence => ({ key: 1, decimalLatitude: 1, decimalLongitude: 2, ...over });

describe('export-data', () => {
  describe('csvCell', () => {
    it('neutralises spreadsheet formulas but leaves numbers alone', () => {
      expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
      expect(csvCell('@cmd')).toBe(`'@cmd`);
      expect(csvCell(-33.5)).toBe('-33.5');
      expect(csvCell('-33.5')).toBe('-33.5');
      expect(csvCell('a,b')).toBe('"a,b"');
    });
  });

  describe('occurrencesToCSV', () => {
    it('emits region metadata as columns rather than comment lines', () => {
      const csv = occurrencesToCSV(
        [occ({ scientificName: 'Puma concolor' })],
        { west: 0, south: 0, east: 1, north: 1 },
        'Test region'
      );
      const [header, row] = csv.split('\r\n');
      expect(header.startsWith('#')).toBe(false);
      expect(header.split(',')).toEqual(expect.arrayContaining(['regionName', 'regionWkt']));
      expect(row).toContain('Test region');
      expect(row).toContain('POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))');
    });

    it('has one row per occurrence and consistent column count', () => {
      const csv = occurrencesToCSV([occ({}), occ({ key: 2, locality: 'x,y' })]);
      const lines = csv.split('\r\n');
      expect(lines).toHaveLength(3);
      const width = lines[0].split(',').length;
      expect(lines[1].split(',').length).toBe(width);
    });
  });

  describe('pdfSnapshotFrameBounds', () => {
    it('does not reframe the camera for visible-on-map exports', () => {
      expect(
        pdfSnapshotFrameBounds(
          'visible',
          [occ({ decimalLatitude: 59, decimalLongitude: 18 })],
          { west: 0, south: 0, east: 1, north: 1 }
        )
      ).toBeUndefined();
    });

    it('frames all-data exports to the selected region or occurrence bounds', () => {
      const region = { west: 10, south: 20, east: 30, north: 40 };
      const framedRegion = pdfSnapshotFrameBounds(
        'all',
        [occ({ decimalLatitude: 59, decimalLongitude: 18 })],
        region
      );
      expect(framedRegion).toBeDefined();
      expect(framedRegion!.west).toBeLessThan(region.west);
      expect(framedRegion!.east).toBeGreaterThan(region.east);

      const framed = pdfSnapshotFrameBounds(
        'all',
        [occ({ decimalLatitude: 59, decimalLongitude: 18 }), occ({ key: 2, decimalLatitude: 60, decimalLongitude: 19 })],
        null
      );
      expect(framed).toEqual(expect.objectContaining({ west: expect.any(Number), east: expect.any(Number) }));
    });
  });

  describe('occurrencesToGeoJSON', () => {
    it('writes a counter-clockwise polygon for the region', () => {
      const fc = JSON.parse(occurrencesToGeoJSON([occ({})], { west: 0, south: 0, east: 10, north: 10 }));
      const region = fc.features.find((f: { properties: { type?: string } }) => f.properties.type === 'region');
      expect(region.geometry.type).toBe('Polygon');
      const ring: number[][] = region.geometry.coordinates[0];
      let area = 0;
      for (let i = 0; i < ring.length - 1; i++) area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
      expect(area).toBeGreaterThan(0);
    });

    it('splits antimeridian-crossing regions into a MultiPolygon', () => {
      const fc = JSON.parse(occurrencesToGeoJSON([], { west: 170, south: -10, east: -170, north: 10 }));
      expect(fc.features[0].geometry.type).toBe('MultiPolygon');
      expect(fc.features[0].geometry.coordinates).toHaveLength(2);
    });
  });
});
