/**
 * Geometry utilities for view bounds and WKT polygons (GBIF expects lon/lat, counter-clockwise)
 */

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** Longitude-latitude pair */
export type LonLat = [number, number];

export interface DrawnRegion {
  bounds: Bounds;
  /** Polygon vertices as [lon, lat]; when absent the region is a bounding rectangle. */
  polygon?: LonLat[];
}

/**
 * Create a WKT POLYGON from bounding box for GBIF geometry parameter.
 * GBIF requires: longitude-latitude order, counter-clockwise outer ring, closed (first point = last point).
 */
export function boundsToWktPolygon(bounds: Bounds): string {
  const { west, south, east, north } = bounds;
  // Counter-clockwise: start SW -> NW -> NE -> SE -> back to SW
  const ring = [
    [west, south],
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ];
  const wkt = `POLYGON((${ring.map(([lon, lat]) => `${lon} ${lat}`).join(', ')}))`;
  return wkt;
}

/**
 * Create bounds from Cesium rectangle (radians) or from min/max lon/lat in degrees.
 */
export function rectangleToBounds(
  west: number,
  south: number,
  east: number,
  north: number,
  inRadians = false
): Bounds {
  const toDeg = inRadians ? (r: number) => (r * 180) / Math.PI : (d: number) => d;
  return {
    west: toDeg(west),
    south: toDeg(south),
    east: toDeg(east),
    north: toDeg(north),
  };
}

/**
 * GeoJSON-style bbox [west, south, east, north] to Bounds
 */
export function geoJsonBboxToBounds(bbox: number[]): Bounds {
  if (bbox.length < 4) {
    throw new Error('bbox must have at least 4 elements [west, south, east, north]');
  }
  const [west, south, east, north] = bbox;
  return { west, south, east, north };
}

/**
 * Whether a point (lon, lat) lies inside the given bounds (inclusive).
 */
export function pointInBounds(
  lon: number,
  lat: number,
  bounds: Bounds
): boolean {
  const { west, south, east, north } = bounds;
  return lon >= west && lon <= east && lat >= south && lat <= north;
}

/**
 * Bbox from coordinates [minLon, minLat, maxLon, maxLat]
 */
export function getBboxFromCoords(
  coords: LonLat[]
): [number, number, number, number] {
  if (coords.length === 0) return [0, 0, 0, 0];
  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  return [
    Math.min(...lons),
    Math.min(...lats),
    Math.max(...lons),
    Math.max(...lats),
  ];
}

/** Add padding around bounds for nicer map framing (fraction of span, with minimum degrees). */
export function padBounds(bounds: Bounds, fraction = 0.1, minPad = 0.01): Bounds {
  const lonSpan = bounds.east - bounds.west;
  const latSpan = bounds.north - bounds.south;
  const padLon = Math.max(lonSpan * fraction, minPad);
  const padLat = Math.max(latSpan * fraction, minPad);
  return {
    west: bounds.west - padLon,
    south: bounds.south - padLat,
    east: bounds.east + padLon,
    north: bounds.north + padLat,
  };
}

/** Bounding box from polygon or polyline vertices. */
export function boundsFromCoords(coords: LonLat[]): Bounds {
  const [west, south, east, north] = getBboxFromCoords(coords);
  return { west, south, east, north };
}

function ensureClosedRing(coords: LonLat[]): LonLat[] {
  if (coords.length === 0) return coords;
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return coords;
  return [...coords, first];
}

/** Signed area; positive means counter-clockwise in lon/lat space. */
function ringSignedArea(ring: LonLat[]): number {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

function ensureCounterClockwise(ring: LonLat[]): LonLat[] {
  if (ringSignedArea(ring) < 0) return [...ring].reverse();
  return ring;
}

/**
 * Create a WKT POLYGON from arbitrary vertices (closes ring, ensures counter-clockwise).
 */
export function coordsToWktPolygon(coords: LonLat[]): string {
  if (coords.length < 3) {
    throw new Error('Polygon must have at least 3 vertices');
  }
  const ring = ensureCounterClockwise(ensureClosedRing(coords));
  return `POLYGON((${ring.map(([lon, lat]) => `${lon} ${lat}`).join(', ')}))`;
}

/**
 * Ray-casting point-in-polygon test (lon/lat coordinates).
 */
export function pointInPolygon(lon: number, lat: number, polygon: LonLat[]): boolean {
  if (polygon.length < 3) return false;
  const ring = ensureClosedRing(polygon);
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
