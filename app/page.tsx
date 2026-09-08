'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import GlobeViewer from '@/components/GlobeViewerDynamic';
import MapTopBar from '@/components/MapTopBar';
import OccurrenceTimeline from '@/components/OccurrenceTimeline';
import IucnLegend from '@/components/IucnLegend';
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
import { DEFAULT_OCCURRENCE_LIMIT } from '@/lib/gbif';
import { ION_TOKEN_CONFIGURED } from '@/lib/ion';
import { generateOccurrencePdf } from '@/lib/pdf-export';
import { parseOccurrencesFile } from '@/lib/import-occurrences';
import { getDisplayedOccurrences } from '@/lib/displayed-occurrences';
import { useOccurrences } from '@/lib/use-occurrences';
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
import {
  SAVE_OCCURRENCE_EVENT,
  type ExportRegionDetail,
} from '@/components/globe/constants';
import type { GlobeSceneHandle } from '@/components/globe/globe-handle';
import { VALID_BASE_MAPS, type BaseMapId } from '@/lib/base-map';

const REGION_ID_DRAWN = 'drawn';
const REGION_ID_PLACE = 'place';

const VIEW_STORAGE_KEY = 'gbif-globe-view';
const VALID_SCENE_MODES = ['3D', '2D'] as const;

/** Bing imagery needs a Cesium Ion token; without one, default to Carto Positron (OSMF-friendly). */
const DEFAULT_BASE_MAP: BaseMapId = ION_TOKEN_CONFIGURED ? 'bing' : 'positron';

