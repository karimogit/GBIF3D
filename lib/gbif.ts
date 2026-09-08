/**
 * GBIF API client for occurrence search and species suggest.
 * Base URL: https://api.gbif.org/v1/
 *
 * Species suggest/search go through Next.js API proxies from the browser.
 * Occurrence search uses fetch against the public GBIF API.
 */

import type {
  GBIFOccurrence,
  GBIFOccurrenceSearchResponse,
  GBIFSpeciesSuggestion,
  GBIFSpeciesSearchResult,
  OccurrenceFilters,
} from '@/types/gbif';
import { getCached, setCache, cacheKey, OCCURRENCE_CACHE_TTL_MS } from './cache';

const BASE_URL = 'https://api.gbif.org/v1';
/** GBIF occurrence search API allows max 300 records per page (see techdocs.gbif.org). */
const OCCURRENCE_PAGE_MAX = 300;
/** Default max results for a single (non-chunked) page request. */
const OCCURRENCE_PAGE_DEFAULT = OCCURRENCE_PAGE_MAX;
/** Max total results we allow (chunked fetching). GBIF search API can be paged up to 100k total. */
export const OCCURRENCE_MAX_TOTAL = 100_000;
/** Smallest "Max results" the UI allows. */
export const OCCURRENCE_MIN_TOTAL = 100;
/** Default "Max results" used by the UI when the user hasn't set one. */
export const DEFAULT_OCCURRENCE_LIMIT = 1000;
/** Chunk size per API request — must not exceed GBIF's 300 per page. */
const OCCURRENCE_CHUNK_SIZE = OCCURRENCE_PAGE_MAX;
/** Delay between chunk requests (ms) to reduce rate-limit (429) risk. */
const CHUNK_DELAY_MS = 400;
const REQUEST_TIMEOUT_MS = 30000;
/** On 429, wait this long (ms) before retry if server doesn't send Retry-After. */
const RATE_LIMIT_BACKOFF_MS = 8000;
const MAX_RETRIES_ON_429 = 2;

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener('abort', abort);
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timeout);
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export class GBIFApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string
  ) {
    super(message);
    this.name = 'GBIFApiError';
  }
}

export interface ChunkProgress {
  loadedChunks: number;
  totalChunks: number;
  loadedRecords: number;
  maxRecords: number;
}

export interface GBIFRequestOptions {
  signal?: AbortSignal;
  /** When true, skip writing this response into the cache (used by chunked aggregate path). */
  skipCacheWrite?: boolean;
  /** Progress for chunked fetches. */
  onProgress?: (progress: ChunkProgress) => void;
}

