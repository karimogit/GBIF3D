/**
 * Geometry utilities for view bounds and WKT polygons (GBIF expects lon/lat, counter-clockwise).
 *
 * Antimeridian convention: a `Bounds` with `west > east` spans the 180° meridian (same as the
 * GeoJSON bbox convention). Polygons are given with longitudes in [-180, 180]; an edge whose
 * longitude jumps by more than 180° is taken to cross the antimeridian.
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

/** Whether the bounds span the antimeridian (west > east). */
export function boundsCrossAntimeridian(bounds: Bounds): boolean {
  return bounds.west > bounds.east;
}

/** Longitude extent in degrees, accounting for antimeridian-spanning bounds. */
export function boundsLonSpan(bounds: Bounds): number {
  const span = bounds.east - bounds.west;
  return span >= 0 ? span : span + 360;
}

function ringToWkt(ring: LonLat[]): string {
  return `(${ring.map(([lon, lat]) => `${lon} ${lat}`).join(', ')})`;
}

/** Counter-clockwise closed rectangle ring: SW -> SE -> NE -> NW -> SW. */
function rectangleRing(west: number, south: number, east: number, north: number): LonLat[] {
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
}

/**
 * Create WKT from a bounding box for the GBIF geometry parameter.
 * GBIF requires: longitude-latitude order, counter-clockwise outer ring, closed (first point = last point).
 * Bounds spanning the antimeridian are emitted as a MULTIPOLYGON of two rectangles.
 */
export function boundsToWktPolygon(bounds: Bounds): string {
  const { west, south, east, north } = bounds;
  if (boundsCrossAntimeridian(bounds)) {
    return `MULTIPOLYGON((${ringToWkt(rectangleRing(west, south, 180, north))}), (${ringToWkt(
      rectangleRing(-180, south, east, north)
    )}))`;
  }
  return `POLYGON(${ringToWkt(rectangleRing(west, south, east, north))})`;
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
export function pointInBounds(lon: number, lat: number, bounds: Bounds): boolean {
  const { west, south, east, north } = bounds;
  if (lat < south || lat > north) return false;
  if (boundsCrossAntimeridian(bounds)) return lon >= west || lon <= east;
  return lon >= west && lon <= east;
}

/**
 * Shift longitudes so consecutive vertices never jump by more than 180°. The result may contain
 * longitudes outside [-180, 180]; the westernmost vertex is kept within [-180, 180).
 */
function unwrapLongitudes(coords: LonLat[]): LonLat[] {
  if (coords.length === 0) return coords;
  const out: LonLat[] = [[coords[0][0], coords[0][1]]];
  for (let i = 1; i < coords.length; i++) {
    let lon = coords[i][0];
    const prev = out[i - 1][0];
    while (lon - prev > 180) lon -= 360;
    while (prev - lon > 180) lon += 360;
    out.push([lon, coords[i][1]]);
  }
  let minLon = Infinity;
  for (const [lon] of out) if (lon < minLon) minLon = lon;
  const shift = minLon < -180 ? 360 : minLon >= 180 ? -360 : 0;
  return shift === 0 ? out : out.map(([lon, lat]) => [lon + shift, lat] as LonLat);
}

/** Wrap a longitude into [-180, 180]. */
function wrapLongitude(lon: number): number {
  if (lon > 180) return lon - 360;
  if (lon < -180) return lon + 360;
  return lon;
}

/**
 * Bbox from coordinates [minLon, minLat, maxLon, maxLat]. Vertex runs that cross the antimeridian
 * yield west > east, following the GeoJSON bbox convention.
 */
export function getBboxFromCoords(coords: LonLat[]): [number, number, number, number] {
  if (coords.length === 0) return [0, 0, 0, 0];
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [lon, lat] of unwrapLongitudes(coords)) {
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  if (east - west >= 360) return [-180, south, 180, north];
  return [west, south, wrapLongitude(east), north];
}

/** Add padding around bounds for nicer map framing (fraction of span, with minimum degrees); clamps to the globe. */
export function padBounds(bounds: Bounds, fraction = 0.1, minPad = 0.01): Bounds {
  const lonSpan = boundsLonSpan(bounds);
  const latSpan = bounds.north - bounds.south;
  const padLon = Math.max(lonSpan * fraction, minPad);
  const padLat = Math.max(latSpan * fraction, minPad);
  if (lonSpan + 2 * padLon >= 360) {
    return {
      west: -180,
      south: Math.max(-90, bounds.south - padLat),
      east: 180,
      north: Math.min(90, bounds.north + padLat),
    };
  }
  return {
    west: wrapLongitude(bounds.west - padLon),
    south: Math.max(-90, bounds.south - padLat),
    east: wrapLongitude(bounds.east + padLon),
    north: Math.min(90, bounds.north + padLat),
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

function stripClosingVertex(coords: LonLat[]): LonLat[] {
  if (coords.length < 2) return coords;
  const first = coords[0];
  const last = coords[coords.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? coords.slice(0, -1) : coords;
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
 * Sutherland–Hodgman clip of an open ring against the half-plane `keep(lon)` bounded by `lon = boundary`.
 */
function clipRingAtLongitude(ring: LonLat[], boundary: number, keep: (lon: number) => boolean): LonLat[] {
  const out: LonLat[] = [];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    const pIn = keep(p[0]);
    const qIn = keep(q[0]);
    if (pIn) out.push(p);
    if (pIn !== qIn) {
      const t = (boundary - p[0]) / (q[0] - p[0]);
      out.push([boundary, p[1] + t * (q[1] - p[1])]);
    }
  }
  return out;
}

/**
 * Split a polygon into rings that each stay within [-180, 180]. Returns a single ring for polygons
 * that don't cross the antimeridian.
 */
export function splitPolygonAtAntimeridian(coords: LonLat[]): LonLat[][] {
  const ring = unwrapLongitudes(stripClosingVertex(coords));
  let maxLon = -Infinity;
  for (const [lon] of ring) if (lon > maxLon) maxLon = lon;
  if (maxLon <= 180) return [ring];
  const westPart = clipRingAtLongitude(ring, 180, (lon) => lon <= 180);
  const eastPart = clipRingAtLongitude(ring, 180, (lon) => lon >= 180).map(
    ([lon, lat]) => [lon - 360, lat] as LonLat
  );
  return [westPart, eastPart].filter((r) => r.length >= 3);
}

/**
 * Create WKT from arbitrary vertices (closes ring, ensures counter-clockwise).
 * Polygons crossing the antimeridian are split into a MULTIPOLYGON.
 */
export function coordsToWktPolygon(coords: LonLat[]): string {
  if (coords.length < 3) {
    throw new Error('Polygon must have at least 3 vertices');
  }
  const rings = splitPolygonAtAntimeridian(coords).map((r) => ensureCounterClockwise(ensureClosedRing(r)));
  if (rings.length === 1) return `POLYGON(${ringToWkt(rings[0])})`;
  return `MULTIPOLYGON(${rings.map((r) => `(${ringToWkt(r)})`).join(', ')})`;
}

/**
 * Ray-casting point-in-polygon test (lon/lat coordinates); handles polygons crossing the antimeridian.
 */
export function pointInPolygon(lon: number, lat: number, polygon: LonLat[]): boolean {
  if (polygon.length < 3) return false;
  const ring = ensureClosedRing(unwrapLongitudes(polygon));
  let minLon = Infinity;
  for (const [x] of ring) if (x < minLon) minLon = x;
  const x0 = lon < minLon ? lon + 360 : lon;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = yi > lat !== yj > lat && x0 < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