function loadViewFromStorage(): { sceneMode: '3D' | '2D'; baseMap: BaseMapId } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(VIEW_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { sceneMode?: string; baseMap?: string };
    // Backward compatibility: previously stored "Columbus" should now behave like 2D.
    const storedScene = p.sceneMode === 'Columbus' ? '2D' : p.sceneMode;
    const sceneMode = VALID_SCENE_MODES.includes(storedScene as (typeof VALID_SCENE_MODES)[number]) ? storedScene : null;
    let baseMap = VALID_BASE_MAPS.includes(p.baseMap as BaseMapId) ? (p.baseMap as BaseMapId) : null;
    if (baseMap === 'bing' && !ION_TOKEN_CONFIGURED) baseMap = 'positron';
    if (sceneMode != null || baseMap != null) {
      return {
        sceneMode: (sceneMode ?? '3D') as '3D' | '2D',
        baseMap: baseMap ?? DEFAULT_BASE_MAP,
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

/** Polygon outline of the active region: the drawn shape, or a favorite that was saved from a drawn shape. */
function getSelectedRegionPolygon(
  selectedRegionId: string,
  favorites: FavoriteRegion[],
  drawnPolygon: LonLat[] | null
): LonLat[] | null {
  if (!selectedRegionId) return null;
  if (selectedRegionId === REGION_ID_DRAWN) return drawnPolygon;
  return favorites.find((f) => f.id === selectedRegionId)?.polygon ?? null;
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
    limit: DEFAULT_OCCURRENCE_LIMIT,
  });
  const [selectedRegionId, setSelectedRegionId] = useState('');
  const [favorites, setFavorites] = useState<FavoriteRegion[]>([]);
  const [drawnBounds, setDrawnBounds] = useState<Bounds | null>(null);
  const [drawnPolygon, setDrawnPolygon] = useState<LonLat[] | null>(null);
  const [exportScopePrompt, setExportScopePrompt] = useState<'image' | null>(null);
  const [favoriteNameOpen, setFavoriteNameOpen] = useState(false);
  const [favoriteName, setFavoriteName] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [placeSearchResult, setPlaceSearchResult] = useState<{
    name: string;
    bounds: Bounds;
    countryCode?: string;
  } | null>(null);
  const [drawRegionMode, setDrawRegionMode] = useState(false);
  const [sceneMode, setSceneMode] = useState<'3D' | '2D'>('3D');
  const [baseMap, setBaseMap] = useState<BaseMapId>(DEFAULT_BASE_MAP);
  const [photorealistic3D, setPhotorealistic3D] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [importedOccurrences, setImportedOccurrences] = useState<GBIFOccurrence[]>([]);
  const [savedOccurrences, setSavedOccurrences] = useState<GBIFOccurrence[]>([]);
  const [selectedOccurrenceKey, setSelectedOccurrenceKey] = useState<number | null>(null);
  const [selectedOccurrenceRequestId, setSelectedOccurrenceRequestId] = useState(0);
  const [flyNonce, setFlyNonce] = useState(0);
  const allOccurrencesRef = useRef<GBIFOccurrence[]>([]);
  const globeHandleRef = useRef<GlobeSceneHandle | null>(null);

  const selectedRegionBounds = getSelectedRegionBounds(
    selectedRegionId,
    favorites,
    drawnBounds,
    placeSearchResult
  );

  const selectedRegionPolygon = getSelectedRegionPolygon(selectedRegionId, favorites, drawnPolygon);

  // Place-search results carry an ISO country code that lets the API restrict by country too
  const selectedCountryCode =
    selectedRegionId === REGION_ID_PLACE && placeSearchResult?.countryCode
      ? placeSearchResult.countryCode
      : null;

  const {
    occurrences,
    loading,
    error,
    progress,
    setViewBounds,
    hasTaxonFilter,
    cancel: cancelLoad,
  } = useOccurrences({
    filters,
    selectedRegionBounds,
    selectedCountryCode,
    drawnPolygon: selectedRegionPolygon,
  });

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

  const allOccurrences = useMemo(() => {
    const byKey = new Map<number, GBIFOccurrence>();
    for (const o of occurrences) byKey.set(o.key, o);
    for (const o of importedOccurrences) byKey.set(o.key, o);
    for (const o of savedOccurrences) {
      if (!byKey.has(o.key)) byKey.set(o.key, o);
    }
    return Array.from(byKey.values());
  }, [occurrences, importedOccurrences, savedOccurrences]);
  allOccurrencesRef.current = allOccurrences;

  const displayedOccurrences = useMemo(
    () =>
      getDisplayedOccurrences(
        occurrences,
        importedOccurrences,
        selectedRegionBounds,
        selectedYear,
        selectedMonth,
        selectedRegionPolygon,
        savedOccurrences
      ),
    [
      occurrences,
      importedOccurrences,
      selectedRegionBounds,
      selectedYear,
      selectedMonth,
      selectedRegionPolygon,
      savedOccurrences,
    ]
  );

  const regionDisplayName = getRegionDisplayName(selectedRegionId, favorites, placeSearchResult);

  const savedOccurrenceKeys = useMemo(
    () => new Set(savedOccurrences.map((o) => o.key)),
    [savedOccurrences]
  );

  const flyToBoundsKey = `${selectedRegionId}:${flyNonce}`;

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

  // Only regions with a custom outline offer a "region only" image crop; the drawn shape must be the active region.
  const exportableRegionOutline = useMemo(
    () =>
      selectedRegionBounds && selectedRegionPolygon && selectedRegionPolygon.length >= 3
        ? { bounds: selectedRegionBounds, polygon: selectedRegionPolygon }
        : null,
    [selectedRegionBounds, selectedRegionPolygon]
  );

  const buildExportDetail = useCallback(
    (scope: 'full' | 'region'): ExportRegionDetail => ({
      scope,
      ...(scope === 'region' && exportableRegionOutline ? exportableRegionOutline : {}),
    }),
    [exportableRegionOutline]
  );

  const handleGlobeHandle = useCallback((handle: GlobeSceneHandle | null) => {
    globeHandleRef.current = handle;
  }, []);

  const runImageExport = useCallback(
    (scope: 'full' | 'region') => {
      globeHandleRef.current?.exportImage(buildExportDetail(scope));
    },
    [buildExportDetail]
  );

  const handleExportImage = useCallback(() => {
    if (exportableRegionOutline) {
      setExportScopePrompt('image');
      return;
    }
    runImageExport('full');
  }, [exportableRegionOutline, runImageExport]);

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
      const includeRegion = opts.includePolygon && selectedRegionBounds != null;
      const geojson = occurrencesToGeoJSON(
        data,
        includeRegion ? selectedRegionBounds : null,
        regionDisplayName || undefined,
        includeRegion && selectedRegionPolygon ? selectedRegionPolygon : undefined
      );
      const blob = new Blob([geojson], { type: 'application/geo+json' });
      downloadBlob(blob, 'gbif-occurrences.geojson');
    },
    [allOccurrences, displayedOccurrences, selectedRegionBounds, regionDisplayName, selectedRegionPolygon]
  );

  const handleExportCSV = useCallback(
    (opts: ExportDataOptions) => {
      const data = opts.scope === 'visible' ? displayedOccurrences : allOccurrences;
      const includeRegion = opts.includePolygon && selectedRegionBounds != null;
      const csv = occurrencesToCSV(
        data,
        includeRegion ? selectedRegionBounds : null,
        regionDisplayName || undefined,
        includeRegion ? regionPolygonWkt(selectedRegionBounds, selectedRegionPolygon) : undefined
      );
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      downloadBlob(blob, 'gbif-occurrences.csv');
    },
    [allOccurrences, displayedOccurrences, selectedRegionBounds, regionDisplayName, selectedRegionPolygon, regionPolygonWkt]
  );

  const handleExportPDF = useCallback(
    async (opts: ExportDataOptions) => {
      const data = opts.scope === 'visible' ? displayedOccurrences : allOccurrences;
      const includeRegion = opts.includePolygon && selectedRegionBounds != null;
      const mapBounds =
        selectedRegionBounds != null
          ? padBounds(selectedRegionBounds)
          : boundsFromOccurrences(data);
      const url = await globeHandleRef.current?.capturePdfSnapshot({
        scope: 'full',
        frameBounds: mapBounds ?? undefined,
      });
      generateOccurrencePdf({
        occurrences: data,
        filters,
        regionName: regionDisplayName || undefined,
        regionPolygonWkt: includeRegion
          ? regionPolygonWkt(selectedRegionBounds, selectedRegionPolygon)
          : undefined,
        repoUrl: process.env.NEXT_PUBLIC_GITHUB_REPO_URL,
        mapImageDataUrl: url ?? undefined,
      });
    },
    [
      allOccurrences,
      displayedOccurrences,
      filters,
      selectedRegionBounds,
      regionDisplayName,
      selectedRegionPolygon,
      regionPolygonWkt,
    ]
  );

  const handleSaveDrawnRegion = useCallback(() => {
    if (!drawnBounds) return;
    setFavoriteName('');
    setFavoriteNameOpen(true);
  }, [drawnBounds]);

  const handleConfirmFavoriteName = useCallback(() => {
    if (!drawnBounds || !favoriteName.trim()) return;
    const added = addFavorite(favoriteName.trim(), drawnBounds, drawnPolygon);
    setFavorites(getFavorites());
    setSelectedRegionId(added.id);
    setFlyNonce((n) => n + 1);
    setDrawnBounds(null);
    setDrawnPolygon(null);
    setFavoriteNameOpen(false);
    setFavoriteName('');
  }, [drawnBounds, drawnPolygon, favoriteName]);

  const handleRemoveFavorite = useCallback((id: string) => {
    removeFavorite(id);
    setFavorites(getFavorites());
    if (selectedRegionId === id) setSelectedRegionId('');
  }, [selectedRegionId]);

  const handleDrawnRegion = useCallback((region: DrawnRegion) => {
    setDrawnBounds(region.bounds);
    setDrawnPolygon(region.polygon ?? null);
    setSelectedRegionId(REGION_ID_DRAWN);
    setFlyNonce((n) => n + 1);
    setDrawRegionMode(false);
  }, []);

  const handleFinishDrawRegion = useCallback(() => {
    globeHandleRef.current?.finishDrawing();
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
      if (parsed.length === 0) {
        setImportError(
          `No occurrences with coordinates found in "${file.name}". Use a GBIF-style CSV/TSV, JSON, or Darwin Core Archive with decimalLatitude and decimalLongitude columns.`
        );
        return;
      }
      setImportedOccurrences(parsed);
    } catch (err) {
      const reason = err instanceof Error && err.message ? ` (${err.message})` : '';
      setImportError(`Could not read "${file.name}"${reason}.`);
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
      <Dialog
        open={favoriteNameOpen}
        onClose={() => setFavoriteNameOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2, m: 1, maxWidth: 'min(420px, calc(100vw - 16px))' } }}
      >
        <DialogTitle>Save region</DialogTitle>
        <DialogContent dividers>
          <TextField
            autoFocus
            fullWidth
            label="Name this region"
            value={favoriteName}
            onChange={(e) => setFavoriteName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirmFavoriteName();
            }}
            margin="dense"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFavoriteNameOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleConfirmFavoriteName}
            disabled={!favoriteName.trim()}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={importError != null}
        onClose={() => setImportError(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2, m: 1, maxWidth: 'min(420px, calc(100vw - 16px))' } }}
      >
        <DialogTitle>Import failed</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2">{importError}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportError(null)}>OK</Button>
        </DialogActions>
      </Dialog>
      <div style={{ position: 'absolute', inset: 0 }}>
        <ErrorBoundary>
          <GlobeViewer
            occurrences={displayedOccurrences}
            loading={loading}
            error={error}
            progress={progress}
            onCancelLoad={cancelLoad}
            hasTaxonFilter={hasTaxonFilter}
            onBoundsChange={setViewBounds}
            onGlobeHandle={handleGlobeHandle}
            flyToBounds={selectedRegionBounds ?? undefined}
            flyToBoundsKey={flyToBoundsKey}
            drawRegionMode={drawRegionMode}
            onDrawnRegion={handleDrawnRegion}
            drawnBounds={
              selectedRegionId === REGION_ID_DRAWN
                ? drawnBounds
                : selectedRegionPolygon
                  ? selectedRegionBounds
                  : null
            }
            drawnPolygon={selectedRegionPolygon}
            sceneMode={sceneMode}
            baseMap={baseMap}
            photorealistic3D={photorealistic3D}
            savedOccurrenceKeys={savedOccurrenceKeys}
            selectedOccurrenceKey={selectedOccurrenceKey}
            selectedOccurrenceRequestId={selectedOccurrenceRequestId}
            onSelectedOccurrenceHandled={handleSelectedOccurrenceHandled}
          />
        </ErrorBoundary>
        {/* Bottom overlays stack vertically so the legend never covers the timeline. */}
        <div
          style={{
            position: 'absolute',
            left: 'max(24px, env(safe-area-inset-left))',
            right: 'max(24px, env(safe-area-inset-right))',
            bottom: 'max(24px, env(safe-area-inset-bottom))',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            zIndex: 900,
            pointerEvents: 'none',
          }}
        >
          <div style={{ alignSelf: 'flex-start' }}>
            <IucnLegend />
          </div>
          <OccurrenceTimeline
            occurrences={allOccurrences}
            selectedYear={selectedYear}
            selectedMonth={selectedMonth}
            onYearChange={setSelectedYear}
            onMonthChange={setSelectedMonth}
          />
        </div>
        <MapTopBar
          region={{
            selectedRegionId,
            onRegionChange: (id) => {
              setSelectedRegionId(id);
              setFlyNonce((n) => n + 1);
              if (id !== REGION_ID_PLACE) setPlaceSearchResult(null);
            },
            favorites,
            drawnBounds,
            placeSearchResult,
            onPlaceSelect: (bounds, name, countryCode) => {
              setPlaceSearchResult({ name, bounds, ...(countryCode != null ? { countryCode } : {}) });
              setSelectedRegionId(REGION_ID_PLACE);
              setFlyNonce((n) => n + 1);
            },
            onStartDrawRegion: () => setDrawRegionMode(true),
            drawRegionMode,
            onCancelDrawRegion: handleCancelDrawRegion,
            onFinishDrawRegion: handleFinishDrawRegion,
            onSaveDrawnRegion: handleSaveDrawnRegion,
            onClearDrawnRegion: handleClearDrawnRegion,
            onRemoveFavorite: handleRemoveFavorite,
            regionBounds: selectedRegionBounds,
            regionName: regionDisplayName || undefined,
          }}
          filters={filters}
          onFiltersChange={setFilters}
          importState={{
            onImportFile: handleImportFile,
            importedOccurrenceCount: importedOccurrences.length,
            importedOccurrences,
            onClearImport: importedOccurrences.length > 0 ? handleClearImport : undefined,
          }}
          exportHandlers={{
            onExportImage: handleExportImage,
            onExportGeoJSON: handleExportGeoJSON,
            onExportCSV: handleExportCSV,
            onExportPDF: handleExportPDF,
            occurrenceCount: allOccurrences.length,
            visibleOccurrenceCount: displayedOccurrences.length,
          }}
          saved={{
            savedOccurrences,
            onSelectOccurrence: handleSelectOccurrence,
            onRemoveSavedOccurrence: (key) => {
              removeSavedOccurrence(key);
              setSavedOccurrences(getSavedOccurrences());
            },
          }}
          viewOptions={{
            sceneMode,
            onSceneModeChange: setSceneMode,
            baseMap,
            onBaseMapChange: setBaseMap,
            photorealistic3D,
            onPhotorealistic3DChange: setPhotorealistic3D,
          }}
          githubUrl={process.env.NEXT_PUBLIC_GITHUB_REPO_URL}
        />
      </div>
    </main>
  );
}
