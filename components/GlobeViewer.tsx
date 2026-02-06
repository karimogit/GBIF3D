'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GlobeScene from './GlobeScene';
import { searchOccurrencesChunked, OCCURRENCE_MAX_TOTAL } from '@/lib/gbif';
import { boundsToWktPolygon } from '@/lib/geometry';
import type { Bounds } from '@/lib/geometry';
import type { GBIFOccurrence, OccurrenceFilters } from '@/types/gbif';
import { GBIFApiError } from '@/lib/gbif';
import { occurrenceYear, occurrenceMonth } from '@/lib/occurrence-date';

const DEFAULT_BOUNDS: Bounds = {
  west: -180,
  south: -90,
  east: 180,
  north: 90,
};

// How long to wait after camera/filters change before refetching occurrences.
// Kept under 1s so zoom/pan with \"Current view\" feels responsive.
const FETCH_DEBOUNCE_MS = 800;

interface GlobeViewerProps {
  filters: OccurrenceFilters;
  onOccurrencesChange?: (occurrences: GBIFOccurrence[]) => void;
  /** When set, fetch and fly to this region; when null, use current view bounds */
  selectedRegionBounds?: Bounds | null;
  /** When set, fly camera to these bounds (e.g. after picking a region). Omit or pass null to skip flying (e.g. when "Current view" is selected). */
  flyToBounds?: Bounds | null;
  /** Called when the camera view bounds change (e.g. for "Save current view") */
  onViewBoundsChange?: (bounds: Bounds) => void;
  /** When true, two clicks on the globe define a region and call onDrawnBounds */
  drawRegionMode?: boolean;
  onDrawnBounds?: (bounds: Bounds) => void;
  /** Drawn region to display on the globe */
  drawnBounds?: Bounds | null;
  /** Scene mode: 3D globe, 2D map, or Columbus view (from top bar View menu) */
  sceneMode?: '3D' | '2D' | 'Columbus';
  /** Base map / imagery (from View menu) */
  baseMap?: 'bing' | 'osm' | 'positron' | 'dark-matter' | 'opentopomap';
  /** Environmental overlay (Tools: land cover) */
  environmentalLayer?: 'none' | 'landcover';
  /** Google Photorealistic 3D Tiles overlay (View menu) */
  photorealistic3D?: boolean;
  /** When set, show only occurrences from this year (from timeline). */
  timeFilterYear?: number | null;
  /** When set with timeFilterYear, show only occurrences from this month (1–12). */
  timeFilterMonth?: number | null;
  /** Imported occurrences from CSV/JSON upload; merged with API results for display. */
  importedOccurrences?: GBIFOccurrence[];
  /** Keys of saved occurrences (for "Saved ✓" in info box). */
  savedOccurrenceKeys?: Set<number>;
  /** When set, select this occurrence (opens info box and flies to it). */
  selectedOccurrenceKey?: number | null;
}

