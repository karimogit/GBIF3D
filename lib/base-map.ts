/** Shared base-map id used by the View menu, page state, and GlobeViewer. */

export const VALID_BASE_MAPS = ['bing', 'osm', 'opentopomap'] as const;
export type BaseMapId = (typeof VALID_BASE_MAPS)[number];

/** Older ids stored in localStorage before Carto styles were removed. */
const LEGACY_BASE_MAPS: Record<string, BaseMapId> = {
  positron: 'opentopomap',
  'dark-matter': 'opentopomap',
};

/** Resolve a stored or incoming basemap id, mapping removed Carto styles to OpenTopoMap. */
export function normalizeBaseMapId(raw: string | undefined | null, fallback: BaseMapId): BaseMapId {
  if (!raw) return fallback;
  if (VALID_BASE_MAPS.includes(raw as BaseMapId)) return raw as BaseMapId;
  return LEGACY_BASE_MAPS[raw] ?? fallback;
}

/** Map UI base-map ids to Cesium imagery provider keys. */
export function toImageryBaseMap(id: BaseMapId): 'bing-aerial' | 'osm' | 'opentopomap' {
  return id === 'bing' ? 'bing-aerial' : id;
}
