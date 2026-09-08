'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  searchOccurrencesChunked,
  DEFAULT_OCCURRENCE_LIMIT,
  GBIFApiError,
  type ChunkProgress,
} from '@/lib/gbif';
import { boundsToWktPolygon, coordsToWktPolygon, type Bounds, type LonLat } from '@/lib/geometry';
import type { GBIFOccurrence, OccurrenceFilters } from '@/types/gbif';

const DEFAULT_BOUNDS: Bounds = {
  west: -180,
  south: -90,
  east: 180,
  north: 90,
};

const FETCH_DEBOUNCE_MS = 400;

export interface UseOccurrencesArgs {
  filters: OccurrenceFilters;
  selectedRegionBounds?: Bounds | null;
  selectedCountryCode?: string | null;
  drawnPolygon?: LonLat[] | null;
}

export interface UseOccurrencesResult {
  occurrences: GBIFOccurrence[];
  loading: boolean;
  error: string | null;
  progress: ChunkProgress | null;
  viewBounds: Bounds;
  setViewBounds: (b: Bounds) => void;
  hasTaxonFilter: boolean;
  cancel: () => void;
}

/**
 * Owns GBIF occurrence fetching for the current filters/region.
 * Keeps prior results on transient errors; exposes cancel + chunk progress.
 */
export function useOccurrences({
  filters,
  selectedRegionBounds = null,
  selectedCountryCode = null,
  drawnPolygon = null,
}: UseOccurrencesArgs): UseOccurrencesResult {
  const [occurrences, setOccurrences] = useState<GBIFOccurrence[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ChunkProgress | null>(null);
  const [viewBounds, setViewBounds] = useState<Bounds>(DEFAULT_BOUNDS);

  const fetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const fetchGenerationRef = useRef(0);
  const viewBoundsRef = useRef(viewBounds);
  const filtersRef = useRef(filters);

  useEffect(() => {
    viewBoundsRef.current = viewBounds;
  }, [viewBounds]);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  const hasTaxonFilter =
    (filters.taxonKeys?.length ?? 0) > 0 || filters.taxonKey != null;

  const filterFetchKey = useMemo(
    () =>
      JSON.stringify({
        taxonKey: filters.taxonKey ?? null,
        taxonKeys: filters.taxonKeys ?? null,
        year: filters.year ?? null,
        eventDate: filters.eventDate ?? null,
        iucnRedListCategory: filters.iucnRedListCategory ?? null,
        basisOfRecord: filters.basisOfRecord ?? null,
        continent: filters.continent ?? null,
        country: filters.country ?? null,
        datasetKey: filters.datasetKey ?? null,
        institutionCode: filters.institutionCode ?? null,
        limit: filters.limit ?? null,
        offset: filters.offset ?? null,
        selectedCountryCode: selectedCountryCode ?? null,
      }),
    [
      filters.taxonKey,
      filters.taxonKeys,
      filters.year,
      filters.eventDate,
      filters.iucnRedListCategory,
      filters.basisOfRecord,
      filters.continent,
      filters.country,
      filters.datasetKey,
      filters.institutionCode,
      filters.limit,
      filters.offset,
      selectedCountryCode,
    ]
  );

  const regionFetchKey = useMemo(
    () =>
      selectedRegionBounds
        ? `${selectedRegionBounds.west},${selectedRegionBounds.south},${selectedRegionBounds.east},${selectedRegionBounds.north}`
        : 'camera',
    [selectedRegionBounds]
  );

  const cancel = useCallback(() => {
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = null;
    }
    fetchAbortRef.current?.abort();
    fetchGenerationRef.current += 1;
    setLoading(false);
    setProgress(null);
  }, []);

  const fetchOccurrences = useCallback(
    async (bounds: Bounds, signal: AbortSignal, generation: number) => {
      setLoading(true);
      setError(null);
      setProgress(null);
      try {
        const currentFilters = filtersRef.current;
        const geometry =
          drawnPolygon && drawnPolygon.length >= 3
            ? coordsToWktPolygon(drawnPolygon)
            : boundsToWktPolygon(bounds);
        const country = selectedCountryCode?.trim().toUpperCase() ?? currentFilters.country;
        const res = await searchOccurrencesChunked(
          {
            ...currentFilters,
            geometry,
            country: country || undefined,
            limit: currentFilters.limit ?? DEFAULT_OCCURRENCE_LIMIT,
          },
          {
            signal,
            onProgress: (p) => {
              if (!signal.aborted && generation === fetchGenerationRef.current) setProgress(p);
            },
          }
        );
        if (signal.aborted || generation !== fetchGenerationRef.current) return;
        setOccurrences(res.results);
        setProgress(null);
      } catch (err) {
        if (signal.aborted || generation !== fetchGenerationRef.current) return;
        const message =
          err instanceof GBIFApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Failed to load occurrences';
        // Keep prior results on failure so a transient 429 doesn't blank the globe.
        setError(message);
        setProgress(null);
      } finally {
        if (!signal.aborted && generation === fetchGenerationRef.current) {
          setLoading(false);
        }
      }
    },
    [selectedCountryCode, drawnPolygon]
  );

  useEffect(() => {
    if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
    fetchAbortRef.current?.abort();
    const generation = fetchGenerationRef.current + 1;
    fetchGenerationRef.current = generation;
    if (!hasTaxonFilter) {
      setOccurrences([]);
      setError(null);
      setLoading(false);
      setProgress(null);
      return;
    }
    setLoading(true);
    fetchTimeoutRef.current = setTimeout(() => {
      const controller = new AbortController();
      fetchAbortRef.current = controller;
      const bounds = selectedRegionBounds ?? viewBoundsRef.current;
      fetchOccurrences(bounds, controller.signal, generation);
      fetchTimeoutRef.current = null;
    }, FETCH_DEBOUNCE_MS);
    return () => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      fetchAbortRef.current?.abort();
    };
  }, [regionFetchKey, filterFetchKey, fetchOccurrences, hasTaxonFilter, selectedRegionBounds]);

  return {
    occurrences,
    loading,
    error,
    progress,
    viewBounds,
    setViewBounds,
    hasTaxonFilter,
    cancel,
  };
}
