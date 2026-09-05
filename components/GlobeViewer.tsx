'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Tooltip from '@mui/material/Tooltip';
import GlobeScene from './GlobeScene';
import { searchOccurrencesChunked, DEFAULT_OCCURRENCE_LIMIT, GBIFApiError } from '@/lib/gbif';
import { boundsToWktPolygon, coordsToWktPolygon } from '@/lib/geometry';
import type { Bounds, DrawnRegion, LonLat } from '@/lib/geometry';
import type { GBIFOccurrence, OccurrenceFilters } from '@/types/gbif';
import { getDisplayedOccurrences } from '@/lib/displayed-occurrences';

const DEFAULT_BOUNDS: Bounds = {
  west: -180,
  south: -90,
  east: 180,
  north: 90,
};

// Debounce before refetching. Shorter for filter changes; region/camera uses the same
// delay but loading feedback starts immediately so the UI doesn't look idle.
const FETCH_DEBOUNCE_MS = 400;

interface GlobeViewerProps {
  filters: OccurrenceFilters;
  onOccurrencesChange?: (occurrences: GBIFOccurrence[]) => void;
  /** When set, fetch and fly to this region; when null, use current view bounds */
  selectedRegionBounds?: Bounds | null;
  /** When set (e.g. predefined country region like Sweden), restrict API to this ISO country code in addition to geometry. */
  selectedCountryCode?: string | null;
  /** When set, fly camera to these bounds (e.g. after picking a region). Omit or pass null to skip flying (e.g. when "Current view" is selected). */
  flyToBounds?: Bounds | null;
  /** When true, click on the globe to draw a polygon region */
  drawRegionMode?: boolean;
  onDrawnRegion?: (region: DrawnRegion) => void;
  /** Region outline to display on the globe (drawn region or a saved polygon favorite) */
  drawnBounds?: Bounds | null;
  /** Polygon vertices for the active region when it is a custom shape; used for fetch geometry and display filtering */
  drawnPolygon?: LonLat[] | null;
  /** Scene mode: 3D globe or 2D map (from top bar View menu) */
  sceneMode?: '3D' | '2D';
  /** Base map / imagery (from View menu) */
  baseMap?: 'bing' | 'osm' | 'positron' | 'dark-matter' | 'opentopomap';
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
  /** Monotonic id that lets repeated selections of the same occurrence retrigger. */
  selectedOccurrenceRequestId?: number;
  /** Called once the selection command has been applied or abandoned. */
  onSelectedOccurrenceHandled?: () => void;
}