/** Serialize params for GBIF API; arrays become repeatable params (e.g. taxonKey=1&taxonKey=2) */
export function serializeOccurrenceParams(
  params: Record<string, string | number | number[] | undefined>
): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '') continue;
    if (Array.isArray(v)) {
      v.forEach((val) => parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(val))}`));
    } else {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.join('&');
}

function buildOccurrenceParams(
  filters: OccurrenceFilters
): Record<string, string | number | number[] | undefined> {
  const params: Record<string, string | number | number[] | undefined> = {
    limit: filters.limit ?? OCCURRENCE_PAGE_DEFAULT,
    offset: filters.offset ?? 0,
  };
  if (filters.geometry) params.geometry = filters.geometry;
  if (filters.taxonKeys?.length) {
    params.taxonKey = filters.taxonKeys;
  } else if (filters.taxonKey) {
    params.taxonKey = filters.taxonKey;
  }
  if (filters.year) params.year = filters.year;
  // GBIF occurrence search API expects date range with COMMA (see techdocs "Searching dates")
  const rawDate = filters.eventDate && String(filters.eventDate).trim();
  if (rawDate) {
    const normalized = rawDate.replace(',', '/');
    const [from, to] = normalized.split('/').map((s) => s?.trim() ?? '');
    const isoDate = /^\d{4}-\d{2}-\d{2}$/;
    if (from && to && isoDate.test(from) && isoDate.test(to) && from <= to) {
      const fromDate = new Date(from + 'T00:00:00Z');
      const toDate = new Date(to + 'T00:00:00Z');
      if (!isNaN(fromDate.getTime()) && !isNaN(toDate.getTime()) && fromDate <= toDate) {
        params.eventDate = `${from},${to}`;
      }
    }
  }
  if (filters.iucnRedListCategory) params.iucnRedListCategory = filters.iucnRedListCategory;
  if (filters.basisOfRecord) params.basisOfRecord = filters.basisOfRecord;
  if (filters.continent?.trim()) params.continent = filters.continent.trim().toUpperCase();
  const countryVal = filters.country?.trim().toUpperCase();
  if (countryVal && /^[A-Z]{2}$/.test(countryVal)) params.country = countryVal;
  if (filters.datasetKey) params.datasetKey = filters.datasetKey;
  if (filters.institutionCode) params.institutionCode = filters.institutionCode;
  return params;
}

interface FetchResult<T> {
  data: T;
  retryAfterMs: number | null;
}

async function fetchGbifJson<T>(url: string, signal?: AbortSignal): Promise<FetchResult<T>> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const retryAfterHeader = res.headers.get('retry-after');
    const retryAfterMs =
      retryAfterHeader && /^\d+$/.test(retryAfterHeader)
        ? Math.min(60_000, parseInt(retryAfterHeader, 10) * 1000)
        : null;

    if (!res.ok) {
      let bodyMsg: string | undefined;
      let code: string | undefined;
      try {
        const body = (await res.json()) as { message?: string; error?: string; code?: string };
        bodyMsg = body.message ?? body.error;
        code = body.code;
      } catch {
        // ignore
      }
      const message =
        res.status === 400
          ? bodyMsg ?? 'Invalid search parameters. Check date range, region bounds, and filters.'
          : bodyMsg ?? `Request failed (${res.status})`;
      const err = new GBIFApiError(message, res.status, code);
      (err as GBIFApiError & { retryAfterMs?: number | null }).retryAfterMs = retryAfterMs;
      throw err;
    }
    const data = (await res.json()) as T;
    return { data, retryAfterMs };
  } catch (err) {
    if (err instanceof GBIFApiError) throw err;
    if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) throw err;
    throw new GBIFApiError(err instanceof Error ? err.message : 'Request failed');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}

export async function searchOccurrences(
  filters: OccurrenceFilters,
  options: GBIFRequestOptions = {}
): Promise<GBIFOccurrenceSearchResponse> {
  const params = buildOccurrenceParams(filters);
  const key = cacheKey('occ', params as Record<string, unknown>);
  const cached = getCached<GBIFOccurrenceSearchResponse>(key);
  if (cached) return cached;

  const qs = serializeOccurrenceParams(params);
  const url = `${BASE_URL}/occurrence/search?${qs}`;

  let lastErr: GBIFApiError | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES_ON_429; attempt++) {
    try {
      const { data } = await fetchGbifJson<GBIFOccurrenceSearchResponse>(url, options.signal);
      if (!options.skipCacheWrite) {
        setCache(key, data, OCCURRENCE_CACHE_TTL_MS, data.results?.length ?? 1);
      }
      return data;
    } catch (err) {
      if (options.signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) throw err;
      lastErr =
        err instanceof GBIFApiError
          ? err
          : new GBIFApiError(err instanceof Error ? err.message : 'GBIF occurrence search failed');
      if (lastErr.status === 429 && attempt < MAX_RETRIES_ON_429) {
        const retryAfterMs =
          (lastErr as GBIFApiError & { retryAfterMs?: number | null }).retryAfterMs ?? RATE_LIMIT_BACKOFF_MS;
        await delay(retryAfterMs || RATE_LIMIT_BACKOFF_MS, options.signal);
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr ?? new GBIFApiError('GBIF occurrence search failed');
}

/**
 * Fetch occurrences in chunks (multiple API requests with offset/limit) to allow up to
 * OCCURRENCE_MAX_TOTAL results while staying within API limits. Uses CHUNK_DELAY_MS between
 * requests to reduce rate-limit risk. Only the aggregate result is cached (not each chunk).
 */
export async function searchOccurrencesChunked(
  filters: OccurrenceFilters & { geometry?: string },
  options: GBIFRequestOptions = {}
): Promise<GBIFOccurrenceSearchResponse> {
  const maxTotal = Math.min(
    Math.max(1, filters.limit ?? OCCURRENCE_PAGE_DEFAULT),
    OCCURRENCE_MAX_TOTAL
  );
  if (maxTotal <= OCCURRENCE_CHUNK_SIZE) {
    return searchOccurrences({ ...filters, limit: maxTotal, offset: 0 }, options);
  }

  const aggregateKey = cacheKey('occ-chunked', { ...filters, offset: undefined, limit: maxTotal });
  const cachedAggregate = getCached<GBIFOccurrenceSearchResponse>(aggregateKey);
  if (cachedAggregate) {
    options.onProgress?.({
      loadedChunks: 1,
      totalChunks: 1,
      loadedRecords: cachedAggregate.results.length,
      maxRecords: maxTotal,
    });
    return cachedAggregate;
  }

  const totalChunks = Math.ceil(maxTotal / OCCURRENCE_CHUNK_SIZE);
  const allResults: GBIFOccurrence[] = [];
  let totalCount = 0;
  let endOfRecords = false;
  let offset = 0;
  let loadedChunks = 0;

  while (allResults.length < maxTotal && !endOfRecords) {
    const limit = Math.min(OCCURRENCE_CHUNK_SIZE, maxTotal - allResults.length);
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const res = await searchOccurrences(
      { ...filters, limit, offset },
      { signal: options.signal, skipCacheWrite: true }
    );
    for (const r of res.results) allResults.push(r);
    totalCount = res.count;
    endOfRecords = res.endOfRecords;
    loadedChunks += 1;
    options.onProgress?.({
      loadedChunks,
      totalChunks,
      loadedRecords: allResults.length,
      maxRecords: maxTotal,
    });
    if (res.results.length < limit || endOfRecords) break;
    offset += limit;
    if (offset < maxTotal) await delay(CHUNK_DELAY_MS, options.signal);
  }

  const aggregate: GBIFOccurrenceSearchResponse = {
    offset: 0,
    limit: allResults.length,
    endOfRecords,
    count: totalCount,
    results: allResults,
  };
  setCache(aggregateKey, aggregate, OCCURRENCE_CACHE_TTL_MS, allResults.length);
  return aggregate;
}

export async function suggestSpecies(q: string, limit = 20): Promise<GBIFSpeciesSuggestion[]> {
  if (!q || q.length < 2) return [];
  const params = { q: q.trim(), limit };
  const key = cacheKey('suggest', params);
  const cached = getCached<GBIFSpeciesSuggestion[]>(key);
  if (cached) return cached;

  const trimmed = q.trim();
  try {
    const url = `/api/species/suggest?q=${encodeURIComponent(trimmed)}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) throw new GBIFApiError('Species suggest failed', res.status);
    const data = (await res.json()) as GBIFSpeciesSuggestion[];
    setCache(key, data, 2 * 60 * 1000);
    return data;
  } catch (err) {
    if (err instanceof GBIFApiError) throw err;
    throw new GBIFApiError(err instanceof Error ? err.message : 'Species suggest failed');
  }
}

