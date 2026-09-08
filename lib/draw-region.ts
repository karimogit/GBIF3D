import {
  circleToPolygon,
  drawnRegionFromCircle,
  drawnRegionFromPolygon,
  drawnRegionFromRectangle,
  haversineMeters,
  rectangleFromCorners,
  type DrawShapeMode,
} from '@/lib/draw-shapes';
import type { DrawnRegion, LonLat } from '@/lib/geometry';
import { boundsFromCoords, boundsLonSpan } from '@/lib/geometry';

export type { DrawShapeMode };

/** Remove consecutive vertices that are within a small fraction of the polygon's extent of each other. */
export function dedupeConsecutiveVertices(vertices: LonLat[]): LonLat[] {
  if (vertices.length < 2) return vertices;
  const bounds = boundsFromCoords(vertices);
  const tolerance = Math.max(
    1e-6,
    Math.max(boundsLonSpan(bounds), bounds.north - bounds.south) * 1e-3
  );
  const out: LonLat[] = [vertices[0]];
  for (let i = 1; i < vertices.length; i++) {
    const [px, py] = out[out.length - 1];
    const [x, y] = vertices[i];
    if (Math.abs(x - px) > tolerance || Math.abs(y - py) > tolerance) out.push(vertices[i]);
  }
  const [fx, fy] = out[0];
  const [lx, ly] = out[out.length - 1];
  if (out.length > 1 && Math.abs(fx - lx) <= tolerance && Math.abs(fy - ly) <= tolerance) out.pop();
  return out;
}

export function finishPolygonVertices(vertices: LonLat[]): DrawnRegion | null {
  return drawnRegionFromPolygon(dedupeConsecutiveVertices(vertices));
}

export function previewVerticesForShape(
  mode: DrawShapeMode,
  anchor: LonLat | null,
  cursor: LonLat | null,
  polygonVertices: LonLat[]
): LonLat[] {
  if (mode === 'polygon') return polygonVertices;
  if (!anchor || !cursor) return anchor ? [anchor] : [];
  if (mode === 'rectangle') return rectangleFromCorners(anchor, cursor);
  const radiusM = haversineMeters(anchor, cursor);
  if (radiusM < 1) return [anchor];
  return circleToPolygon(anchor, radiusM);
}

export function finishTwoPointShape(
  mode: 'rectangle' | 'circle',
  anchor: LonLat,
  edge: LonLat
): DrawnRegion | null {
  if (mode === 'rectangle') return drawnRegionFromRectangle(anchor, edge);
  return drawnRegionFromCircle(anchor, edge);
}
