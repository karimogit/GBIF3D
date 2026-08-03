import * as Cesium from 'cesium';

/** Base map types for View menu (Cesium Ion/Bing, OSM, CartoDB, OpenTopoMap). */
export type BaseMapType =
  | 'bing-aerial'
  | 'bing-aerial-labels'
  | 'bing-road'
  | 'osm'
  | 'positron'
  | 'dark-matter'
  | 'opentopomap';

export type SceneModeType = '3D' | '2D';

let defaultImageryProvider: Cesium.ImageryProvider | undefined;

/** Lazily construct on the client to avoid Cesium constructors during SSR. */
export function getDefaultImageryProvider(): Cesium.ImageryProvider | undefined {
  if (typeof window === 'undefined') return undefined;
  if (!defaultImageryProvider) {
    defaultImageryProvider = new Cesium.OpenStreetMapImageryProvider({
      url: 'https://tile.openstreetmap.org/',
    });
  }
  return defaultImageryProvider;
}

export function createImageryProvider(type: BaseMapType): Cesium.ImageryProvider {
  switch (type) {
    case 'positron':
      return new Cesium.UrlTemplateImageryProvider({
        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        subdomains: ['a', 'b', 'c', 'd'],
        credit: 'Map tiles by CartoDB, under CC BY 3.0. Data by OpenStreetMap, under ODbL.',
      });
    case 'dark-matter':
      return new Cesium.UrlTemplateImageryProvider({
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        subdomains: ['a', 'b', 'c', 'd'],
        credit: 'Map tiles by CartoDB, under CC BY 3.0. Data by OpenStreetMap, under ODbL.',
      });
    case 'opentopomap':
      return new Cesium.UrlTemplateImageryProvider({
        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        subdomains: ['a', 'b', 'c'],
        credit: 'Map tiles: © OpenTopoMap (CC-BY-SA)',
      });
    case 'bing-aerial':
    case 'bing-aerial-labels':
    case 'bing-road':
    case 'osm':
    default:
      return new Cesium.OpenStreetMapImageryProvider({
        url: 'https://tile.openstreetmap.org/',
      });
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
