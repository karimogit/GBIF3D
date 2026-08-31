import type { GBIFOccurrence } from '@/types/gbif';
import { pointInBounds, pointInPolygon, type Bounds, type LonLat } from './geometry';
import { occurrenceYear, occurrenceMonth } from './occurrence-date';

/** Occurrences shown on the map (region + timeline filters applied). */
export function getDisplayedOccurrences(
  occurrences: GBIFOccurrence[],
  importedOccurrences: GBIFOccurrence[],
  selectedRegionBounds: Bounds | null,
  timeFilterYear: number | null,
  timeFilterMonth: number | null,
  drawnPolygon?: LonLat[] | null
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
  let combined = [...apiInRegion, ...(importedOccurrences ?? [])];
  if (timeFilterYear == null) return combined;
  return combined.filter((o) => {
    const year = occurrenceYear(o);
    if (year !== timeFilterYear) return false;
    if (timeFilterMonth == null) return true;
    const month = occurrenceMonth(o);
    return month === timeFilterMonth;
  });
}
