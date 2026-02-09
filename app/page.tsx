'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import GlobeViewer from '@/components/GlobeViewerDynamic';
import MapTopBar from '@/components/MapTopBar';
import OccurrenceTimeline from '@/components/OccurrenceTimeline';
import ErrorBoundary from '@/components/ErrorBoundary';
import Lightbox from '@/components/Lightbox';
import type { OccurrenceFilters } from '@/types/gbif';
import type { GBIFOccurrence } from '@/types/gbif';
import { getRegionBounds, REGIONS } from '@/lib/regions';
import {
  getFavorites,
  addFavorite,
  removeFavorite,
  type FavoriteRegion,
} from '@/lib/favorites';
import type { Bounds } from '@/lib/geometry';
import { generateOccurrencePdf } from '@/lib/pdf-export';
import { parseOccurrencesFile } from '@/lib/import-occurrences';
import {
  getSavedOccurrences,
  addSavedOccurrence,
  removeSavedOccurrence,
} from '@/lib/saved-occurrences';
import { SAVE_OCCURRENCE_EVENT } from '@/components/GlobeScene';

const REGION_ID_DRAWN = 'drawn';
const REGION_ID_PLACE = 'place';
const REGION_ID_CURRENT_VIEW = 'current-view';

const VIEW_STORAGE_KEY = 'gbif-globe-view';
const VALID_SCENE_MODES = ['3D', '2D', 'Columbus'] as const;
const VALID_BASE_MAPS = ['bing', 'osm', 'positron', 'dark-matter', 'opentopomap'] as const;

function loadViewFromStorage(): { sceneMode: '3D' | '2D' | 'Columbus'; baseMap: typeof VALID_BASE_MAPS[number] } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(VIEW_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { sceneMode?: string; baseMap?: string };
    const sceneMode = VALID_SCENE_MODES.includes(p.sceneMode as (typeof VALID_SCENE_MODES)[number]) ? p.sceneMode : null;
    const baseMap = VALID_BASE_MAPS.includes(p.baseMap as (typeof VALID_BASE_MAPS)[number]) ? p.baseMap : null;
    if (sceneMode != null || baseMap != null) {
      return {
        sceneMode: (sceneMode ?? '3D') as '3D' | '2D' | 'Columbus',
        baseMap: (baseMap ?? 'bing') as (typeof VALID_BASE_MAPS)[number],
      };
    }
  } catch {
    // ignore
  }
  return null;
}

function occurrencesToGeoJSON(occurrences: GBIFOccurrence[]): string {
  const features = occurrences
    .filter(
      (o) =>
        o.decimalLatitude != null &&
        o.decimalLongitude != null &&
        Number.isFinite(o.decimalLatitude) &&
        Number.isFinite(o.decimalLongitude)
    )
    .map((o) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [o.decimalLongitude!, o.decimalLatitude!],
      },
      // Include the full GBIF occurrence record (plus any imported fields) as properties
      properties: { ...o },
    }));
  const fc = { type: 'FeatureCollection' as const, features };
  return JSON.stringify(fc, null, 2);
}

