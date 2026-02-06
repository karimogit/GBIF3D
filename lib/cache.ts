/**
 * Simple in-memory cache for GBIF API responses to reduce rate-limit risk.
 *
 * - When it refreshes: each entry expires after its TTL (see below). Cache is keyed by
 *   request (e.g. geometry + filters + offset), so the same search within TTL returns
 *   cached data without calling the API. After TTL, the next request for that key refetches.
 * - On page reload: the cache is empty (in-memory only). We don’t persist to localStorage
 *   because occurrence responses can be large and could hit storage limits.
 */
export const OCCURRENCE_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes for occurrence search
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes for other endpoints

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCache<T>(key: string, data: T, ttlMs = DEFAULT_TTL_MS): void {
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

export function cacheKey(prefix: string, params: Record<string, unknown>): string {
  const sorted = JSON.stringify(params, Object.keys(params).sort());
  return `${prefix}:${sorted}`;
}

export function clearCache(): void {
  cache.clear();
}
