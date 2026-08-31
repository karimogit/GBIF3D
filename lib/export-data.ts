import type { GBIFOccurrence } from '@/types/gbif';
import { boundsToWktPolygon, getBboxFromCoords, padBounds, type Bounds, type LonLat } from './geometry';

/** Bounding box that covers occurrence points, with padding for map framing. */
export function boundsFromOccurrences(occurrences: GBIFOccurrence[]): Bounds | null {
  const coords: [number, number][] = [];
  for (const o of occurrences) {
    const lon = o.decimalLongitude;
    const lat = o.decimalLatitude;
    if (lon == null || lat == null || !Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    coords.push([lon, lat]);
  }
  if (coords.length === 0) return null;
  const [west, south, east, north] = getBboxFromCoords(coords);
  return padBounds({ west, south, east, north });
}


export type ExportScope = 'visible' | 'all';

export interface ExportDataOptions {
  scope: ExportScope;
  includePolygon: boolean;
}

export type ExportDataFormat = 'geojson' | 'csv' | 'pdf';

interface GeoJsonPointFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: Record<string, unknown>;
}

interface GeoJsonPolygonFeature {
  type: 'Feature';
  geometry: { type: 'Polygon'; coordinates: number[][][] };
  properties: Record<string, unknown>;
}

function boundsToGeoJsonPolygon(bounds: Bounds): GeoJsonPolygonFeature['geometry'] {
  const { west, south, east, north } = bounds;
  return {
    type: 'Polygon',
    coordinates: [
      [
        [west, south],
        [west, north],
        [east, north],
        [east, south],
        [west, south],
      ],
    ],
  };
}

function polygonToGeoJsonPolygon(polygon: LonLat[]): GeoJsonPolygonFeature['geometry'] {
  const ring = [...polygon];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push(first);
  }
  return {
    type: 'Polygon',
    coordinates: [ring],
  };
}

export function occurrencesToGeoJSON(
  occurrences: GBIFOccurrence[],
  regionBounds?: Bounds | null,
  regionName?: string,
  regionPolygon?: LonLat[] | null
): string {
  const features: (GeoJsonPointFeature | GeoJsonPolygonFeature)[] = occurrences
    .filter(
      (o) =>
        o.decimalLatitude != null &&
        o.decimalLongitude != null &&
        Number.isFinite(o.decimalLatitude) &&
        Number.isFinite(o.decimalLongitude)
    )
    .map((o) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [o.decimalLongitude!, o.decimalLatitude!],
      },
      properties: { ...o },
    }));

  if (regionBounds) {
    features.push({
      type: 'Feature',
      geometry:
        regionPolygon && regionPolygon.length >= 3
          ? polygonToGeoJsonPolygon(regionPolygon)
          : boundsToGeoJsonPolygon(regionBounds),
      properties: {
        type: 'region',
        name: regionName?.trim() || 'Region boundary',
      },
    });
  }

  const fc = { type: 'FeatureCollection' as const, features };
  return JSON.stringify(fc, null, 2);
}

export function occurrencesToCSV(
  occurrences: GBIFOccurrence[],
  regionBounds?: Bounds | null,
  regionName?: string,
  regionPolygonWkt?: string
): string {
  const preferredOrder = [
    'key',
    'scientificName',
    'vernacularName',
    'decimalLatitude',
    'decimalLongitude',
    'year',
    'month',
    'day',
    'eventDate',
    'locality',
    'countryCode',
    'iucnRedListCategory',
    'basisOfRecord',
    'datasetKey',
    'datasetName',
    'occurrenceID',
    'institutionCode',
    'recordedBy',
  ];

  const allKeys = new Set<string>();
  for (const o of occurrences) {
    Object.keys(o as object).forEach((k) => allKeys.add(k));
  }

  const headers = [
    ...preferredOrder.filter((k) => allKeys.has(k)),
    ...Array.from(allKeys).filter((k) => !preferredOrder.includes(k)).sort(),
  ];

  const escape = (v: unknown): string => {
    if (v == null) return '';
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = occurrences.map((o) =>
    headers.map((h) => escape((o as unknown as Record<string, unknown>)[h])).join(',')
  );

  const meta: string[] = [];
  if (regionBounds) {
    if (regionName?.trim()) meta.push(`# Region: ${regionName.trim()}`);
    meta.push(
      `# Region polygon (WKT): ${regionPolygonWkt ?? boundsToWktPolygon(regionBounds)}`
    );
  }

  const body = [headers.join(','), ...rows].join('\n');
  return meta.length > 0 ? `${meta.join('\n')}\n${body}` : body;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
