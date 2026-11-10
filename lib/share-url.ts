/**
 * Encode/decode app state in URL query params for shareable links.
 */
import type { OccurrenceFilters, SelectedSpeciesOption } from '@/types/gbif';
import type { BaseMapId } from '@/lib/base-map';
import { normalizeBaseMapId } from '@/lib/base-map';
import {
  clampOccurrenceLimit,
  DEFAULT_OCCURRENCE_LIMIT,
  isBasisOfRecord,
  isContinent,
  isDatasetKey,
  isIucnCategory,
  MAX_TAXON_FILTERS,
} from '@/lib/gbif';
import { boundsFromCoords, type Bounds, type LonLat } from '@/lib/geometry';
import { normalizeEventDateRange } from '@/lib/occurrence-date';

export interface ShareUrlState {
  selectedRegionId?: string;
  placeSearchResult?: { name: string; bounds: Bounds; countryCode?: string } | null;
  /** Polygon for a drawn region. Omitted for predefined regions and favorites. */
  drawnPolygon?: LonLat[] | null;
  /** Bounds for a drawn region when the polygon itself is not shared. */
  drawnBounds?: Bounds | null;
  filters?: Partial<OccurrenceFilters>;
  selectedYear?: number | null;
  selectedMonth?: number | null;
  sceneMode?: '3D' | '2D';
  baseMap?: BaseMapId;
}

const MAX_POLYGON_VERTICES = 64;
const MAX_LABEL_LENGTH = 200;

function roundCoord(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return value.includes('%') ? null : value;
  }
}

function isValidBounds(bounds: Bounds): boolean {
  const { west, south, east, north } = bounds;
  if (![west, south, east, north].every((n) => Number.isFinite(n))) return false;
  if (south < -90 || north > 90 || south > north) return false;
  if (west < -180 || west > 180 || east < -180 || east > 180) return false;
  return true;
}

