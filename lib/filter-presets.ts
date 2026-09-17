/**
 * Saved filter presets (persisted in localStorage).
 */
import type { OccurrenceFilters } from '@/types/gbif';

const STORAGE_KEY = 'gbif-globe-filter-presets';
export const MAX_FILTER_PRESETS = 30;

export interface FilterPreset {
  id: string;
  name: string;
  filters: OccurrenceFilters;
  createdAt: number;
}

/** Fields safe to persist in a preset (no geometry). */
export type PresetFilters = Omit<OccurrenceFilters, 'geometry' | 'offset'>;

function isPresetFilters(v: unknown): v is PresetFilters {
  if (!v || typeof v !== 'object') return false;
  const f = v as PresetFilters;
  if (f.limit != null && (!Number.isFinite(f.limit) || f.limit < 1)) return false;
  if (f.taxonKeys != null && !Array.isArray(f.taxonKeys)) return false;
  return true;
}

function isFilterPreset(p: unknown): p is FilterPreset {
  if (!p || typeof p !== 'object') return false;
  const item = p as Partial<FilterPreset>;
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.createdAt === 'number' &&
    isPresetFilters(item.filters)
  );
}

function load(): FilterPreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isFilterPreset);
  } catch {
    return [];
  }
}

function save(items: FilterPreset[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_FILTER_PRESETS)));
  } catch {
    // ignore quota errors
  }
}

export function getFilterPresets(): FilterPreset[] {
  return load().sort((a, b) => b.createdAt - a.createdAt);
}

export function addFilterPreset(name: string, filters: OccurrenceFilters): FilterPreset {
  const list = load();
  const { geometry: _g, offset: _o, ...rest } = filters;
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `preset-${crypto.randomUUID()}`
      : `preset-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const item: FilterPreset = {
    id,
    name: name.trim(),
    filters: rest,
    createdAt: Date.now(),
  };
  list.unshift(item);
  save(list);
  return item;
}

export function removeFilterPreset(id: string): void {
  save(load().filter((p) => p.id !== id));
}

export function filtersToPresetSnapshot(filters: OccurrenceFilters): PresetFilters {
  const { geometry: _g, offset: _o, ...rest } = filters;
  return rest;
}
