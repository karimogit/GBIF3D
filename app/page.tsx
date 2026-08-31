'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
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
import type { Bounds, DrawnRegion, LonLat } from '@/lib/geometry';
import { boundsToWktPolygon, coordsToWktPolygon, padBounds } from '@/lib/geometry';
import { generateOccurrencePdf } from '@/lib/pdf-export';
import { parseOccurrencesFile } from '@/lib/import-occurrences';
import { getDisplayedOccurrences } from '@/lib/displayed-occurrences';
import {
  type ExportDataOptions,
  boundsFromOccurrences,
  occurrencesToGeoJSON,
  occurrencesToCSV,
  downloadBlob,
} from '@/lib/export-data';
import {
  getSavedOccurrences,
  addSavedOccurrence,
  removeSavedOccurrence,
} from '@/lib/saved-occurrences';
import { SAVE_OCCURRENCE_EVENT } from '@/components/GlobeScene';
import type { ExportRegionDetail } from '@/components/globe/constants';

const REGION_ID_DRAWN = 'drawn';
const REGION_ID_PLACE = 'place';

const VIEW_STORAGE_KEY = 'gbif-globe-view';
const VALID_SCENE_MODES = ['3D', '2D'] as const;
const VALID_BASE_MAPS = ['bing', 'osm', 'positron', 'dark-matter', 'opentopomap'] as const;

function loadViewFromStorage(): { sceneMode: '3D' | '2D'; baseMap: typeof VALID_BASE_MAPS[number] } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(VIEW_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { sceneMode?: string; baseMap?: string };
    // Backward compatibility: previously stored "Columbus" should now behave like 2D.
    const storedScene = p.sceneMode === 'Columbus' ? '2D' : p.sceneMode;
    const sceneMode = VALID_SCENE_MODES.includes(storedScene as (typeof VALID_SCENE_MODES)[number]) ? storedScene : null;
    const baseMap = VALID_BASE_MAPS.includes(p.baseMap as (typeof VALID_BASE_MAPS)[number]) ? p.baseMap : null;
    if (sceneMode != null || baseMap != null) {
      return {
        sceneMode: (sceneMode ?? '3D') as '3D' | '2D',
        baseMap: (baseMap ?? 'bing') as (typeof VALID_BASE_MAPS)[number],
      };
    }
  } catch {
    // ignore
  }
  return null;
}