function occurrencesToCSV(occurrences: GBIFOccurrence[]): string {
  // Build a header row that covers all keys present in the occurrence objects.
  // Start with a preferred order for common GBIF fields, then append any extras.
  const preferredOrder = [
    'key',
    'scientificName',
    'vernacularName',
    'decimalLatitude',
    'decimalLongitude',
    'year',
    'month',
    'day',
    'eventDate',
    'locality',
    'countryCode',
    'iucnRedListCategory',
    'basisOfRecord',
    'datasetKey',
    'datasetName',
    'occurrenceID',
    'institutionCode',
    'recordedBy',
  ];

  const allKeys = new Set<string>();
  for (const o of occurrences) {
    Object.keys(o as object).forEach((k) => allKeys.add(k));
  }

  const headers = [
    ...preferredOrder.filter((k) => allKeys.has(k)),
    ...Array.from(allKeys).filter((k) => !preferredOrder.includes(k)).sort(),
  ];

  const escape = (v: unknown): string =>
    v == null ? '' : String(v).includes(',') ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  const rows = occurrences.map((o) =>
    headers.map((h) => escape((o as unknown as Record<string, unknown>)[h])).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

function getSelectedRegionBounds(
  selectedRegionId: string,
  favorites: FavoriteRegion[],
  drawnBounds: Bounds | null,
  placeSearchResult: { name: string; bounds: Bounds; countryCode?: string } | null,
  viewBounds: Bounds | null
): Bounds | null {
  if (!selectedRegionId) return null;
  if (selectedRegionId === REGION_ID_CURRENT_VIEW) return viewBounds ?? null;
  if (selectedRegionId === REGION_ID_DRAWN && drawnBounds) return drawnBounds;
  if (selectedRegionId === REGION_ID_PLACE && placeSearchResult) return placeSearchResult.bounds;
  const fromRegions = getRegionBounds(selectedRegionId);
  if (fromRegions) return fromRegions;
  const fav = favorites.find((f) => f.id === selectedRegionId);
  return fav?.bounds ?? null;
}

function getRegionDisplayName(
  selectedRegionId: string,
  favorites: FavoriteRegion[],
  placeSearchResult: { name: string; bounds: Bounds; countryCode?: string } | null
): string {
  if (!selectedRegionId) return '';
  if (selectedRegionId === REGION_ID_CURRENT_VIEW) return 'Current view';
  if (selectedRegionId === REGION_ID_DRAWN) return 'Drawn region';
  if (selectedRegionId === REGION_ID_PLACE && placeSearchResult) return placeSearchResult.name;
  const fromRegions = REGIONS.find((r) => r.id === selectedRegionId);
  if (fromRegions) return fromRegions.name;
  const fav = favorites.find((f) => f.id === selectedRegionId);
  if (fav) return fav.name;
  return selectedRegionId;
}

export default function Home() {
  const [filters, setFilters] = useState<OccurrenceFilters>({
    limit: 1000,
  });
  const [occurrences, setOccurrences] = useState<GBIFOccurrence[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState(REGION_ID_CURRENT_VIEW);
  const [favorites, setFavorites] = useState<FavoriteRegion[]>([]);
  const [drawnBounds, setDrawnBounds] = useState<Bounds | null>(null);
  const [placeSearchResult, setPlaceSearchResult] = useState<{
    name: string;
    bounds: Bounds;
    countryCode?: string;
  } | null>(null);
  const [drawRegionMode, setDrawRegionMode] = useState(false);
  const [sceneMode, setSceneMode] = useState<'3D' | '2D' | 'Columbus'>('3D');
  const [baseMap, setBaseMap] = useState<'bing' | 'osm' | 'positron' | 'dark-matter' | 'opentopomap'>('bing');
  const viewBoundsRef = useRef<Bounds | null>(null);
  const [hasViewBounds, setHasViewBounds] = useState(false);
  const [viewBounds, setViewBounds] = useState<Bounds | null>(null);
  const [photorealistic3D, setPhotorealistic3D] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [importedOccurrences, setImportedOccurrences] = useState<GBIFOccurrence[]>([]);
  const [savedOccurrences, setSavedOccurrences] = useState<GBIFOccurrence[]>([]);
  const [selectedOccurrenceKey, setSelectedOccurrenceKey] = useState<number | null>(null);
  const allOccurrencesRef = useRef<GBIFOccurrence[]>([]);

  useEffect(() => {
    setFavorites(getFavorites());
  }, []);

  useEffect(() => {
    setSavedOccurrences(getSavedOccurrences());
  }, []);

  useEffect(() => {
    const saved = loadViewFromStorage();
    if (saved) {
      setSceneMode(saved.sceneMode);
      setBaseMap(saved.baseMap);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify({ sceneMode, baseMap }));
    } catch {
      // ignore
    }
  }, [sceneMode, baseMap]);

  const allOccurrences = useMemo(
    () => [...occurrences, ...importedOccurrences],
    [occurrences, importedOccurrences]
  );
  allOccurrencesRef.current = allOccurrences;

  const savedOccurrenceKeys = useMemo(
    () => new Set(savedOccurrences.map((o) => o.key)),
    [savedOccurrences]
  );

  // Reset timeline year/month when species filter changes (so new species shows all data, not filtered by old year)
  const prevTaxonKeysRef = useRef<number[] | undefined>(filters.taxonKeys);
  const prevTaxonKeyRef = useRef<number | undefined>(filters.taxonKey);
  useEffect(() => {
    const taxonChanged =
      prevTaxonKeysRef.current !== filters.taxonKeys ||
      prevTaxonKeyRef.current !== filters.taxonKey;
    const hasTaxon = (filters.taxonKeys?.length ?? 0) > 0 || filters.taxonKey != null;
    if (taxonChanged) {
      if (hasTaxon) {
        setSelectedYear(null);
        setSelectedMonth(null);
      }
      prevTaxonKeysRef.current = filters.taxonKeys;
      prevTaxonKeyRef.current = filters.taxonKey;
    }
  }, [filters.taxonKeys, filters.taxonKey]);

  // Timeline year/month are display-only: they filter what's shown on the map but do not refetch the API.
  // This keeps all year bars visible on the timeline when you click a year (data is not replaced by a single-year response).

  useEffect(() => {
    const handler = (e: Event) => {
      const { key, action } = (e as CustomEvent<{ key: number; action: 'add' | 'remove' }>).detail ?? {};
      if (!Number.isInteger(key) || !action) return;
      if (action === 'add') {
        const occ = allOccurrencesRef.current.find((o) => o.key === key);
        if (occ) {
          addSavedOccurrence(occ);
          setSavedOccurrences(getSavedOccurrences());
        }
      } else {
        removeSavedOccurrence(key);
        setSavedOccurrences(getSavedOccurrences());
      }
    };
    window.addEventListener(SAVE_OCCURRENCE_EVENT, handler);
    return () => window.removeEventListener(SAVE_OCCURRENCE_EVENT, handler);
  }, []);

  const handleExportImage = useCallback(() => {
    window.dispatchEvent(new CustomEvent('gbif-globe-export-image'));
  }, []);

  const handleExportGeoJSON = useCallback(() => {
    const geojson = occurrencesToGeoJSON(allOccurrences);
    const blob = new Blob([geojson], { type: 'application/geo+json' });
    downloadBlob(blob, 'gbif-occurrences.geojson');
  }, [allOccurrences]);

  const handleExportCSV = useCallback(() => {
    const csv = occurrencesToCSV(allOccurrences);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, 'gbif-occurrences.csv');
  }, [allOccurrences]);

  const handleExportPDF = useCallback(() => {
    const regionName = getRegionDisplayName(selectedRegionId, favorites, placeSearchResult);
    const opts = { occurrences: allOccurrences, filters, regionName: regionName || undefined };
    let generated = false;
    const onCanvasReady = (e: Event) => {
      if (generated) return;
      generated = true;
      window.removeEventListener('gbif-globe-export-pdf-canvas-ready', onCanvasReady);
      const detail = (e as CustomEvent<{ imageDataUrl: string | null }>).detail;
      generateOccurrencePdf({ ...opts, mapImageDataUrl: detail?.imageDataUrl ?? undefined });
    };
    window.addEventListener('gbif-globe-export-pdf-canvas-ready', onCanvasReady);
    window.dispatchEvent(new CustomEvent('gbif-globe-export-pdf'));
    setTimeout(() => {
      if (generated) return;
      generated = true;
      window.removeEventListener('gbif-globe-export-pdf-canvas-ready', onCanvasReady);
      generateOccurrencePdf(opts);
    }, 2500);
  }, [allOccurrences, filters, selectedRegionId, favorites, placeSearchResult]);

  const selectedRegionBounds = getSelectedRegionBounds(
    selectedRegionId,
    favorites,
    drawnBounds,
    placeSearchResult,
    viewBounds
  );
  // When a predefined country region is selected (2-letter id), pass ISO country code to restrict API
  const selectedCountryCode =
    selectedRegionId === REGION_ID_PLACE && placeSearchResult?.countryCode
      ? placeSearchResult.countryCode
      : selectedRegionId && /^[a-z]{2}$/.test(selectedRegionId)
        ? selectedRegionId
        : null;

  const handleSaveDrawnRegion = useCallback(() => {
    if (!drawnBounds) return;
    const name = window.prompt('Name this region');
    if (!name?.trim()) return;
    const added = addFavorite(name.trim(), drawnBounds);
    setFavorites(getFavorites());
    setSelectedRegionId(added.id);
    setDrawnBounds(null);
  }, [drawnBounds]);

  const handleRemoveFavorite = useCallback((id: string) => {
    removeFavorite(id);
    setFavorites(getFavorites());
    if (selectedRegionId === id) setSelectedRegionId('');
  }, [selectedRegionId]);

  const handleDrawnBounds = useCallback((b: Bounds) => {
    setDrawnBounds(b);
    setSelectedRegionId(REGION_ID_DRAWN);
    setDrawRegionMode(false);
  }, []);

  const handleCancelDrawRegion = useCallback(() => {
    setDrawRegionMode(false);
  }, []);

  const handleClearDrawnRegion = useCallback(() => {
    setDrawnBounds(null);
    setSelectedRegionId('');
  }, []);

  const handleImportFile = useCallback(async (file: File) => {
    try {
      const parsed = await parseOccurrencesFile(file);
      setImportedOccurrences(parsed);
    } catch {
      window.alert('Could not parse file. Use GBIF-style CSV or JSON with decimalLatitude, decimalLongitude.');
    }
  }, []);

  const handleClearImport = useCallback(() => {
    setImportedOccurrences([]);
  }, []);

  const handleSelectOccurrence = useCallback((key: number) => {
    setSelectedOccurrenceKey(key);
    // Reset after a short delay so clicking the same occurrence again will work
    setTimeout(() => setSelectedOccurrenceKey(null), 100);
  }, []);

  return (
    <main
      id="main-content"
      style={{
        position: 'relative',
        width: '100%',
        height: '100dvh',
        minHeight: '100dvh',
        overflow: 'hidden',
      }}
    >
      <Lightbox />
      <div style={{ position: 'absolute', inset: 0 }}>
        <ErrorBoundary>
          <GlobeViewer
            filters={filters}
            onOccurrencesChange={setOccurrences}
            selectedRegionBounds={
              selectedRegionId === REGION_ID_CURRENT_VIEW
                ? null
                : selectedRegionBounds
            }
            selectedCountryCode={selectedRegionId === REGION_ID_CURRENT_VIEW ? null : selectedCountryCode}
            flyToBounds={selectedRegionId === REGION_ID_CURRENT_VIEW ? null : (selectedRegionBounds ?? undefined)}
            onViewBoundsChange={(b) => {
              viewBoundsRef.current = b;
              setViewBounds(b);
              setHasViewBounds(true);
            }}
            drawRegionMode={drawRegionMode}
            onDrawnBounds={handleDrawnBounds}
            drawnBounds={drawnBounds}
            sceneMode={sceneMode}
            baseMap={baseMap}
            environmentalLayer="none"
            photorealistic3D={photorealistic3D}
            timeFilterYear={selectedYear}
            timeFilterMonth={selectedMonth}
            importedOccurrences={importedOccurrences}
            savedOccurrenceKeys={savedOccurrenceKeys}
            selectedOccurrenceKey={selectedOccurrenceKey}
          />
        </ErrorBoundary>
        <OccurrenceTimeline
          occurrences={allOccurrences}
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          onYearChange={setSelectedYear}
          onMonthChange={setSelectedMonth}
        />
        <MapTopBar
          selectedRegionId={selectedRegionId}
          onRegionChange={(id) => {
            setSelectedRegionId(id);
            if (id !== REGION_ID_PLACE) setPlaceSearchResult(null);
          }}
          favorites={favorites}
          drawnBounds={drawnBounds}
          placeSearchResult={placeSearchResult}
          onPlaceSelect={(bounds, name, countryCode) => {
            setPlaceSearchResult({ name, bounds, ...(countryCode != null ? { countryCode } : {}) });
            setSelectedRegionId(REGION_ID_PLACE);
          }}
          filters={filters}
          onFiltersChange={setFilters}
          onStartDrawRegion={() => setDrawRegionMode(true)}
          drawRegionMode={drawRegionMode}
          onCancelDrawRegion={handleCancelDrawRegion}
          onSaveDrawnRegion={handleSaveDrawnRegion}
          onClearDrawnRegion={handleClearDrawnRegion}
          onRemoveFavorite={handleRemoveFavorite}
          onExportImage={handleExportImage}
          onExportGeoJSON={handleExportGeoJSON}
          onExportCSV={handleExportCSV}
          onExportPDF={handleExportPDF}
          occurrenceCount={allOccurrences.length}
          onImportFile={handleImportFile}
          importedOccurrenceCount={importedOccurrences.length}
          importedOccurrences={importedOccurrences}
          onClearImport={importedOccurrences.length > 0 ? handleClearImport : undefined}
          savedOccurrences={savedOccurrences}
          onSelectOccurrence={handleSelectOccurrence}
          onRemoveSavedOccurrence={(key) => {
            removeSavedOccurrence(key);
            setSavedOccurrences(getSavedOccurrences());
          }}
            sceneMode={sceneMode}
            onSceneModeChange={setSceneMode}
            baseMap={baseMap}
            onBaseMapChange={setBaseMap}
            photorealistic3D={photorealistic3D}
            onPhotorealistic3DChange={setPhotorealistic3D}
            githubUrl={process.env.NEXT_PUBLIC_GITHUB_REPO_URL}
          />
      </div>
    </main>
  );
}