/** Search species by vernacular (common) name. Uses /species/search with qField=VERNACULAR. */
export async function searchSpeciesByVernacular(
  q: string,
  limit = 20
): Promise<GBIFSpeciesSearchResult[]> {
  if (!q || q.length < 2) return [];
  const params = {
    q: q.trim(),
    qField: 'VERNACULAR',
    status: 'ACCEPTED',
    limit,
  };
  const key = cacheKey('species-search-vernacular', params);
  const cached = getCached<GBIFSpeciesSearchResult[]>(key);
  if (cached) return cached;

  const trimmed = q.trim();
  try {
    const url = `/api/species/search?q=${encodeURIComponent(trimmed)}&qField=VERNACULAR&status=ACCEPTED&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) throw new GBIFApiError('Vernacular species search failed', res.status);
    const data = (await res.json()) as { results?: GBIFSpeciesSearchResult[] };
    const results = data.results ?? [];
    setCache(key, results, 2 * 60 * 1000);
    return results;
  } catch (err) {
    if (err instanceof GBIFApiError) throw err;
    throw new GBIFApiError(err instanceof Error ? err.message : 'Vernacular species search failed');
  }
}

/** Common taxonomic class keys for filter presets (GBIF backbone) */
export const TAXON_CLASS_KEYS: Record<string, number> = {
  birds: 212,
  mammals: 359,
  reptiles: 358,
  amphibians: 131,
  plants: 6,
  insects: 216,
  fungi: 5,
  mollusks: 52,
};
