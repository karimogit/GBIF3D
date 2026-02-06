/**
 * Saved occurrences (persisted in localStorage). Used when user clicks "Save" in the occurrence info box.
 */
import type { GBIFOccurrence } from '@/types/gbif';

const STORAGE_KEY = 'gbif-globe-saved-occurrences';

function load(): GBIFOccurrence[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is GBIFOccurrence =>
        p != null &&
        typeof p === 'object' &&
        typeof (p as GBIFOccurrence).key === 'number' &&
        Number.isInteger((p as GBIFOccurrence).key)
    );
  } catch {
    return [];
  }
}

function save(items: GBIFOccurrence[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

export function getSavedOccurrences(): GBIFOccurrence[] {
  return load();
}

export function addSavedOccurrence(occ: GBIFOccurrence): void {
  const list = load();
  if (list.some((o) => o.key === occ.key)) return;
  list.push(occ);
  save(list);
}

export function removeSavedOccurrence(key: number): void {
  save(load().filter((o) => o.key !== key));
}

export function isOccurrenceSaved(key: number): boolean {
  return load().some((o) => o.key === key);
}
