import { boundsToWktPolygon, rectangleToBounds, geoJsonBboxToBounds } from '@/lib/geometry';

describe('geometry', () => {
  describe('boundsToWktPolygon', () => {
    it('produces counter-clockwise WKT polygon', () => {
      const wkt = boundsToWktPolygon({
        west: 10,
        south: 58,
        east: 20,
        north: 62,
      });
      expect(wkt).toMatch(/^POLYGON\(\(/);
      expect(wkt).toContain('10 58');
      expect(wkt).toContain('20 62');
      expect(wkt).toContain('10 58'); // closed
    });

    it('uses longitude-latitude order', () => {
      const wkt = boundsToWktPolygon({ west: -74, south: 40, east: -73, north: 41 });
      expect(wkt).toContain('-74 40');
      expect(wkt).toContain('-73 41');
    });
  });

  describe('rectangleToBounds', () => {
    it('converts degrees to bounds as-is when inRadians is false', () => {
      const b = rectangleToBounds(10, 58, 20, 62, false);
      expect(b).toEqual({ west: 10, south: 58, east: 20, north: 62 });
    });

    it('converts radians to degrees when inRadians is true', () => {
      const b = rectangleToBounds(
        Math.PI / 18,
        (58 * Math.PI) / 180,
        Math.PI / 9,
        (62 * Math.PI) / 180,
        true
      );
      expect(b.west).toBeCloseTo(10);
      expect(b.south).toBeCloseTo(58);
      expect(b.east).toBeCloseTo(20);
      expect(b.north).toBeCloseTo(62);
    });
  });

  describe('geoJsonBboxToBounds', () => {
    it('maps [west, south, east, north] to Bounds', () => {
      const b = geoJsonBboxToBounds([10, 58, 20, 62]);
      expect(b).toEqual({ west: 10, south: 58, east: 20, north: 62 });
    });

    it('throws when bbox has fewer than 4 elements', () => {
      expect(() => geoJsonBboxToBounds([])).toThrow('at least 4 elements');
      expect(() => geoJsonBboxToBounds([1, 2, 3])).toThrow('at least 4 elements');
    });
  });
});
