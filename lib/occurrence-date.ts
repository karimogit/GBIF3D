/**
 * Consistent year/month extraction from GBIF occurrences for timeline and filtering.
 * Uses string parsing where possible to avoid timezone and year-only-as-January bugs.
 */
import type { GBIFOccurrence } from '@/types/gbif';

/** Year (e.g. 2020) from occurrence; null if not determinable. */
export function occurrenceYear(occ: GBIFOccurrence): number | null {
  if (occ.year != null && Number.isFinite(occ.year)) return occ.year;
  const ed = occ.eventDate;
  if (typeof ed === 'string' && /^\d{4}/.test(ed)) {
    const y = parseInt(ed.slice(0, 4), 10);
    return Number.isFinite(y) ? y : null;
  }
  return null;
}

/** Month (1–12) from occurrence only when explicitly present; null for year-only dates. */
export function occurrenceMonth(occ: GBIFOccurrence): number | null {
  if (occ.month != null && occ.month >= 1 && occ.month <= 12) return occ.month;
  const ed = occ.eventDate;
  if (typeof ed === 'string' && ed.length >= 7 && /^\d{4}-\d{2}/.test(ed)) {
    const m = parseInt(ed.slice(5, 7), 10);
    return m >= 1 && m <= 12 ? m : null;
  }
  return null;
}
