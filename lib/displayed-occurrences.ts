import type { GBIFOccurrence } from '@/types/gbif';
import { pointInBounds, pointInPolygon, type Bounds, type LonLat } from './geometry';
import { occurrenceYear, occurrenceMonth } from './occurrence-date';

/**
 * Occurrences shown on the map.
 * Merges live API results (region-filtered), imported records, and saved occurrences,
 * then applies the timeline year/month filter.
 */
export function getDisplayedOccurrences(
  occurrences: GBIFOccurrence[],
  importedOccurrences: GBIFOccurrence[],
  selectedRegionBounds: Bounds | null,
  timeFilterYear: number | null,
  timeFilterMonth: number | null,
  drawnPolygon?: LonLat[] | null,
  savedOccurrences?: GBIFOccurrence[] | null
): GBIFOccurrence[] {
  const apiInRegion =
    selectedRegionBounds != null
      ? occurrences.filter((o) => {
          const lon = o.decimalLongitude;
          const lat = o.decimalLatitude;
          if (lon == null || lat == null) return false;
          if (drawnPolygon && drawnPolygon.length >= 3) {
            return pointInPolygon(lon, lat, drawnPolygon);
          }
          return pointInBounds(lon, lat, selectedRegionBounds);
        })
      : occurrences;

  const byKey = new Map<number, GBIFOccurrence>();
  for (const o of apiInRegion) byKey.set(o.key, o);
  for (const o of importedOccurrences ?? []) byKey.set(o.key, o);
  // Saved last so a saved copy of a live record still appears after filters clear the live set.
  for (const o of savedOccurrences ?? []) {
    if (!byKey.has(o.key)) byKey.set(o.key, o);
  }
  const combined = Array.from(byKey.values());

  if (timeFilterYear == null) return combined;
  return combined.filter((o) => {
    const year = occurrenceYear(o);
    if (year !== timeFilterYear) return false;
    if (timeFilterMonth == null) return true;
    const month = occurrenceMonth(o);
    return month === timeFilterMonth;
  });
}
