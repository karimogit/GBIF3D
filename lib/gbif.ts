/**
 * GBIF API client for occurrence search and species suggest
 * Base URL: https://api.gbif.org/v1/
 */

import axios, { AxiosError } from 'axios';
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
/** Default max results per request. */
const OCCURRENCE_LIMIT = OCCURRENCE_PAGE_MAX;
/** Max total results we allow (chunked fetching). GBIF search API can be paged up to 100k total. */
export const OCCURRENCE_MAX_TOTAL = 100_000;
/** Chunk size per API request — must not exceed GBIF's 300 per page. */
const OCCURRENCE_CHUNK_SIZE = OCCURRENCE_PAGE_MAX;
/** Delay between chunk requests (ms) to reduce rate-limit (429) risk. */
const CHUNK_DELAY_MS = 400;
const REQUEST_TIMEOUT_MS = 30000;
/** On 429, wait this long (ms) before retry if server doesn't send Retry-After. */
const RATE_LIMIT_BACKOFF_MS = 8000;
const MAX_RETRIES_ON_429 = 2;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const api = axios.create({
  baseURL: BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { Accept: 'application/json' },
});

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

/** Serialize params for GBIF API; arrays become repeatable params (e.g. taxonKey=1&taxonKey=2) */
function serializeOccurrenceParams(
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

export async function searchOccurrences(
  filters: OccurrenceFilters
): Promise<GBIFOccurrenceSearchResponse> {
  const params: Record<string, string | number | number[] | undefined> = {
    limit: filters.limit ?? OCCURRENCE_LIMIT,
    offset: filters.offset ?? 0,
  };
  if (filters.geometry) params.geometry = filters.geometry;
  if (filters.taxonKeys?.length) {
    params.taxonKey = filters.taxonKeys;
  } else if (filters.taxonKey) {
    params.taxonKey = filters.taxonKey;
  }
  if (filters.year) params.year = filters.year;
  if (filters.eventDate) params.eventDate = filters.eventDate;
  if (filters.iucnRedListCategory) params.iucnRedListCategory = filters.iucnRedListCategory;
  if (filters.basisOfRecord) params.basisOfRecord = filters.basisOfRecord;
  if (filters.continent?.trim()) params.continent = filters.continent.trim().toUpperCase();
  if (filters.country?.trim()) params.country = filters.country.trim().toUpperCase();
  if (filters.datasetKey) params.datasetKey = filters.datasetKey;
  if (filters.institutionCode) params.institutionCode = filters.institutionCode;
  if (filters.facet?.length) params.facet = filters.facet.join(',');
  if (filters.facetLimit) params.facetLimit = filters.facetLimit;

  const key = cacheKey('occ', { ...params, taxonKey: params.taxonKey });
  const cached = getCached<GBIFOccurrenceSearchResponse>(key);
  if (cached) return cached;

  let lastErr: GBIFApiError | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES_ON_429; attempt++) {
    try {
      const { data } = await api.get<GBIFOccurrenceSearchResponse>(
        '/occurrence/search',
        {
          params: params as Record<string, unknown>,
          paramsSerializer: (p) => serializeOccurrenceParams(p as Record<string, string | number | number[] | undefined>),
        }
      );
      setCache(key, data, OCCURRENCE_CACHE_TTL_MS);
      return data;
    } catch (err) {
      const ax = err as AxiosError<{ message?: string; code?: string }>;
      const status = ax.response?.status;
      lastErr = new GBIFApiError(
        ax.response?.data?.message ?? ax.message ?? 'GBIF occurrence search failed',
        status,
        ax.response?.data?.code
      );
      if (status === 429 && attempt < MAX_RETRIES_ON_429) {
        const retryAfter = ax.response?.headers?.['retry-after'];
        const waitMs = typeof retryAfter === 'string' && /^\d+$/.test(retryAfter)
          ? Math.min(60000, parseInt(retryAfter, 10) * 1000)
          : RATE_LIMIT_BACKOFF_MS;
        await delay(waitMs);
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
 * requests to reduce rate-limit risk.
 */
export async function searchOccurrencesChunked(
  filters: OccurrenceFilters & { geometry?: string }
): Promise<GBIFOccurrenceSearchResponse> {
  const maxTotal = Math.min(
    Math.max(1, filters.limit ?? OCCURRENCE_LIMIT),
    OCCURRENCE_MAX_TOTAL
  );
  if (maxTotal <= OCCURRENCE_CHUNK_SIZE) {
    return searchOccurrences({ ...filters, limit: maxTotal, offset: 0 });
  }
  const allResults: GBIFOccurrence[] = [];
  let totalCount = 0;
  let endOfRecords = false;
  let offset = 0;
  while (allResults.length < maxTotal && !endOfRecords) {
    const limit = Math.min(OCCURRENCE_CHUNK_SIZE, maxTotal - allResults.length);
    const res = await searchOccurrences({ ...filters, limit, offset });
    allResults.push(...res.results);
    totalCount = res.count;
    endOfRecords = res.endOfRecords;
    if (res.results.length < limit || endOfRecords) break;
    offset += limit;
    if (offset < maxTotal) await delay(CHUNK_DELAY_MS);
  }
  return {
    offset: 0,
    limit: allResults.length,
    endOfRecords,
    count: totalCount,
    results: allResults,
  };
}

export async function suggestSpecies(
  q: string,
  limit = 20
): Promise<GBIFSpeciesSuggestion[]> {
  if (!q || q.length < 2) return [];
  const params = { q: q.trim(), limit };
  const key = cacheKey('suggest', params);
  const cached = getCached<GBIFSpeciesSuggestion[]>(key);
  if (cached) return cached;

  const trimmed = q.trim();
  const useFetch = typeof window !== 'undefined' && typeof fetch === 'function';

  if (useFetch) {
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

  try {
    const { data } = await api.get<GBIFSpeciesSuggestion[]>('/species/suggest', {
      params: { q: trimmed, limit },
    });
    setCache(key, data, 2 * 60 * 1000);
    return data;
  } catch (err) {
    const ax = err as AxiosError<{ message?: string }>;
    const msg =
      (ax.response?.data && 'message' in ax.response.data
        ? ax.response.data.message
        : undefined) ?? ax.message ?? 'Species suggest failed';
    throw new GBIFApiError(msg, ax.response?.status);
  }
}

/** Search species by vernacular (common) name, e.g. English. Uses /species/search with qField=VERNACULAR. */
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
  const useFetch = typeof window !== 'undefined' && typeof fetch === 'function';

  if (useFetch) {
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

  try {
    const { data } = await api.get<{ results: GBIFSpeciesSearchResult[] }>(
      '/species/search',
      { params }
    );
    const results = data.results ?? [];
    setCache(key, results, 2 * 60 * 1000);
    return results;
  } catch (err) {
    const ax = err as AxiosError<{ message?: string }>;
    const msg =
      (ax.response?.data && 'message' in ax.response.data
        ? ax.response.data.message
        : undefined) ?? ax.message ?? 'Vernacular species search failed';
    throw new GBIFApiError(msg, ax.response?.status);
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
