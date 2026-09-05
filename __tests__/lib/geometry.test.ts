import {
  boundsToWktPolygon,
  rectangleToBounds,
  geoJsonBboxToBounds,
  coordsToWktPolygon,
  pointInPolygon,
  pointInBounds,
  boundsFromCoords,
  padBounds,
  splitPolygonAtAntimeridian,
} from '@/lib/geometry';

/** Shoelace signed area of a closed "lon lat, lon lat" WKT ring; positive = counter-clockwise. */
function wktRingSignedArea(ring: string): number {
  const pts = ring.split(',').map((p) => p.trim().split(' ').map(Number));
  let area = 0;
  for (let i = 0; i < pts.length - 1; i++) area += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
  return area / 2;
}

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
      expect(wkt.startsWith('POLYGON((10 58') && wkt.endsWith('10 58))')).toBe(true); // closed
      expect(wktRingSignedArea(wkt.slice('POLYGON(('.length, -2))).toBeGreaterThan(0);
    });

    it('splits antimeridian-spanning bounds into a MULTIPOLYGON', () => {
      const wkt = boundsToWktPolygon({ west: 170, south: -50, east: -170, north: -30 });
      expect(wkt).toMatch(/^MULTIPOLYGON\(/);
      expect(wkt).toContain('170 -50');
      expect(wkt).toContain('180 -50');
      expect(wkt).toContain('-180 -50');
      expect(wkt).toContain('-170 -30');
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

  describe('coordsToWktPolygon', () => {
    it('produces closed counter-clockwise WKT from vertices', () => {
      const wkt = coordsToWktPolygon([
        [10, 58],
        [20, 58],
        [20, 62],
        [10, 62],
      ]);
      expect(wkt).toMatch(/^POLYGON\(\(/);
      expect(wkt).toContain('10 58');
      expect(wkt).toContain('20 62');
    });

    it('reverses clockwise input', () => {
      const wkt = coordsToWktPolygon([
        [10, 58],
        [10, 62],
        [20, 62],
        [20, 58],
      ]);
      expect(wktRingSignedArea(wkt.slice('POLYGON(('.length, -2))).toBeGreaterThan(0);
    });

    it('splits polygons crossing the antimeridian into a MULTIPOLYGON within [-180, 180]', () => {
      const wkt = coordsToWktPolygon([
        [170, -40],
        [-170, -40],
        [-170, -30],
        [170, -30],
      ]);
      expect(wkt).toMatch(/^MULTIPOLYGON\(/);
      const lons = [...wkt.matchAll(/(-?\d+(?:\.\d+)?) -?\d+/g)].map((m) => Number(m[1]));
      expect(lons.every((l) => l >= -180 && l <= 180)).toBe(true);
      expect(lons).toContain(180);
      expect(lons).toContain(-180);
    });
  });

  describe('splitPolygonAtAntimeridian', () => {
    it('returns the input ring unchanged when it does not cross', () => {
      const rings = splitPolygonAtAntimeridian([
        [0, 0],
        [10, 0],
        [10, 10],
      ]);
      expect(rings).toHaveLength(1);
      expect(rings[0]).toHaveLength(3);
    });

    it('yields two rings with correct latitude at the cut for a crossing triangle', () => {
      const rings = splitPolygonAtAntimeridian([
        [170, 0],
        [-170, 0],
        [-170, 10],
      ]);
      expect(rings).toHaveLength(2);
      const cutLats = rings.flatMap((r) => r.filter(([lon]) => Math.abs(lon) === 180).map(([, lat]) => lat));
      // Hypotenuse from (170,0) to (-170,10) crosses 180 at lat 5.
      expect(cutLats).toEqual(expect.arrayContaining([0, 5]));
    });
  });

  describe('pointInPolygon', () => {
    const square: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];

    it('returns true for points inside', () => {
      expect(pointInPolygon(5, 5, square)).toBe(true);
    });

    it('returns false for points outside', () => {
      expect(pointInPolygon(15, 5, square)).toBe(false);
    });

    it('handles polygons that cross the antimeridian', () => {
      const fiji: [number, number][] = [
        [175, -20],
        [-175, -20],
        [-175, -15],
        [175, -15],
      ];
      expect(pointInPolygon(179, -17, fiji)).toBe(true);
      expect(pointInPolygon(-179, -17, fiji)).toBe(true);
      expect(pointInPolygon(0, -17, fiji)).toBe(false);
      expect(pointInPolygon(170, -17, fiji)).toBe(false);
    });
  });

  describe('pointInBounds', () => {
    it('handles bounds that span the antimeridian', () => {
      const b = { west: 170, south: -50, east: -170, north: -30 };
      expect(pointInBounds(179, -40, b)).toBe(true);
      expect(pointInBounds(-179, -40, b)).toBe(true);
      expect(pointInBounds(0, -40, b)).toBe(false);
      expect(pointInBounds(179, 0, b)).toBe(false);
    });
  });

  describe('boundsFromCoords', () => {
    it('computes bounding box from vertices', () => {
      const b = boundsFromCoords([
        [10, 58],
        [20, 62],
        [15, 60],
      ]);
      expect(b).toEqual({ west: 10, south: 58, east: 20, north: 62 });
    });

    it('returns west > east for antimeridian-crossing vertices', () => {
      const b = boundsFromCoords([
        [170, -40],
        [-170, -40],
        [-175, -30],
      ]);
      expect(b).toEqual({ west: 170, south: -40, east: -170, north: -30 });
    });

    it('handles many vertices without exceeding argument limits', () => {
      const coords: [number, number][] = Array.from({ length: 200_000 }, (_, i) => [(i % 360) - 180, (i % 180) - 90]);
      expect(() => boundsFromCoords(coords)).not.toThrow();
    });
  });

  describe('padBounds', () => {
    it('clamps latitude to the poles and longitude to the globe', () => {
      const b = padBounds({ west: -179, south: -89, east: 179, north: 89 });
      expect(b).toEqual({ west: -180, south: -90, east: 180, north: 90 });
    });

    it('wraps longitude padding across the antimeridian', () => {
      const b = padBounds({ west: 170, south: 0, east: 179, north: 10 }, 0.5, 0.01);
      expect(b.west).toBeCloseTo(165.5);
      expect(b.east).toBeCloseTo(-176.5);
    });
  });
});
