/**
 * Saved favorite regions (persisted in localStorage)
 */

import type { Bounds, LonLat } from './geometry';

const STORAGE_KEY = 'gbif-globe-favorites';

export interface FavoriteRegion {
  id: string;
  name: string;
  bounds: Bounds;
  /** Vertices when the favorite was drawn as a custom shape; absent for plain rectangles. */
  polygon?: LonLat[];
}

function isLonLat(v: unknown): v is LonLat {
  return Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number';
}

function isFavoriteRegion(p: unknown): p is FavoriteRegion {
  if (!p || typeof p !== 'object') return false;
  const f = p as Partial<FavoriteRegion>;
  if (typeof f.id !== 'string' || typeof f.name !== 'string' || !f.bounds || typeof f.bounds !== 'object') {
    return false;
  }
  const bounds = f.bounds;
  if (!(['west', 'south', 'east', 'north'] as const).every((k) => typeof bounds[k] === 'number')) return false;
  return f.polygon === undefined || (Array.isArray(f.polygon) && f.polygon.every(isLonLat));
}

function load(): FavoriteRegion[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isFavoriteRegion);
  } catch {
    return [];
  }
}

function save(items: FavoriteRegion[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

export function getFavorites(): FavoriteRegion[] {
  return load();
}

export function addFavorite(name: string, bounds: Bounds, polygon?: LonLat[] | null): FavoriteRegion {
  const list = load();
  const id = `fav-${Date.now()}`;
  const item: FavoriteRegion = {
    id,
    name,
    bounds,
    ...(polygon && polygon.length >= 3 ? { polygon } : {}),
  };
  list.push(item);
  save(list);
  return item;
}

export function removeFavorite(id: string): void {
  const list = load().filter((f) => f.id !== id);
  save(list);
}
