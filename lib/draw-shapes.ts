/**
 * Helpers for region draw tools (polygon / rectangle / circle).
 * Circles are approximated as regular polygons so they reuse the existing WKT pipeline.
 */

import type { LonLat } from './geometry';
import { boundsFromCoords } from './geometry';
import type { DrawnRegion } from './geometry';

export type DrawShapeMode = 'polygon' | 'rectangle' | 'circle';

/** Mean Earth radius (WGS84 semi-major) used for geodesic circle approximation. */
const EARTH_RADIUS_M = 6378137;

const CIRCLE_SEGMENTS = 64;

/** Approximate great-circle distance in metres between two lon/lat points. */
export function haversineMeters(a: LonLat, b: LonLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const sLat1 = toRad(lat1);
  const sLat2 = toRad(lat2);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(sLat1) * Math.cos(sLat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Destination point given a start, distance (m), and bearing (degrees clockwise from north).
 */
export function destinationPoint(start: LonLat, distanceM: number, bearingDeg: number): LonLat {
  const [lonDeg, latDeg] = start;
  const δ = distanceM / EARTH_RADIUS_M;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (latDeg * Math.PI) / 180;
  const λ1 = (lonDeg * Math.PI) / 180;
  const sinφ1 = Math.sin(φ1);
  const cosφ1 = Math.cos(φ1);
  const sinδ = Math.sin(δ);
  const cosδ = Math.cos(δ);
  const sinφ2 = sinφ1 * cosδ + cosφ1 * sinδ * Math.cos(θ);
  const φ2 = Math.asin(Math.min(1, Math.max(-1, sinφ2)));
  const λ2 =
    λ1 + Math.atan2(Math.sin(θ) * sinδ * cosφ1, cosδ - sinφ1 * Math.sin(φ2));
  let lon = (λ2 * 180) / Math.PI;
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  return [lon, (φ2 * 180) / Math.PI];
}

/** Axis-aligned rectangle from two opposite corners (handles antimeridian via unwrap in boundsFromCoords). */
export function rectangleFromCorners(a: LonLat, b: LonLat): LonLat[] {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const south = Math.min(lat1, lat2);
  const north = Math.max(lat1, lat2);
  // Prefer the shorter longitude span when corners straddle ±180.
  let west = lon1;
  let east = lon2;
  let span = east - west;
  if (span > 180) {
    west = lon2;
    east = lon1;
    span = east - west;
  } else if (span < -180) {
    // lon2 is west of lon1 across the antimeridian
    west = lon1;
    east = lon2;
  } else if (span < 0) {
    west = lon2;
    east = lon1;
  }
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
  ];
}

/** Approximate a geodesic circle as a closed-enough open ring (caller closes for WKT). */
export function circleToPolygon(
  center: LonLat,
  radiusM: number,
  segments = CIRCLE_SEGMENTS
): LonLat[] {
  if (!(radiusM > 0) || !Number.isFinite(radiusM)) return [];
  const n = Math.max(8, Math.floor(segments));
  const ring: LonLat[] = [];
  for (let i = 0; i < n; i++) {
    const bearing = (360 * i) / n;
    ring.push(destinationPoint(center, radiusM, bearing));
  }
  return ring;
}

export function drawnRegionFromPolygon(polygon: LonLat[]): DrawnRegion | null {
  if (polygon.length < 3) return null;
  return {
    bounds: boundsFromCoords(polygon),
    polygon,
  };
}

export function drawnRegionFromRectangle(a: LonLat, b: LonLat): DrawnRegion | null {
  const polygon = rectangleFromCorners(a, b);
  const bounds = boundsFromCoords(polygon);
  // Degenerate (zero area) shapes are not useful as a filter region.
  if (bounds.north === bounds.south) return null;
  if (bounds.west === bounds.east) return null;
  return { bounds, polygon };
}

export function drawnRegionFromCircle(center: LonLat, edge: LonLat): DrawnRegion | null {
  const radiusM = haversineMeters(center, edge);
  if (radiusM < 1) return null;
  const polygon = circleToPolygon(center, radiusM);
  return drawnRegionFromPolygon(polygon);
}
