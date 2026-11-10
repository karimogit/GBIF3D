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

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True when `iso` is a real calendar date (rejects rollovers such as 2024-02-30). */
export function isIsoCalendarDate(iso: string): boolean {
  const match = ISO_DATE.exec(iso);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/** Local calendar date as YYYY-MM-DD. GBIF rejects event dates after today. */
export function todayIsoDate(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Normalize a GBIF eventDate range to `YYYY-MM-DD/YYYY-MM-DD`.
 * Swaps reversed ends, clamps future dates to today, and drops impossible calendar dates.
 */
export function normalizeEventDateRange(raw: string, today = todayIsoDate()): string | undefined {
  const normalized = raw.trim().replace(',', '/');
  const [fromRaw, toRaw] = normalized.split('/').map((part) => part?.trim() ?? '');
  if (!isIsoCalendarDate(fromRaw) || !isIsoCalendarDate(toRaw) || !isIsoCalendarDate(today)) {
    return undefined;
  }
  let start = fromRaw <= toRaw ? fromRaw : toRaw;
  let end = fromRaw <= toRaw ? toRaw : fromRaw;
  if (end > today) end = today;
  if (start > today) start = today;
  if (start > end) return undefined;
  return `${start}/${end}`;
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
