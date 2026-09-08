import {
  circleToPolygon,
  destinationPoint,
  drawnRegionFromCircle,
  drawnRegionFromRectangle,
  haversineMeters,
  rectangleFromCorners,
} from '@/lib/draw-shapes';
import {
  dedupeConsecutiveVertices,
  finishPolygonVertices,
  finishTwoPointShape,
  previewVerticesForShape,
} from '@/lib/draw-region';

describe('draw-shapes', () => {
  describe('haversineMeters', () => {
    it('is ~0 for identical points', () => {
      expect(haversineMeters([18, 59], [18, 59])).toBeLessThan(1e-6);
    });

    it('is roughly 111 km per degree of latitude', () => {
      const d = haversineMeters([0, 0], [0, 1]);
      expect(d).toBeGreaterThan(110000);
      expect(d).toBeLessThan(112000);
    });
  });

  describe('destinationPoint', () => {
    it('moves north by the requested distance', () => {
      const [lon, lat] = destinationPoint([10, 0], 111319.5, 0);
      expect(lon).toBeCloseTo(10, 3);
      expect(lat).toBeCloseTo(1, 2);
    });
  });

  describe('rectangleFromCorners', () => {
    it('orders corners SW-SE-NE-NW regardless of drag direction', () => {
      expect(rectangleFromCorners([20, 60], [10, 50])).toEqual([
        [10, 50],
        [20, 50],
        [20, 60],
        [10, 60],
      ]);
    });

    it('builds a drawn region with polygon and bounds', () => {
      const region = drawnRegionFromRectangle([10, 50], [20, 60]);
      expect(region).not.toBeNull();
      expect(region!.polygon).toHaveLength(4);
      expect(region!.bounds).toEqual({ west: 10, south: 50, east: 20, north: 60 });
    });

    it('rejects a degenerate rectangle', () => {
      expect(drawnRegionFromRectangle([10, 50], [10, 60])).toBeNull();
    });
  });

  describe('circleToPolygon', () => {
    it('returns the requested number of vertices', () => {
      expect(circleToPolygon([18, 59], 5000, 32)).toHaveLength(32);
    });

    it('keeps vertices roughly one radius from the center', () => {
      const center: [number, number] = [18, 59];
      const ring = circleToPolygon(center, 10000, 16);
      for (const p of ring) {
        expect(haversineMeters(center, p)).toBeGreaterThan(9900);
        expect(haversineMeters(center, p)).toBeLessThan(10100);
      }
    });

    it('builds a drawn region from center + edge', () => {
      const region = drawnRegionFromCircle([0, 0], [0, 0.1]);
      expect(region).not.toBeNull();
      expect(region!.polygon!.length).toBeGreaterThanOrEqual(8);
    });
  });
});

describe('draw-region', () => {
  it('dedupes consecutive near-duplicate vertices', () => {
    expect(
      dedupeConsecutiveVertices([
        [10, 50],
        [10.0000001, 50.0000001],
        [11, 51],
      ])
    ).toEqual([
      [10, 50],
      [11, 51],
    ]);
  });

  it('finishes a polygon with at least 3 vertices', () => {
    const region = finishPolygonVertices([
      [10, 50],
      [11, 50],
      [11, 51],
    ]);
    expect(region?.polygon).toHaveLength(3);
  });

  it('previews rectangle and circle while dragging', () => {
    expect(previewVerticesForShape('rectangle', [10, 50], [12, 52], [])).toHaveLength(4);
    expect(previewVerticesForShape('circle', [10, 50], [10.2, 50], []).length).toBeGreaterThan(8);
    expect(previewVerticesForShape('polygon', null, null, [[1, 2]])).toEqual([[1, 2]]);
  });

  it('finishes two-point shapes', () => {
    expect(finishTwoPointShape('rectangle', [10, 50], [12, 52])?.polygon).toHaveLength(4);
    expect(finishTwoPointShape('circle', [0, 0], [0, 0.05])?.polygon?.length).toBeGreaterThan(8);
  });
});