function isValidCoord(lon: number, lat: number): boolean {
  return Number.isFinite(lon) && Number.isFinite(lat) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function openRing(coords: LonLat[]): LonLat[] {
  if (coords.length < 2) return coords;
  const first = coords[0];
  const last = coords[coords.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? coords.slice(0, -1) : coords;
}

function encodePlace(place: { name: string; bounds: Bounds; countryCode?: string }): string | null {
  if (!isValidBounds(place.bounds)) return null;
  const name = place.name.trim();
  if (!name) return null;
  const { west, south, east, north } = place.bounds;
  const parts = [encodeURIComponent(name), west, south, east, north];
  if (place.countryCode && /^[A-Za-z]{2}$/.test(place.countryCode)) {
    parts.push(encodeURIComponent(place.countryCode.toUpperCase()));
  }
  return parts.join('|');
}

function decodePlace(raw: string): { name: string; bounds: Bounds; countryCode?: string } | null {
  const parts = raw.split('|');
  if (parts.length < 5 || parts.length > 6) return null;
  const name = safeDecode(parts[0])?.trim() ?? '';
  if (!name) return null;
  const bounds = {
    west: Number(parts[1]),
    south: Number(parts[2]),
    east: Number(parts[3]),
    north: Number(parts[4]),
  };
  if (!isValidBounds(bounds)) return null;
  const cc = parts[5] ? safeDecode(parts[5])?.trim() : undefined;
  const countryCode = cc && /^[A-Za-z]{2}$/.test(cc) ? cc.toUpperCase() : undefined;
  return {
    name: name.slice(0, MAX_LABEL_LENGTH),
    bounds,
    ...(countryCode ? { countryCode } : {}),
  };
}

function encodePolygon(coords: LonLat[]): string | null {
  const open = openRing(coords);
  if (open.length < 3 || open.length > MAX_POLYGON_VERTICES) return null;
  if (!open.every(([lon, lat]) => isValidCoord(lon, lat))) return null;
  return open.map(([lon, lat]) => `${roundCoord(lon)},${roundCoord(lat)}`).join(';');
}

function decodePolygon(raw: string | null): LonLat[] | null {
  if (!raw) return null;
  const points = raw.split(';');
  if (points.length < 3 || points.length > MAX_POLYGON_VERTICES) return null;
  const coords: LonLat[] = [];
  for (const point of points) {
    const [lonRaw, latRaw] = point.split(',');
    const lon = Number(lonRaw);
    const lat = Number(latRaw);
    if (!isValidCoord(lon, lat)) return null;
    coords.push([lon, lat]);
  }
  return coords;
}

function encodeBounds(bounds: Bounds): string | null {
  if (!isValidBounds(bounds)) return null;
  return [bounds.west, bounds.south, bounds.east, bounds.north].map(roundCoord).join(',');
}

function decodeBounds(raw: string | null): Bounds | null {
  if (!raw) return null;
  const parts = raw.split(',');
  if (parts.length !== 4) return null;
  const bounds = {
    west: Number(parts[0]),
    south: Number(parts[1]),
    east: Number(parts[2]),
    north: Number(parts[3]),
  };
  return isValidBounds(bounds) ? bounds : null;
}

function parsePositiveInt(raw: string): number | null {
  if (!/^\d{1,16}$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

function encodeSpecies(options: SelectedSpeciesOption[] | undefined): string | undefined {
  if (!options?.length) return undefined;
  const limited = options.slice(0, MAX_TAXON_FILTERS).filter((o) => Number.isSafeInteger(o.key) && o.key > 0 && o.label.trim());
  if (!limited.length) return undefined;
  return limited.map((o) => `${o.key}:${encodeURIComponent(o.label.trim().slice(0, MAX_LABEL_LENGTH))}`).join(',');
}

function decodeSpecies(raw: string | null): SelectedSpeciesOption[] | undefined {
  if (!raw) return undefined;
  const out: SelectedSpeciesOption[] = [];
  for (const part of raw.split(',')) {
    if (out.length >= MAX_TAXON_FILTERS) break;
    const colon = part.indexOf(':');
    if (colon <= 0) continue;
    const key = parsePositiveInt(part.slice(0, colon));
    const label = safeDecode(part.slice(colon + 1))?.trim() ?? '';
    if (key != null && label) out.push({ key, label: label.slice(0, MAX_LABEL_LENGTH) });
  }
  return out.length ? out : undefined;
}

export function encodeShareUrlState(state: ShareUrlState): URLSearchParams {
  const p = new URLSearchParams();
  const drawnPolygon = state.selectedRegionId === 'drawn' ? encodePolygon(state.drawnPolygon ?? []) : null;
  const drawnBounds =
    state.selectedRegionId === 'drawn' && !drawnPolygon && state.drawnBounds
      ? encodeBounds(state.drawnBounds)
      : null;
  if (drawnPolygon) {
    p.set('r', 'drawn');
    p.set('poly', drawnPolygon);
  } else if (drawnBounds) {
    p.set('r', 'drawn');
    p.set('db', drawnBounds);
  } else if (state.selectedRegionId && state.selectedRegionId !== 'drawn') {
    p.set('r', state.selectedRegionId);
  }
  if (state.selectedRegionId === 'place' && state.placeSearchResult) {
    const place = encodePlace(state.placeSearchResult);
    if (place) p.set('place', place);
  }
  const f = state.filters ?? {};
  const encodedSpecies = encodeSpecies(f.selectedSpeciesOptions);
  if (encodedSpecies) p.set('sp', encodedSpecies);
  if (f.taxonKey != null && Number.isSafeInteger(f.taxonKey) && f.taxonKey > 0) p.set('tk', String(f.taxonKey));
  if (f.taxonKeys?.length && !encodedSpecies) {
    const keys = f.taxonKeys.filter((key) => Number.isSafeInteger(key) && key > 0).slice(0, MAX_TAXON_FILTERS);
    if (keys.length) p.set('tks', keys.join(','));
  }
  if (f.eventDate) {
    const normalized = normalizeEventDateRange(f.eventDate);
    if (normalized) p.set('ed', normalized.replace('/', '~'));
  }
  if (f.iucnRedListCategory && isIucnCategory(f.iucnRedListCategory)) p.set('iucn', f.iucnRedListCategory);
  if (f.basisOfRecord && isBasisOfRecord(f.basisOfRecord)) p.set('bor', f.basisOfRecord);
  if (f.continent && isContinent(f.continent.trim().toUpperCase())) p.set('cont', f.continent.trim().toUpperCase());
  if (f.country && /^[A-Za-z]{2}$/.test(f.country.trim())) p.set('co', f.country.trim().toUpperCase());
  if (f.datasetKey && isDatasetKey(f.datasetKey)) p.set('ds', f.datasetKey);
  if (f.institutionCode && /^[A-Za-z0-9._-]{1,64}$/.test(f.institutionCode.trim())) {
    p.set('inst', f.institutionCode.trim());
  }
  if (f.limit != null && f.limit !== DEFAULT_OCCURRENCE_LIMIT) p.set('lim', String(clampOccurrenceLimit(f.limit)));
  if (state.selectedYear != null && state.selectedYear >= 1 && state.selectedYear <= 9999) {
    p.set('y', String(Math.floor(state.selectedYear)));
  }
  if (state.selectedMonth != null && state.selectedMonth >= 1 && state.selectedMonth <= 12) {
    p.set('m', String(Math.floor(state.selectedMonth)));
  }
  if (state.sceneMode && state.sceneMode !== '3D') p.set('view', state.sceneMode);
  if (state.baseMap) p.set('map', state.baseMap);
  return p;
}

export function decodeShareUrlState(
  searchParams: URLSearchParams,
  defaultBaseMap: BaseMapId
): ShareUrlState {
  const state: ShareUrlState = {};
  const region = searchParams.get('r');
  const polygon = decodePolygon(searchParams.get('poly'));
  const drawnBounds = decodeBounds(searchParams.get('db'));
  const placeRaw = searchParams.get('place');
  const place = placeRaw ? decodePlace(placeRaw) : null;
  if (place) {
    state.placeSearchResult = place;
    state.selectedRegionId = 'place';
  } else if (polygon) {
    state.drawnPolygon = polygon;
    state.drawnBounds = boundsFromCoords(polygon);
    state.selectedRegionId = 'drawn';
  } else if (drawnBounds) {
    state.drawnBounds = drawnBounds;
    state.selectedRegionId = 'drawn';
  } else if (region && region !== 'drawn') {
    state.selectedRegionId = region;
  }
  const filters: Partial<OccurrenceFilters> = {};
  const species = decodeSpecies(searchParams.get('sp'));
  if (species) {
    filters.selectedSpeciesOptions = species;
    filters.taxonKeys = species.map((s) => s.key);
  }
  const tk = searchParams.get('tk');
  const taxonKey = tk ? parsePositiveInt(tk) : null;
  if (taxonKey != null) filters.taxonKey = taxonKey;
  const tks = searchParams.get('tks');
  if (tks && !species) {
    const keys: number[] = [];
    for (const part of tks.split(',')) {
      if (keys.length >= MAX_TAXON_FILTERS) break;
      const key = parsePositiveInt(part.trim());
      if (key != null) keys.push(key);
    }
    if (keys.length) filters.taxonKeys = keys;
  }
  const ed = searchParams.get('ed');
  if (ed) {
    const normalized = normalizeEventDateRange(ed.replace('~', '/'));
    if (normalized) filters.eventDate = normalized;
  }
  const iucn = searchParams.get('iucn');
  if (iucn && isIucnCategory(iucn)) filters.iucnRedListCategory = iucn;
  const bor = searchParams.get('bor');
  if (bor && isBasisOfRecord(bor)) filters.basisOfRecord = bor;
  const cont = searchParams.get('cont');
  if (cont && isContinent(cont.trim().toUpperCase())) filters.continent = cont.trim().toUpperCase();
  const co = searchParams.get('co');
  if (co && /^[A-Za-z]{2}$/.test(co.trim())) filters.country = co.trim().toUpperCase();
  const ds = searchParams.get('ds');
  if (ds && isDatasetKey(ds)) filters.datasetKey = ds;
  const inst = searchParams.get('inst');
  if (inst && /^[A-Za-z0-9._-]{1,64}$/.test(inst.trim())) filters.institutionCode = inst.trim();
  const lim = searchParams.get('lim');
  if (lim && /^-?\d+(\.\d+)?$/.test(lim)) filters.limit = clampOccurrenceLimit(lim);
  if (Object.keys(filters).length) state.filters = filters;
  const y = searchParams.get('y');
  const year = y && /^\d{1,4}$/.test(y) ? Number(y) : null;
  if (year != null && year >= 1 && year <= 9999) state.selectedYear = year;
  const m = searchParams.get('m');
  const month = m && /^\d{1,2}$/.test(m) ? Number(m) : null;
  if (month != null && month >= 1 && month <= 12) state.selectedMonth = month;
  const view = searchParams.get('view');
  if (view === '2D' || view === '3D') state.sceneMode = view;
  const map = searchParams.get('map');
  if (map) state.baseMap = normalizeBaseMapId(map, defaultBaseMap);
  return state;
}

export function buildShareUrl(state: ShareUrlState, origin?: string): string {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const params = encodeShareUrlState(state);
  const qs = params.toString();
  return qs ? `${base}/?${qs}` : `${base}/`;
}

/** True when decoded URL params contain shareable view state worth hydrating. */
export function hasShareParams(decoded: ShareUrlState): boolean {
  return Boolean(
    decoded.selectedRegionId ||
      decoded.placeSearchResult ||
      decoded.drawnPolygon ||
      decoded.drawnBounds ||
      decoded.filters ||
      decoded.selectedYear != null ||
      decoded.selectedMonth != null ||
      decoded.sceneMode ||
      decoded.baseMap
  );
}
