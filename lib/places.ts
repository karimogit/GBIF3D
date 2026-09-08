/**
 * Place search types and Photon geocoder feature conversion.
 * @see https://photon.komoot.io
 */

export interface PlaceSearchResult {
  display_name: string;
  place_id: number;
  bounds: { west: number; south: number; east: number; north: number };
  /** ISO 3166-1 alpha-2 country code (e.g. SE, NO) when place is in a country; for API filter */
  country_code?: string;
}

/** GeoJSON-like Photon feature (subset we care about). */
export interface PhotonFeature {
  geometry?: {
    coordinates?: unknown;
  };
  properties?: {
    osm_id?: unknown;
    name?: unknown;
    countrycode?: unknown;
    extent?: unknown;
    city?: unknown;
    state?: unknown;
    country?: unknown;
    [key: string]: unknown;
  };
}

const PAD_DEG = 0.05;

function asFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/**
 * Convert a Photon GeoJSON feature into a PlaceSearchResult.
 * Returns null when osm_id or coordinates are missing/invalid.
 */
export function photonFeatureToResult(feature: PhotonFeature): PlaceSearchResult | null {
  const props = feature?.properties;
  if (!props) return null;

  const osmId = asFiniteNumber(props.osm_id);
  if (osmId == null || !Number.isInteger(osmId)) return null;

  const coords = feature.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lon = asFiniteNumber(coords[0]);
  const lat = asFiniteNumber(coords[1]);
  if (lon == null || lat == null) return null;

  const name = asString(props.name);
  const city = asString(props.city);
  const state = asString(props.state);
  const country = asString(props.country);
  const parts = [name, city, state, country].filter((p): p is string => Boolean(p));
  // Deduplicate consecutive identical parts (e.g. name === city)
  const unique: string[] = [];
  for (const p of parts) {
    if (unique[unique.length - 1] !== p) unique.push(p);
  }
  const display_name = unique.join(', ') || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

  let bounds: PlaceSearchResult['bounds'];
  const extent = props.extent;
  if (Array.isArray(extent) && extent.length >= 4) {
    // Photon extent: [minLon, maxLat, maxLon, minLat]
    const minLon = asFiniteNumber(extent[0]);
    const maxLat = asFiniteNumber(extent[1]);
    const maxLon = asFiniteNumber(extent[2]);
    const minLat = asFiniteNumber(extent[3]);
    if (minLon != null && maxLat != null && maxLon != null && minLat != null) {
      bounds = { west: minLon, south: minLat, east: maxLon, north: maxLat };
    } else {
      bounds = {
        west: lon - PAD_DEG,
        south: lat - PAD_DEG,
        east: lon + PAD_DEG,
        north: lat + PAD_DEG,
      };
    }
  } else {
    bounds = {
      west: lon - PAD_DEG,
      south: lat - PAD_DEG,
      east: lon + PAD_DEG,
      north: lat + PAD_DEG,
    };
  }

  const ccRaw = asString(props.countrycode)?.toUpperCase();
  const country_code = ccRaw && /^[A-Z]{2}$/.test(ccRaw) ? ccRaw : undefined;

  return {
    display_name,
    place_id: osmId,
    bounds,
    ...(country_code ? { country_code } : {}),
  };
}