function getSelectedRegionBounds(
  selectedRegionId: string,
  favorites: FavoriteRegion[],
  drawnBounds: Bounds | null,
  placeSearchResult: { name: string; bounds: Bounds; countryCode?: string } | null
): Bounds | null {
  if (!selectedRegionId) return null;
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
  const [selectedRegionId, setSelectedRegionId] = useState('');
  const [favorites, setFavorites] = useState<FavoriteRegion[]>([]);
  const [drawnBounds, setDrawnBounds] = useState<Bounds | null>(null);
  const [drawnPolygon, setDrawnPolygon] = useState<LonLat[] | null>(null);
  const [exportScopePrompt, setExportScopePrompt] = useState<'image' | null>(null);
  const [placeSearchResult, setPlaceSearchResult] = useState<{
    name: string;
    bounds: Bounds;
    countryCode?: string;
  } | null>(null);
  const [drawRegionMode, setDrawRegionMode] = useState(false);
  const [sceneMode, setSceneMode] = useState<'3D' | '2D'>('3D');
  const [baseMap, setBaseMap] = useState<'bing' | 'osm' | 'positron' | 'dark-matter' | 'opentopomap'>('bing');
  const [photorealistic3D, setPhotorealistic3D] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [importedOccurrences, setImportedOccurrences] = useState<GBIFOccurrence[]>([]);
  const [savedOccurrences, setSavedOccurrences] = useState<GBIFOccurrence[]>([]);
  const [selectedOccurrenceKey, setSelectedOccurrenceKey] = useState<number | null>(null);
  const [selectedOccurrenceRequestId, setSelectedOccurrenceRequestId] = useState(0);
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

  const selectedRegionBounds = getSelectedRegionBounds(
    selectedRegionId,
    favorites,
    drawnBounds,
    placeSearchResult
  );

  const displayedOccurrences = useMemo(
    () =>
      getDisplayedOccurrences(
        occurrences,
        importedOccurrences,
        selectedRegionBounds,
        selectedYear,
        selectedMonth,
        selectedRegionId === REGION_ID_DRAWN ? drawnPolygon : null
      ),
    [occurrences, importedOccurrences, selectedRegionBounds, selectedYear, selectedMonth, selectedRegionId, drawnPolygon]
  );

  const regionDisplayName = getRegionDisplayName(selectedRegionId, favorites, placeSearchResult);

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

  const hasDrawnRegion = drawnBounds != null;

  const buildExportDetail = useCallback(
    (scope: 'full' | 'region'): ExportRegionDetail => ({
      scope,
      ...(scope === 'region' && drawnBounds
        ? {
            bounds: drawnBounds,
            ...(drawnPolygon ? { polygon: drawnPolygon } : {}),
          }
        : {}),
    }),
    [drawnBounds, drawnPolygon]
  );

  const runImageExport = useCallback(
    (scope: 'full' | 'region') => {
      window.dispatchEvent(
        new CustomEvent('gbif-globe-export-image', { detail: buildExportDetail(scope) })
      );
    },
    [buildExportDetail]
  );

  const handleExportImage = useCallback(() => {
    if (hasDrawnRegion) {
      setExportScopePrompt('image');
      return;
    }
    runImageExport('full');
  }, [hasDrawnRegion, runImageExport]);

  const handleExportScopeChoice = useCallback(
    (scope: 'full' | 'region') => {
      setExportScopePrompt(null);
      runImageExport(scope);
    },
    [runImageExport]
  );

  const regionPolygonWkt = useCallback(
    (bounds: Bounds | null, polygon: LonLat[] | null): string | undefined => {
      if (polygon && polygon.length >= 3) return coordsToWktPolygon(polygon);
      if (bounds) return boundsToWktPolygon(bounds);
      return undefined;
    },
    []
  );

  const handleExportGeoJSON = useCallback(
    (opts: ExportDataOptions) => {
      const data = opts.scope === 'visible' ? displayedOccurrences : allOccurrences;
      const includeRegion = opts.includePolygon && selectedRegionBounds;
      const regionBounds = includeRegion ? selectedRegionBounds : null;
      const geojson = occurrencesToGeoJSON(
        data,
        regionBounds,
        regionDisplayName || undefined,
        includeRegion && drawnPolygon ? drawnPolygon : undefined
      );
      const blob = new Blob([geojson], { type: 'application/geo+json' });
      downloadBlob(blob, 'gbif-occurrences.geojson');
    },
    [allOccurrences, displayedOccurrences, selectedRegionBounds, regionDisplayName, drawnPolygon]
  );

  const handleExportCSV = useCallback(
    (opts: ExportDataOptions) => {
      const data = opts.scope === 'visible' ? displayedOccurrences : allOccurrences;
      const includeRegion = opts.includePolygon && selectedRegionBounds;
      const regionBounds = includeRegion ? selectedRegionBounds : null;
      const csv = occurrencesToCSV(
        data,
        regionBounds,
        regionDisplayName || undefined,
        includeRegion ? regionPolygonWkt(selectedRegionBounds, drawnPolygon) : undefined
      );
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      downloadBlob(blob, 'gbif-occurrences.csv');
    },
    [allOccurrences, displayedOccurrences, selectedRegionBounds, regionDisplayName, drawnPolygon, regionPolygonWkt]
  );

  const handleExportPDF = useCallback(
    (opts: ExportDataOptions) => {
      const data = opts.scope === 'visible' ? displayedOccurrences : allOccurrences;
      const includeRegion = opts.includePolygon && selectedRegionBounds;
      const regionBounds = includeRegion ? selectedRegionBounds : null;
      const mapBounds =
        selectedRegionBounds != null
          ? padBounds(selectedRegionBounds)
          : boundsFromOccurrences(data);
      const pdfOpts = {
        occurrences: data,
        filters,
        regionName: regionDisplayName || undefined,
        regionPolygonWkt: includeRegion
          ? regionPolygonWkt(selectedRegionBounds, drawnPolygon)
          : undefined,
        repoUrl: process.env.NEXT_PUBLIC_GITHUB_REPO_URL,
      };
      let generated = false;
      const onCanvasReady = (e: Event) => {
        if (generated) return;
        generated = true;
        window.removeEventListener('gbif-globe-export-pdf-canvas-ready', onCanvasReady);
        const detail = (e as CustomEvent<{ imageDataUrl: string | null }>).detail;
        generateOccurrencePdf({ ...pdfOpts, mapImageDataUrl: detail?.imageDataUrl ?? undefined });
      };
      window.addEventListener('gbif-globe-export-pdf-canvas-ready', onCanvasReady);
      window.dispatchEvent(
        new CustomEvent('gbif-globe-export-pdf', {
          detail: {
            scope: 'full' as const,
            frameBounds: mapBounds ?? undefined,
          },
        })
      );
      setTimeout(() => {
        if (generated) return;
        generated = true;
        window.removeEventListener('gbif-globe-export-pdf-canvas-ready', onCanvasReady);
        generateOccurrencePdf(pdfOpts);
      }, 4000);
    },
    [
      allOccurrences,
      displayedOccurrences,
      filters,
      selectedRegionBounds,
      regionDisplayName,
      drawnPolygon,
      regionPolygonWkt,
    ]
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
    setDrawnPolygon(null);
  }, [drawnBounds]);

  const handleRemoveFavorite = useCallback((id: string) => {
    removeFavorite(id);
    setFavorites(getFavorites());
    if (selectedRegionId === id) setSelectedRegionId('');
  }, [selectedRegionId]);

  const handleDrawnRegion = useCallback((region: DrawnRegion) => {
    setDrawnBounds(region.bounds);
    setDrawnPolygon(region.polygon ?? null);
    setSelectedRegionId(REGION_ID_DRAWN);
    setDrawRegionMode(false);
  }, []);

  const handleFinishDrawRegion = useCallback(() => {
    window.dispatchEvent(new CustomEvent('gbif-globe-finish-draw'));
  }, []);

  const handleCancelDrawRegion = useCallback(() => {
    setDrawRegionMode(false);
  }, []);

  const handleClearDrawnRegion = useCallback(() => {
    setDrawnBounds(null);
    setDrawnPolygon(null);
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
    setSelectedOccurrenceRequestId((id) => id + 1);
  }, []);

  const handleSelectedOccurrenceHandled = useCallback(() => {
    setSelectedOccurrenceKey(null);
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
      <Dialog
        open={exportScopePrompt != null}
        onClose={() => setExportScopePrompt(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2, m: 1, maxWidth: 'min(420px, calc(100vw - 16px))' } }}
      >
        <DialogTitle>Export map</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary">
            You have a drawn region on the map. Export the full screen or only the drawn polygon area?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ flexDirection: 'column', alignItems: 'stretch', gap: 1, px: 2, pb: 2 }}>
          <Button variant="contained" onClick={() => handleExportScopeChoice('region')}>
            Drawn region only
          </Button>
          <Button variant="outlined" onClick={() => handleExportScopeChoice('full')}>
            Full screen
          </Button>
          <Button onClick={() => setExportScopePrompt(null)}>Cancel</Button>
        </DialogActions>
      </Dialog>
      <div style={{ position: 'absolute', inset: 0 }}>
        <ErrorBoundary>
          <GlobeViewer
            filters={filters}
            onOccurrencesChange={setOccurrences}
            selectedRegionBounds={selectedRegionBounds}
            selectedCountryCode={selectedCountryCode}
            flyToBounds={selectedRegionBounds ?? undefined}
            drawRegionMode={drawRegionMode}
            onDrawnRegion={handleDrawnRegion}
            drawnBounds={drawnBounds}
            drawnPolygon={selectedRegionId === REGION_ID_DRAWN ? drawnPolygon : null}
            sceneMode={sceneMode}
            baseMap={baseMap}
            photorealistic3D={photorealistic3D}
            timeFilterYear={selectedYear}
            timeFilterMonth={selectedMonth}
            importedOccurrences={importedOccurrences}
            savedOccurrenceKeys={savedOccurrenceKeys}
            selectedOccurrenceKey={selectedOccurrenceKey}
            selectedOccurrenceRequestId={selectedOccurrenceRequestId}
            onSelectedOccurrenceHandled={handleSelectedOccurrenceHandled}
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
          onFinishDrawRegion={handleFinishDrawRegion}
          onSaveDrawnRegion={handleSaveDrawnRegion}
          onClearDrawnRegion={handleClearDrawnRegion}
          onRemoveFavorite={handleRemoveFavorite}
          onExportImage={handleExportImage}
          onExportGeoJSON={handleExportGeoJSON}
          onExportCSV={handleExportCSV}
          onExportPDF={handleExportPDF}
          occurrenceCount={allOccurrences.length}
          visibleOccurrenceCount={displayedOccurrences.length}
          regionBounds={selectedRegionBounds}
          regionName={regionDisplayName || undefined}
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
