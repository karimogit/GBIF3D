/**
 * Tools for temporal trends, phenology, and first detections from GBIF occurrence data.
 */

import { searchOccurrences } from './gbif';
import { boundsToWktPolygon } from './geometry';
import type { Bounds } from './geometry';
import type { OccurrenceFilters } from '@/types/gbif';
import type { GBIFOccurrence, GBIFFacet } from '@/types/gbif';

/** Fetch occurrence counts by year (and optionally month) for the given bounds and filters. */
export async function fetchTemporalFacets(
  bounds: Bounds,
  filters: OccurrenceFilters,
  options: { facetMonth?: boolean; facetLimit?: number } = {}
): Promise<{ yearFacet?: GBIFFacet; monthFacet?: GBIFFacet; totalCount: number }> {
  const geometry = boundsToWktPolygon(bounds);
  const facetLimit = options.facetLimit ?? 80;
  const facetFields = options.facetMonth ? ['year', 'month'] : ['year'];

  const res = await searchOccurrences({
    ...filters,
    geometry,
    limit: 0,
    facet: facetFields,
    facetLimit,
  });

  const yearFacet = res.facets?.find((f) => f.field === 'YEAR');
  const monthFacet = res.facets?.find((f) => f.field === 'MONTH');
  return {
    yearFacet,
    monthFacet,
    totalCount: res.count ?? 0,
  };
}

/** First detection per species (earliest year) from loaded occurrences. */
export function computeFirstDetections(
  occurrences: GBIFOccurrence[]
): { speciesKey: number; scientificName: string; vernacularName?: string; firstYear: number; count: number }[] {
  const bySpecies = new Map<
    number,
    { years: number[]; scientificName: string; vernacularName?: string }
  >();
  for (const o of occurrences) {
    const key = o.speciesKey ?? o.genusKey ?? (o as { taxonKey?: number }).taxonKey ?? o.key;
    if (key == null) continue;
    const year = o.year ?? (o.eventDate ? new Date(o.eventDate).getFullYear() : undefined);
    if (year == null || !Number.isFinite(year)) continue;
    const existing = bySpecies.get(key);
    if (!existing) {
      bySpecies.set(key, {
        years: [year],
        scientificName: o.scientificName ?? `Taxon ${key}`,
        vernacularName: o.vernacularName,
      });
    } else {
      existing.years.push(year);
    }
  }
  return Array.from(bySpecies.entries()).map(([speciesKey, { years, scientificName, vernacularName }]) => ({
    speciesKey,
    scientificName,
    vernacularName,
    firstYear: Math.min(...years),
    count: years.length,
  }));
}

/**
 * True if the date string has month (or day) info so we can use it for phenology.
 * Year-only strings like "2020" parse as Jan 1 and would wrongly inflate January.
 */
function eventDateHasMonthInfo(eventDate: string): boolean {
  const s = String(eventDate).trim();
  if (s.length < 7) return false; // need at least YYYY-MM
  if (!/^\d{4}-\d/.test(s)) return false; // YYYY-MM or YYYY-MM-DD
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

/** Phenology: occurrence counts by month from loaded occurrences. Uses month field or eventDate only when it contains month (e.g. YYYY-MM); year-only dates are skipped so they don’t all count as January. */
export function computePhenologyByMonth(
  occurrences: GBIFOccurrence[]
): { month: number; count: number; label: string }[] {
  const counts = new Array(12).fill(0);
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  for (const o of occurrences) {
    let month: number | undefined;
    if (o.month != null && o.month >= 1 && o.month <= 12) {
      month = o.month;
    } else if (o.eventDate && eventDateHasMonthInfo(o.eventDate)) {
      month = new Date(o.eventDate).getMonth() + 1;
    }
    if (month != null) counts[month - 1]++;
  }
  return counts.map((count, i) => ({
    month: i + 1,
    count,
    label: monthNames[i],
  }));
}
