/**
 * Simple in-memory LRU cache for GBIF API responses to reduce rate-limit risk.
 *
 * - Entries expire after their TTL. The cache is keyed by request (geometry + filters + offset),
 *   so the same search within the TTL returns cached data without calling the API.
 * - Eviction is least-recently-used and bounded both by entry count and by a "weight" budget
 *   (occurrence records), so one large chunked download cannot silently flush everything else.
 * - In-memory only: occurrence responses can be large and could exceed localStorage limits.
 */
export const OCCURRENCE_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes for occurrence search
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes for other endpoints
export const MAX_CACHE_ENTRIES = 1000;
/** Total weight budget; occurrence entries weigh their record count, other entries weigh 1. */
export const MAX_CACHE_WEIGHT = 300_000;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  weight: number;
}

// Map preserves insertion order; re-inserting on read makes iteration order == LRU order.
const cache = new Map<string, CacheEntry<unknown>>();
let totalWeight = 0;

function remove(key: string): void {
  const entry = cache.get(key);
  if (!entry) return;
  totalWeight -= entry.weight;
  cache.delete(key);
}

function pruneExpired(now = Date.now()): void {
  for (const [key, entry] of cache) {
    if (now > entry.expiresAt) remove(key);
  }
}

function evictLeastRecentlyUsed(): void {
  while (cache.size > MAX_CACHE_ENTRIES || totalWeight > MAX_CACHE_WEIGHT) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (oldestKey == null) break;
    remove(oldestKey);
  }
}

export function getCached<T>(key: string): T | null {
  pruneExpired();
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  cache.delete(key);
  cache.set(key, entry);
  return entry.data;
}

export function setCache<T>(key: string, data: T, ttlMs = DEFAULT_TTL_MS, weight = 1): void {
  pruneExpired();
  remove(key);
  const w = Math.max(1, Math.floor(weight));
  cache.set(key, { data, expiresAt: Date.now() + ttlMs, weight: w });
  totalWeight += w;
  evictLeastRecentlyUsed();
}

export function cacheKey(prefix: string, params: Record<string, unknown>): string {
  const sorted = JSON.stringify(params, Object.keys(params).sort());
  return `${prefix}:${sorted}`;
}

export function clearCache(): void {
  cache.clear();
  totalWeight = 0;
}

/** Current cache statistics (for tests and diagnostics). */
export function cacheStats(): { entries: number; weight: number } {
  return { entries: cache.size, weight: totalWeight };
}
