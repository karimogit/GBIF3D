/**
 * Geometry utilities for view bounds and WKT polygons (GBIF expects lon/lat, counter-clockwise)
 */

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
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
 * Bbox from coordinates [minLon, minLat, maxLon, maxLat]
 */
export function getBboxFromCoords(
  coords: [number, number][]
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
