import type { GBIFOccurrence } from '@/types/gbif';
import {
  boundsCrossAntimeridian,
  boundsToWktPolygon,
  getBboxFromCoords,
  padBounds,
  splitPolygonAtAntimeridian,
  type Bounds,
  type LonLat,
} from './geometry';

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

type GeoJsonAreaGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] };

interface GeoJsonAreaFeature {
  type: 'Feature';
  geometry: GeoJsonAreaGeometry;
  properties: Record<string, unknown>;
}

/** Closed counter-clockwise ring (RFC 7946 exterior ring orientation). */
function rectangleRing(west: number, south: number, east: number, north: number): number[][] {
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
}

function boundsToGeoJsonGeometry(bounds: Bounds): GeoJsonAreaGeometry {
  const { west, south, east, north } = bounds;
  if (boundsCrossAntimeridian(bounds)) {
    return {
      type: 'MultiPolygon',
      coordinates: [[rectangleRing(west, south, 180, north)], [rectangleRing(-180, south, east, north)]],
    };
  }
  return { type: 'Polygon', coordinates: [rectangleRing(west, south, east, north)] };
}

function ringSignedArea(ring: number[][]): number {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return area / 2;
}

function closedCounterClockwiseRing(polygon: LonLat[]): number[][] {
  const ring: number[][] = polygon.map(([lon, lat]) => [lon, lat]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
  return ringSignedArea(ring) < 0 ? ring.reverse() : ring;
}

function polygonToGeoJsonGeometry(polygon: LonLat[]): GeoJsonAreaGeometry {
  const rings = splitPolygonAtAntimeridian(polygon).map(closedCounterClockwiseRing);
  if (rings.length === 1) return { type: 'Polygon', coordinates: [rings[0]] };
  return { type: 'MultiPolygon', coordinates: rings.map((r) => [r]) };
}

export function occurrencesToGeoJSON(
  occurrences: GBIFOccurrence[],
  regionBounds?: Bounds | null,
  regionName?: string,
  regionPolygon?: LonLat[] | null
): string {
  const features: (GeoJsonPointFeature | GeoJsonAreaFeature)[] = occurrences
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
          ? polygonToGeoJsonGeometry(regionPolygon)
          : boundsToGeoJsonGeometry(regionBounds),
      properties: {
        type: 'region',
        name: regionName?.trim() || 'Region boundary',
      },
    });
  }

  const fc = { type: 'FeatureCollection' as const, features };
  return JSON.stringify(fc, null, 2);
}

const CSV_PREFERRED_COLUMNS = [
  'key',
  'gbifKey',
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

/** Column names for region metadata; repeated on every row so the file stays a plain CSV table. */
export const CSV_REGION_NAME_COLUMN = 'regionName';
export const CSV_REGION_WKT_COLUMN = 'regionWkt';

/**
 * Quote a CSV cell. Text cells that a spreadsheet would treat as a formula (`=`, `+`, `-`, `@`, tab, CR)
 * are prefixed with an apostrophe; numeric values are left as-is so coordinates stay numbers.
 */
export function csvCell(v: unknown): string {
  if (v == null) return '';
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+(\.\d+)?$/.test(s)) {
    s = `'${s}`;
  }
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function occurrencesToCSV(
  occurrences: GBIFOccurrence[],
  regionBounds?: Bounds | null,
  regionName?: string,
  regionPolygonWkt?: string
): string {
  const allKeys = new Set<string>();
  for (const o of occurrences) {
    Object.keys(o as object).forEach((k) => allKeys.add(k));
  }

  const headers = [
    ...CSV_PREFERRED_COLUMNS.filter((k) => allKeys.has(k)),
    ...Array.from(allKeys)
      .filter((k) => !CSV_PREFERRED_COLUMNS.includes(k))
      .sort(),
  ];

  const regionCells: string[] = [];
  if (regionBounds) {
    headers.push(CSV_REGION_NAME_COLUMN, CSV_REGION_WKT_COLUMN);
    regionCells.push(
      csvCell(regionName?.trim() || 'Region boundary'),
      csvCell(regionPolygonWkt ?? boundsToWktPolygon(regionBounds))
    );
  }

  const dataHeaders = regionBounds ? headers.slice(0, -2) : headers;
  const rows = occurrences.map((o) =>
    [...dataHeaders.map((h) => csvCell((o as unknown as Record<string, unknown>)[h])), ...regionCells].join(',')
  );

  return [headers.join(','), ...rows].join('\r\n');
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
