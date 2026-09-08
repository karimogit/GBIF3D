import * as Cesium from 'cesium';

/** Base map types for View menu (Cesium Ion/Bing, OSM, OpenTopoMap). */
export type BaseMapType =
  | 'bing-aerial'
  | 'bing-aerial-labels'
  | 'bing-road'
  | 'osm'
  | 'opentopomap';

export type SceneModeType = '3D' | '2D';

/** Free default basemap (OpenTopoMap) — avoids OSMF tile.openstreetmap.org usage policy. */
export const DEFAULT_BASE_MAP: BaseMapType = 'opentopomap';

let defaultImageryProvider: Cesium.ImageryProvider | undefined;

/** Lazily construct on the client to avoid Cesium constructors during SSR. */
export function getDefaultImageryProvider(): Cesium.ImageryProvider | undefined {
  if (typeof window === 'undefined') return undefined;
  if (!defaultImageryProvider) {
    defaultImageryProvider = createImageryProvider(DEFAULT_BASE_MAP);
  }
  return defaultImageryProvider;
}

export function createImageryProvider(type: BaseMapType): Cesium.ImageryProvider {
  switch (type) {
    case 'opentopomap':
      return new Cesium.UrlTemplateImageryProvider({
        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        subdomains: ['a', 'b', 'c'],
        credit: 'Map tiles: © OpenTopoMap (CC-BY-SA)',
      });
    case 'osm':
      // Explicit OSM choice only (light use); default basemap is OpenTopoMap.
      return new Cesium.OpenStreetMapImageryProvider({
        url: 'https://tile.openstreetmap.org/',
      });
    case 'bing-aerial':
    case 'bing-aerial-labels':
    case 'bing-road':
    default:
      return createImageryProvider(DEFAULT_BASE_MAP);
  }
}

export function getIonImageryStyle(type: BaseMapType): Cesium.IonWorldImageryStyle | null {
  switch (type) {
    case 'bing-aerial':
      return Cesium.IonWorldImageryStyle.AERIAL;
    case 'bing-aerial-labels':
      return Cesium.IonWorldImageryStyle.AERIAL_WITH_LABELS;
    case 'bing-road':
      return Cesium.IonWorldImageryStyle.ROAD;
    default:
      return null;
  }
}
