/**
 * Saved favorite regions (persisted in localStorage)
 */

import type { Bounds } from './geometry';

const STORAGE_KEY = 'gbif-globe-favorites';

export interface FavoriteRegion {
  id: string;
  name: string;
  bounds: Bounds;
}

function load(): FavoriteRegion[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is FavoriteRegion =>
        p &&
        typeof p === 'object' &&
        typeof (p as FavoriteRegion).id === 'string' &&
        typeof (p as FavoriteRegion).name === 'string' &&
        typeof (p as FavoriteRegion).bounds === 'object' &&
        ['west', 'south', 'east', 'north'].every(
          (k) => typeof (p as FavoriteRegion).bounds[k as keyof Bounds] === 'number'
        )
    );
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

export function addFavorite(name: string, bounds: Bounds): FavoriteRegion {
  const list = load();
  const id = `fav-${Date.now()}`;
  const item: FavoriteRegion = { id, name, bounds };
  list.push(item);
  save(list);
  return item;
}

export function removeFavorite(id: string): void {
  const list = load().filter((f) => f.id !== id);
  save(list);
}

export function getFavoriteBounds(id: string): Bounds | undefined {
  return load().find((f) => f.id === id)?.bounds;
}
