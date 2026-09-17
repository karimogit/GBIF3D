/**
 * Encode/decode app state in URL query params for shareable links.
 */
import type { OccurrenceFilters, SelectedSpeciesOption } from '@/types/gbif';
import type { BaseMapId } from '@/lib/base-map';
import { normalizeBaseMapId } from '@/lib/base-map';
import { DEFAULT_OCCURRENCE_LIMIT } from '@/lib/gbif';
import type { Bounds } from '@/lib/geometry';

export interface ShareUrlState {
  selectedRegionId?: string;
  placeSearchResult?: { name: string; bounds: Bounds; countryCode?: string } | null;
  filters?: Partial<OccurrenceFilters>;
  selectedYear?: number | null;
  selectedMonth?: number | null;
  sceneMode?: '3D' | '2D';
  baseMap?: BaseMapId;
}

function encodePlace(place: { name: string; bounds: Bounds; countryCode?: string }): string {
  const { west, south, east, north } = place.bounds;
  const parts = [place.name, west, south, east, north];
  if (place.countryCode) parts.push(place.countryCode);
  return parts.join('|');
}

function decodePlace(raw: string): { name: string; bounds: Bounds; countryCode?: string } | null {
  const parts = raw.split('|');
  if (parts.length < 5) return null;
  const [name, w, s, e, n, cc] = parts;
  const west = Number(w);
  const south = Number(s);
  const east = Number(e);
  const north = Number(n);
  if (![west, south, east, north].every(Number.isFinite)) return null;
  return {
    name,
    bounds: { west, south, east, north },
    ...(cc ? { countryCode: cc.toUpperCase() } : {}),
  };
}

function encodeSpecies(options: SelectedSpeciesOption[] | undefined): string | undefined {
  if (!options?.length) return undefined;
  return options.map((o) => `${o.key}:${encodeURIComponent(o.label)}`).join(',');
}

function decodeSpecies(raw: string | null): SelectedSpeciesOption[] | undefined {
  if (!raw) return undefined;
  const out: SelectedSpeciesOption[] = [];
  for (const part of raw.split(',')) {
    const colon = part.indexOf(':');
    if (colon <= 0) continue;
    const key = Number(part.slice(0, colon));
    const label = decodeURIComponent(part.slice(colon + 1));
    if (Number.isInteger(key) && label) out.push({ key, label });
  }
  return out.length ? out : undefined;
}

export function encodeShareUrlState(state: ShareUrlState): URLSearchParams {
  const p = new URLSearchParams();
  if (state.selectedRegionId) p.set('r', state.selectedRegionId);
  if (state.placeSearchResult) p.set('place', encodePlace(state.placeSearchResult));
  const f = state.filters ?? {};
  const encodedSpecies = encodeSpecies(f.selectedSpeciesOptions);
  if (encodedSpecies) p.set('sp', encodedSpecies);
  if (f.taxonKey != null) p.set('tk', String(f.taxonKey));
  if (f.taxonKeys?.length && !encodedSpecies) p.set('tks', f.taxonKeys.join(','));
  if (f.eventDate) p.set('ed', f.eventDate.replace('/', '~'));
  if (f.iucnRedListCategory) p.set('iucn', f.iucnRedListCategory);
  if (f.basisOfRecord) p.set('bor', f.basisOfRecord);
  if (f.continent) p.set('cont', f.continent);
  if (f.country) p.set('co', f.country);
  if (f.datasetKey) p.set('ds', f.datasetKey);
  if (f.institutionCode) p.set('inst', f.institutionCode);
  if (f.limit != null && f.limit !== DEFAULT_OCCURRENCE_LIMIT) p.set('lim', String(f.limit));
  if (state.selectedYear != null) p.set('y', String(state.selectedYear));
  if (state.selectedMonth != null) p.set('m', String(state.selectedMonth));
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
  if (region) state.selectedRegionId = region;
  const placeRaw = searchParams.get('place');
  if (placeRaw) {
    const place = decodePlace(placeRaw);
    if (place) {
      state.placeSearchResult = place;
      state.selectedRegionId = 'place';
    }
  }
  const filters: Partial<OccurrenceFilters> = {};
  const species = decodeSpecies(searchParams.get('sp'));
  if (species) {
    filters.selectedSpeciesOptions = species;
    filters.taxonKeys = species.map((s) => s.key);
  }
  const tk = searchParams.get('tk');
  if (tk && Number.isInteger(Number(tk))) filters.taxonKey = Number(tk);
  const tks = searchParams.get('tks');
  if (tks && !species) {
    filters.taxonKeys = tks.split(',').map(Number).filter(Number.isInteger);
  }
  const ed = searchParams.get('ed');
  if (ed) filters.eventDate = ed.replace('~', '/');
  const iucn = searchParams.get('iucn');
  if (iucn) filters.iucnRedListCategory = iucn;
  const bor = searchParams.get('bor');
  if (bor) filters.basisOfRecord = bor;
  const cont = searchParams.get('cont');
  if (cont) filters.continent = cont;
  const co = searchParams.get('co');
  if (co) filters.country = co.toUpperCase();
  const ds = searchParams.get('ds');
  if (ds) filters.datasetKey = ds;
  const inst = searchParams.get('inst');
  if (inst) filters.institutionCode = inst;
  const lim = searchParams.get('lim');
  if (lim && Number.isFinite(Number(lim))) filters.limit = Number(lim);
  if (Object.keys(filters).length) state.filters = filters;
  const y = searchParams.get('y');
  if (y && Number.isInteger(Number(y))) state.selectedYear = Number(y);
  const m = searchParams.get('m');
  if (m && Number.isInteger(Number(m))) state.selectedMonth = Number(m);
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