export default function GlobeViewer({
  filters,
  onOccurrencesChange,
  selectedRegionBounds = null,
  flyToBounds: flyToBoundsProp = undefined,
  onViewBoundsChange,
  drawRegionMode = false,
  onDrawnBounds,
  drawnBounds = null,
  sceneMode = '3D',
  baseMap = 'bing',
  environmentalLayer = 'none',
  photorealistic3D = false,
  timeFilterYear = null,
  timeFilterMonth = null,
  importedOccurrences = [],
  savedOccurrenceKeys,
  selectedOccurrenceKey,
}: GlobeViewerProps) {
  const [occurrences, setOccurrences] = useState<GBIFOccurrence[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewBounds, setViewBounds] = useState<Bounds>(DEFAULT_BOUNDS);
  const fetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onOccurrencesChangeRef = useRef(onOccurrencesChange);
  onOccurrencesChangeRef.current = onOccurrencesChange;

  const handleBoundsChange = useCallback(
    (b: Bounds) => {
      setViewBounds(b);
      onViewBoundsChange?.(b);
    },
    [onViewBoundsChange]
  );

  const fetchOccurrences = useCallback(
    async (bounds: Bounds) => {
      setLoading(true);
      setError(null);
      try {
        const geometry = boundsToWktPolygon(bounds);
        const res = await searchOccurrencesChunked({
          ...filters,
          geometry,
          limit: filters.limit ?? 1000,
        });
        setOccurrences(res.results);
        onOccurrencesChangeRef.current?.(res.results);
      } catch (err) {
        const message =
          err instanceof GBIFApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Failed to load occurrences';
        setError(message);
        setOccurrences([]);
        onOccurrencesChangeRef.current?.([]);
      } finally {
        setLoading(false);
      }
    },
    // Refetch when these filters change; add new filter keys here and in lib/gbif searchOccurrences params
    [
      filters.geometry,
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
    ]
  );

  const hasTaxonFilter =
    (filters.taxonKeys?.length ?? 0) > 0 || filters.taxonKey != null;

  // Refetch only when region or filters change — not on zoom/pan (viewBounds).
  useEffect(() => {
    if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
    if (!hasTaxonFilter) {
      setOccurrences([]);
      onOccurrencesChangeRef.current?.([]);
      setError(null);
      return;
    }
    fetchTimeoutRef.current = setTimeout(() => {
      fetchOccurrences(selectedRegionBounds ?? viewBounds);
      fetchTimeoutRef.current = null;
    }, FETCH_DEBOUNCE_MS);
    return () => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
    };
  }, [selectedRegionBounds, fetchOccurrences, hasTaxonFilter]);

  const displayedOccurrences = useMemo(() => {
    const combined = [...occurrences, ...(importedOccurrences ?? [])];
    if (timeFilterYear == null) return combined;
    return combined.filter((o) => {
      const year = occurrenceYear(o);
      if (year !== timeFilterYear) return false;
      // When no month is selected, show ALL occurrences for the year (including those without month data)
      if (timeFilterMonth == null) return true;
      // When a month is selected, only show occurrences that match that month
      // Occurrences without month data are excluded when filtering by month
      const month = occurrenceMonth(o);
      return month === timeFilterMonth;
    });
  }, [occurrences, importedOccurrences, timeFilterYear, timeFilterMonth]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
      }}
    >
      <GlobeScene
        occurrences={displayedOccurrences}
        savedOccurrenceKeys={savedOccurrenceKeys}
        selectedOccurrenceKey={selectedOccurrenceKey}
        onBoundsChange={handleBoundsChange}
        flyToBounds={flyToBoundsProp !== undefined ? (flyToBoundsProp ?? undefined) : (selectedRegionBounds ?? undefined)}
        drawRegionMode={drawRegionMode}
        onDrawnBounds={onDrawnBounds}
        drawnBounds={drawnBounds}
        sceneMode={sceneMode}
        baseMap={baseMap === 'bing' ? 'bing-aerial' : baseMap}
        environmentalLayer={environmentalLayer}
        photorealistic3D={photorealistic3D}
        loading={loading}
        error={error}
      />
      {/* Simple IUCN color legend for occurrence dots */}
      <div
        style={{
          position: 'absolute',
          bottom: 24,
          left: 24,
          padding: '6px 10px',
          borderRadius: 6,
          background: 'rgba(0,0,0,0.65)',
          color: '#fff',
          fontSize: 11,
          lineHeight: 1.4,
          zIndex: 996,
          pointerEvents: 'none',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 2 }}>IUCN status</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { label: 'CR', color: '#FF0000', title: 'Critically Endangered' },
            { label: 'EN', color: '#FF9800', title: 'Endangered' },
            { label: 'VU', color: '#F9A825', title: 'Vulnerable' },
            { label: 'NT', color: '#FBC02D', title: 'Near Threatened' },
            { label: 'LC', color: '#2E7D32', title: 'Least Concern' },
          ].map((item) => (
            <div
              key={item.label}
              title={item.title}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: item.color,
                  display: 'inline-block',
                }}
              />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
      {drawRegionMode && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '10px 16px',
            background: 'rgba(0,0,0,0.75)',
            color: '#fff',
            borderRadius: 8,
            fontSize: 14,
            zIndex: 997,
            pointerEvents: 'none',
          }}
        >
          Click two points on the globe to draw a region
        </div>
      )}
      {loading && (
        <>
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.15)',
              pointerEvents: 'auto',
              zIndex: 998,
            }}
          />
          <div
            role="status"
            aria-live="polite"
            aria-label="Loading occurrences"
            style={{
              position: 'absolute',
              top: 80,
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '8px 16px',
              background: 'rgba(0,0,0,0.7)',
              color: '#fff',
              borderRadius: 8,
              fontSize: 14,
              zIndex: 999,
            }}
          >
            {`Loading occurrences… (up to ${(filters.limit ?? OCCURRENCE_MAX_TOTAL).toLocaleString()} records)`}
          </div>
        </>
      )}
      {error && (
        <div
          role="alert"
          style={{
            position: 'absolute',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '8px 16px',
            background: 'rgba(198, 40, 40, 0.9)',
            color: '#fff',
            borderRadius: 8,
            maxWidth: '90%',
            zIndex: 1000,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
