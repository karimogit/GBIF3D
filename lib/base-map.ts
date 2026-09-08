/** Shared base-map id used by the View menu, page state, and GlobeViewer. */

export const VALID_BASE_MAPS = ['bing', 'osm', 'positron', 'dark-matter', 'opentopomap'] as const;
export type BaseMapId = (typeof VALID_BASE_MAPS)[number];

/** Map UI base-map ids to Cesium imagery provider keys. */
export function toImageryBaseMap(id: BaseMapId):
  | 'bing-aerial'
  | 'osm'
  | 'positron'
  | 'dark-matter'
  | 'opentopomap' {
  return id === 'bing' ? 'bing-aerial' : id;
}