export default function GlobeViewer({
  filters,
  onOccurrencesChange,
  selectedRegionBounds = null,
  selectedCountryCode = null,
  flyToBounds: flyToBoundsProp = undefined,
  drawRegionMode = false,
  onDrawnRegion,
  drawnBounds = null,
  drawnPolygon = null,
  sceneMode = '3D',
  baseMap = 'bing',
  photorealistic3D = false,
  timeFilterYear = null,
  timeFilterMonth = null,
  importedOccurrences = [],
  savedOccurrenceKeys,
  selectedOccurrenceKey,
  selectedOccurrenceRequestId,
  onSelectedOccurrenceHandled,
}: GlobeViewerProps) {
  const [occurrences, setOccurrences] = useState<GBIFOccurrence[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewBounds, setViewBounds] = useState<Bounds>(DEFAULT_BOUNDS);
  const fetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const fetchGenerationRef = useRef(0);
  const viewBoundsRef = useRef(viewBounds);
  viewBoundsRef.current = viewBounds;
  const onOccurrencesChangeRef = useRef(onOccurrencesChange);
  onOccurrencesChangeRef.current = onOccurrencesChange;

  const handleBoundsChange = useCallback((b: Bounds) => {
    setViewBounds(b);
  }, []);

  // Latest filters are read at fetch time; the fetch effect below decides *when* to refetch via filterFetchKey,
  // so UI-only filter fields (e.g. selectedSpeciesOptions) don't trigger requests.
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const fetchOccurrences = useCallback(
    async (bounds: Bounds, signal: AbortSignal, generation: number) => {
      setLoading(true);
      setError(null);
      try {
        const currentFilters = filtersRef.current;
        const geometry =
          drawnPolygon && drawnPolygon.length >= 3
            ? coordsToWktPolygon(drawnPolygon)
            : boundsToWktPolygon(bounds);
        const country = selectedCountryCode?.trim().toUpperCase() ?? currentFilters.country;
        const res = await searchOccurrencesChunked({
          ...currentFilters,
          geometry,
          country: country || undefined,
          limit: currentFilters.limit ?? DEFAULT_OCCURRENCE_LIMIT,
        }, { signal });
        if (signal.aborted || generation !== fetchGenerationRef.current) return;
        setOccurrences(res.results);
        onOccurrencesChangeRef.current?.(res.results);
      } catch (err) {
        if (signal.aborted || generation !== fetchGenerationRef.current) return;
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
        if (!signal.aborted && generation === fetchGenerationRef.current) {
          setLoading(false);
        }
      }
    },
    [selectedCountryCode, drawnPolygon]
  );

  const hasTaxonFilter =
    (filters.taxonKeys?.length ?? 0) > 0 || filters.taxonKey != null;

  /** Stable signature so filter edits always retrigger the fetch effect. */
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

  // Refetch when region or filters change — not on every camera bounds tick (that aborted
  // in-flight GBIF requests before they could finish). With no fixed region, use camera
  // bounds at fetch time via viewBoundsRef.
  useEffect(() => {
    if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
    fetchAbortRef.current?.abort();
    const generation = fetchGenerationRef.current + 1;
    fetchGenerationRef.current = generation;
    if (!hasTaxonFilter) {
      setOccurrences([]);
      onOccurrencesChangeRef.current?.([]);
      setError(null);
      setLoading(false);
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

  const displayedOccurrences = useMemo(
    () =>
      getDisplayedOccurrences(
        occurrences,
        importedOccurrences ?? [],
        selectedRegionBounds ?? null,
        timeFilterYear ?? null,
        timeFilterMonth ?? null,
        drawnPolygon
      ),
    [occurrences, importedOccurrences, selectedRegionBounds, drawnPolygon, timeFilterYear, timeFilterMonth]
  );

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
        selectedOccurrenceRequestId={selectedOccurrenceRequestId}
        onSelectedOccurrenceHandled={onSelectedOccurrenceHandled}
        onBoundsChange={handleBoundsChange}
        flyToBounds={flyToBoundsProp !== undefined ? (flyToBoundsProp ?? undefined) : (selectedRegionBounds ?? undefined)}
        drawRegionMode={drawRegionMode}
        onDrawnRegion={onDrawnRegion}
        drawnBounds={drawnBounds}
        drawnPolygon={drawnPolygon}
        sceneMode={sceneMode}
        baseMap={baseMap === 'bing' ? 'bing-aerial' : baseMap}
        photorealistic3D={photorealistic3D}
        loading={loading}
        error={error}
      />
      {/* IUCN color legend with tooltips */}
      {(() => {
        const IUCN_LEGEND_ITEMS = [
          { label: 'EX', color: '#000000', title: 'Extinct' },
          { label: 'EW', color: '#8B0000', title: 'Extinct in the Wild' },
          { label: 'CR', color: '#FF0000', title: 'Critically Endangered' },
          { label: 'EN', color: '#FF9800', title: 'Endangered' },
          { label: 'VU', color: '#F9A825', title: 'Vulnerable' },
          { label: 'NT', color: '#FBC02D', title: 'Near Threatened' },
          { label: 'LC', color: '#2E7D32', title: 'Least Concern' },
          { label: 'DD', color: '#757575', title: 'Data Deficient' },
          { label: 'NE', color: '#BDBDBD', title: 'Not Evaluated / Not Applicable' },
        ];
        return (
          <div
            style={{
              position: 'absolute',
              bottom: 'max(24px, env(safe-area-inset-bottom))',
              left: 'max(24px, env(safe-area-inset-left))',
              padding: '6px 10px',
              borderRadius: 6,
              background: 'rgba(0,0,0,0.65)',
              color: '#fff',
              fontSize: 11,
              lineHeight: 1.4,
              zIndex: 996,
              pointerEvents: 'auto',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 2 }}>IUCN status</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {IUCN_LEGEND_ITEMS.map((item) => (
                <Tooltip key={item.label} title={item.title} placement="top" arrow enterDelay={300}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      cursor: 'default',
                    }}
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
                </Tooltip>
              ))}
            </div>
          </div>
        );
      })()}
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
          Click to add polygon points. Double-click or tap Done to finish.
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
            {`Loading occurrences from GBIF… (up to ${(filters.limit ?? DEFAULT_OCCURRENCE_LIMIT).toLocaleString()} records)`}
          </div>
        </>
      )}
      {!loading && hasTaxonFilter && displayedOccurrences.length === 0 && !error && (
        <div
          role="status"
          style={{
            position: 'absolute',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '8px 16px',
            background: 'rgba(0, 0, 0, 0.7)',
            color: '#fff',
            borderRadius: 8,
            maxWidth: '90%',
            fontSize: 14,
            zIndex: 999,
            textAlign: 'center',
          }}
        >
          No occurrences found for this species in the current area. Try a broader region (e.g. World) or another filter.
        </div>
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
