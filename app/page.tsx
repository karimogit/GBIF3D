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
import { DEFAULT_OCCURRENCE_LIMIT } from '@/lib/gbif';
import { ION_TOKEN_CONFIGURED } from '@/lib/ion';
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
import {
  EXPORT_IMAGE_EVENT,
  EXPORT_PDF_CANVAS_READY_EVENT,
  EXPORT_PDF_EVENT,
  FINISH_DRAW_EVENT,
  SAVE_OCCURRENCE_EVENT,
  type ExportRegionDetail,
} from '@/components/globe/constants';

const REGION_ID_DRAWN = 'drawn';
const REGION_ID_PLACE = 'place';

const VIEW_STORAGE_KEY = 'gbif-globe-view';
const VALID_SCENE_MODES = ['3D', '2D'] as const;
const VALID_BASE_MAPS = ['bing', 'osm', 'positron', 'dark-matter', 'opentopomap'] as const;
type BaseMapId = (typeof VALID_BASE_MAPS)[number];

/** Bing imagery needs a Cesium Ion token; without one, default to a free basemap so the menu matches what's shown. */
const DEFAULT_BASE_MAP: BaseMapId = ION_TOKEN_CONFIGURED ? 'bing' : 'osm';

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
    if (baseMap === 'bing' && !ION_TOKEN_CONFIGURED) baseMap = 'osm';
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
  const [baseMap, setBaseMap] = useState<BaseMapId>(DEFAULT_BASE_MAP);
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

  const selectedRegionPolygon = getSelectedRegionPolygon(selectedRegionId, favorites, drawnPolygon);

  const displayedOccurrences = useMemo(
    () =>
      getDisplayedOccurrences(
        occurrences,
        importedOccurrences,
        selectedRegionBounds,
        selectedYear,
        selectedMonth,
        selectedRegionPolygon
      ),
    [occurrences, importedOccurrences, selectedRegionBounds, selectedYear, selectedMonth, selectedRegionPolygon]
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

  const runImageExport = useCallback(
    (scope: 'full' | 'region') => {
      window.dispatchEvent(new CustomEvent(EXPORT_IMAGE_EVENT, { detail: buildExportDetail(scope) }));
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
    (opts: ExportDataOptions) => {
      const data = opts.scope === 'visible' ? displayedOccurrences : allOccurrences;
      const includeRegion = opts.includePolygon && selectedRegionBounds != null;
      const mapBounds =
        selectedRegionBounds != null
          ? padBounds(selectedRegionBounds)
          : boundsFromOccurrences(data);
      const pdfOpts = {
        occurrences: data,
        filters,
        regionName: regionDisplayName || undefined,
        regionPolygonWkt: includeRegion
          ? regionPolygonWkt(selectedRegionBounds, selectedRegionPolygon)
          : undefined,
        repoUrl: process.env.NEXT_PUBLIC_GITHUB_REPO_URL,
      };
      let generated = false;
      const onCanvasReady = (e: Event) => {
        if (generated) return;
        generated = true;
        window.removeEventListener(EXPORT_PDF_CANVAS_READY_EVENT, onCanvasReady);
        const detail = (e as CustomEvent<{ imageDataUrl: string | null }>).detail;
        generateOccurrencePdf({ ...pdfOpts, mapImageDataUrl: detail?.imageDataUrl ?? undefined });
      };
      window.addEventListener(EXPORT_PDF_CANVAS_READY_EVENT, onCanvasReady);
      window.dispatchEvent(
        new CustomEvent<ExportRegionDetail>(EXPORT_PDF_EVENT, {
          detail: {
            scope: 'full',
            frameBounds: mapBounds ?? undefined,
          },
        })
      );
      setTimeout(() => {
        if (generated) return;
        generated = true;
        window.removeEventListener(EXPORT_PDF_CANVAS_READY_EVENT, onCanvasReady);
        generateOccurrencePdf(pdfOpts);
      }, 4000);
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

  // Place-search results carry an ISO country code that lets the API restrict by country too
  const selectedCountryCode =
    selectedRegionId === REGION_ID_PLACE && placeSearchResult?.countryCode
      ? placeSearchResult.countryCode
      : null;

  const handleSaveDrawnRegion = useCallback(() => {
    if (!drawnBounds) return;
    const name = window.prompt('Name this region');
    if (!name?.trim()) return;
    const added = addFavorite(name.trim(), drawnBounds, drawnPolygon);
    setFavorites(getFavorites());
    setSelectedRegionId(added.id);
    setDrawnBounds(null);
    setDrawnPolygon(null);
  }, [drawnBounds, drawnPolygon]);

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
    window.dispatchEvent(new CustomEvent(FINISH_DRAW_EVENT));
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
        window.alert(
          `No occurrences with coordinates found in "${file.name}". Use a GBIF-style CSV/TSV, JSON, or Darwin Core Archive with decimalLatitude and decimalLongitude columns.`
        );
        return;
      }
      setImportedOccurrences(parsed);
    } catch (err) {
      const reason = err instanceof Error && err.message ? ` (${err.message})` : '';
      window.alert(`Could not read "${file.name}"${reason}.`);
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
            drawnBounds={selectedRegionId === REGION_ID_DRAWN ? drawnBounds : selectedRegionPolygon ? selectedRegionBounds : null}
            drawnPolygon={selectedRegionPolygon}
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
