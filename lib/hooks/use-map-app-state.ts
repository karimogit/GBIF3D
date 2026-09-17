'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { OccurrenceFilters, GBIFOccurrence } from '@/types/gbif';
import type { FavoriteRegion } from '@/lib/favorites';
import { getFavorites, addFavorite, removeFavorite } from '@/lib/favorites';
import type { Bounds, DrawnRegion, LonLat } from '@/lib/geometry';
import {
  boundsToWktPolygon,
  coordsToWktPolygon,
  formatAreaHectares,
  padBounds,
} from '@/lib/geometry';
import type { DrawShapeMode } from '@/lib/draw-shapes';
import { DEFAULT_OCCURRENCE_LIMIT } from '@/lib/gbif';
import { ION_TOKEN_CONFIGURED } from '@/lib/ion';
import { generateOccurrencePdf } from '@/lib/pdf-export';
import { parseOccurrencesFile } from '@/lib/import-occurrences';
import { filterOccurrencesInBounds, getDisplayedOccurrences } from '@/lib/displayed-occurrences';
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
  MAX_SAVED_OCCURRENCES,
} from '@/lib/saved-occurrences';
import { SAVE_OCCURRENCE_EVENT, type ExportRegionDetail } from '@/components/globe/constants';
import type { GlobeSceneHandle } from '@/components/globe/globe-handle';
import { normalizeBaseMapId, type BaseMapId } from '@/lib/base-map';
import { getRegionBounds, REGIONS } from '@/lib/regions';
import type { ShareUrlState } from '@/lib/share-url';
import { isOffline, loadOfflineSnapshot, saveOfflineSnapshot } from '@/lib/offline-cache';

export const REGION_ID_DRAWN = 'drawn';
export const REGION_ID_PLACE = 'place';
const VIEW_STORAGE_KEY = 'gbif-globe-view';
const VALID_SCENE_MODES = ['3D', '2D'] as const;

export const DEFAULT_BASE_MAP: BaseMapId = ION_TOKEN_CONFIGURED ? 'bing' : 'opentopomap';

function loadViewFromStorage(): { sceneMode: '3D' | '2D'; baseMap: BaseMapId } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(VIEW_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { sceneMode?: string; baseMap?: string };
    const storedScene = p.sceneMode === 'Columbus' ? '2D' : p.sceneMode;
    const sceneMode = VALID_SCENE_MODES.includes(storedScene as (typeof VALID_SCENE_MODES)[number])
      ? storedScene
      : null;
    let baseMap = p.baseMap != null ? normalizeBaseMapId(p.baseMap, DEFAULT_BASE_MAP) : null;
    if (baseMap === 'bing' && !ION_TOKEN_CONFIGURED) baseMap = 'opentopomap';
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
  placeSearchResult: { name: string; bounds: Bounds; countryCode?: string } | null,
  drawnPolygon: LonLat[] | null
): string {
  if (!selectedRegionId) return '';
  if (selectedRegionId === REGION_ID_DRAWN) {
    const area = drawnPolygon && drawnPolygon.length >= 3 ? formatAreaHectares(drawnPolygon) : null;
    return area ? `Drawn region (${area})` : 'Drawn region';
  }
  if (selectedRegionId === REGION_ID_PLACE && placeSearchResult) return placeSearchResult.name;
  const fromRegions = REGIONS.find((r) => r.id === selectedRegionId);
  if (fromRegions) return fromRegions.name;
  const fav = favorites.find((f) => f.id === selectedRegionId);
  if (fav) {
    const area = fav.polygon && fav.polygon.length >= 3 ? formatAreaHectares(fav.polygon) : null;
    return area ? `${fav.name} (${area})` : fav.name;
  }
  return selectedRegionId;
}

export function useMapAppState() {
  const [filters, setFilters] = useState<OccurrenceFilters>({ limit: DEFAULT_OCCURRENCE_LIMIT });
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
  const [drawShapeMode, setDrawShapeMode] = useState<DrawShapeMode>('polygon');
  const [sceneMode, setSceneMode] = useState<'3D' | '2D'>('3D');
  const [baseMap, setBaseMap] = useState<BaseMapId>(DEFAULT_BASE_MAP);
  const [photorealistic3D, setPhotorealistic3D] = useState(false);
  const [flyMode, setFlyMode] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [importedOccurrences, setImportedOccurrences] = useState<GBIFOccurrence[]>([]);
  const [savedOccurrences, setSavedOccurrences] = useState<GBIFOccurrence[]>([]);
  const [selectedOccurrenceKey, setSelectedOccurrenceKey] = useState<number | null>(null);
  const [selectedOccurrenceRequestId, setSelectedOccurrenceRequestId] = useState(0);
  const [flyNonce, setFlyNonce] = useState(0);
  const [offlineMode, setOfflineMode] = useState(false);
  const [offlineLabel, setOfflineLabel] = useState<string | null>(null);
  const [offlineOccurrences, setOfflineOccurrences] = useState<GBIFOccurrence[]>([]);
  const [savedOccurrenceLimitHit, setSavedOccurrenceLimitHit] = useState(false);

  const allOccurrencesRef = useRef<GBIFOccurrence[]>([]);
  const globeHandleRef = useRef<GlobeSceneHandle | null>(null);

  const selectedRegionBounds = getSelectedRegionBounds(
    selectedRegionId,
    favorites,
    drawnBounds,
    placeSearchResult
  );
  const selectedRegionPolygon = getSelectedRegionPolygon(selectedRegionId, favorites, drawnPolygon);
  const selectedCountryCode =
    selectedRegionId === REGION_ID_PLACE && placeSearchResult?.countryCode
      ? placeSearchResult.countryCode
      : null;

  const {
    occurrences,
    loading,
    error,
    progress,
    viewBounds,
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
    setSavedOccurrences(getSavedOccurrences());
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

  const liveOccurrences = offlineMode && offlineOccurrences.length > 0 ? offlineOccurrences : occurrences;

  const allOccurrences = useMemo(() => {
    const byKey = new Map<number, GBIFOccurrence>();
    for (const o of liveOccurrences) byKey.set(o.key, o);
    for (const o of importedOccurrences) byKey.set(o.key, o);
    for (const o of savedOccurrences) {
      if (!byKey.has(o.key)) byKey.set(o.key, o);
    }
    return Array.from(byKey.values());
  }, [liveOccurrences, importedOccurrences, savedOccurrences]);
  allOccurrencesRef.current = allOccurrences;

  const displayedOccurrences = useMemo(
    () =>
      getDisplayedOccurrences(
        liveOccurrences,
        importedOccurrences,
        selectedRegionBounds,
        selectedYear,
        selectedMonth,
        selectedRegionPolygon,
        savedOccurrences
      ),
    [
      liveOccurrences,
      importedOccurrences,
      selectedRegionBounds,
      selectedYear,
      selectedMonth,
      selectedRegionPolygon,
      savedOccurrences,
    ]
  );

  /** Map dots + timeline filter, limited to the current camera viewport (for export). */
  const visibleOnMapOccurrences = useMemo(
    () => filterOccurrencesInBounds(displayedOccurrences, viewBounds),
    [displayedOccurrences, viewBounds]
  );

  const regionDisplayName = getRegionDisplayName(
    selectedRegionId,
    favorites,
    placeSearchResult,
    drawnPolygon
  );

  const savedOccurrenceKeys = useMemo(
    () => new Set(savedOccurrences.map((o) => o.key)),
    [savedOccurrences]
  );

  const flyToBoundsKey = `${selectedRegionId}:${flyNonce}`;

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

  useEffect(() => {
    const handler = (e: Event) => {
      const { key, action } = (e as CustomEvent<{ key: number; action: 'add' | 'remove' }>).detail ?? {};
      if (!Number.isInteger(key) || !action) return;
      if (action === 'add') {
        const occ = allOccurrencesRef.current.find((o) => o.key === key);
        if (occ) {
          const ok = addSavedOccurrence(occ);
          if (!ok) setSavedOccurrenceLimitHit(true);
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

  useEffect(() => {
    if (offlineMode || !hasTaxonFilter || occurrences.length === 0) return;
    void saveOfflineSnapshot({
      occurrences,
      filters,
      regionLabel: regionDisplayName || undefined,
      savedAt: Date.now(),
    });
  }, [occurrences, filters, hasTaxonFilter, offlineMode, regionDisplayName]);

  useEffect(() => {
    const goOffline = async () => {
      if (!isOffline()) {
        setOfflineMode(false);
        setOfflineLabel(null);
        return;
      }
      const snap = await loadOfflineSnapshot();
      if (snap?.occurrences.length) {
        setOfflineMode(true);
        setOfflineLabel(snap.regionLabel ?? 'last session');
        setFilters(snap.filters);
        setOfflineOccurrences(snap.occurrences);
      } else {
        setOfflineMode(true);
        setOfflineLabel(null);
        setOfflineOccurrences([]);
      }
    };
    const handleOnline = () => {
      setOfflineMode(false);
      setOfflineLabel(null);
      setOfflineOccurrences([]);
    };
    const handleOffline = () => void goOffline();
    void goOffline();
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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
      const data = opts.scope === 'visible' ? visibleOnMapOccurrences : allOccurrences;
      const includeRegion = opts.includePolygon && selectedRegionBounds != null;
      const geojson = occurrencesToGeoJSON(
        data,
        includeRegion ? selectedRegionBounds : null,
        regionDisplayName || undefined,
        includeRegion && selectedRegionPolygon ? selectedRegionPolygon : undefined
      );
      downloadBlob(new Blob([geojson], { type: 'application/geo+json' }), 'gbif-occurrences.geojson');
    },
    [allOccurrences, visibleOnMapOccurrences, selectedRegionBounds, regionDisplayName, selectedRegionPolygon]
  );

  const handleExportCSV = useCallback(
    (opts: ExportDataOptions) => {
      const data = opts.scope === 'visible' ? visibleOnMapOccurrences : allOccurrences;
      const includeRegion = opts.includePolygon && selectedRegionBounds != null;
      const csv = occurrencesToCSV(
        data,
        includeRegion ? selectedRegionBounds : null,
        regionDisplayName || undefined,
        includeRegion ? regionPolygonWkt(selectedRegionBounds, selectedRegionPolygon) : undefined
      );
      downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'gbif-occurrences.csv');
    },
    [allOccurrences, visibleOnMapOccurrences, selectedRegionBounds, regionDisplayName, selectedRegionPolygon, regionPolygonWkt]
  );

  const handleExportPDF = useCallback(
    async (opts: ExportDataOptions) => {
      const data = opts.scope === 'visible' ? visibleOnMapOccurrences : allOccurrences;
      const includeRegion = opts.includePolygon && selectedRegionBounds != null;
      const mapBounds =
        selectedRegionBounds != null ? padBounds(selectedRegionBounds) : boundsFromOccurrences(data);
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
    [allOccurrences, visibleOnMapOccurrences, filters, selectedRegionBounds, regionDisplayName, selectedRegionPolygon, regionPolygonWkt]
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

  const handleRemoveFavorite = useCallback(
    (id: string) => {
      removeFavorite(id);
      setFavorites(getFavorites());
      if (selectedRegionId === id) setSelectedRegionId('');
    },
    [selectedRegionId]
  );

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

  const handleResetNorth = useCallback(() => {
    globeHandleRef.current?.resetNorth();
  }, []);

  const handleResetHome = useCallback(() => {
    globeHandleRef.current?.resetHome();
  }, []);

  const handleCancelDrawRegion = useCallback(() => {
    setDrawRegionMode(false);
  }, []);

  const handleStartDrawRegion = useCallback((mode: DrawShapeMode = 'polygon') => {
    setDrawShapeMode(mode);
    setFlyMode(false);
    setDrawRegionMode(true);
  }, []);

  const handleToggleFlyMode = useCallback(() => {
    setFlyMode((prev) => {
      const next = !prev;
      if (next) setDrawRegionMode(false);
      return next;
    });
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

  const handleRemoveSavedOccurrence = useCallback((key: number) => {
    removeSavedOccurrence(key);
    setSavedOccurrences(getSavedOccurrences());
  }, []);

  const hydrateFromShareUrl = useCallback((decoded: ShareUrlState) => {
    if (decoded.selectedRegionId) setSelectedRegionId(decoded.selectedRegionId);
    if (decoded.placeSearchResult) setPlaceSearchResult(decoded.placeSearchResult);
    if (decoded.filters) {
      setFilters((prev) => ({ ...prev, ...decoded.filters, limit: decoded.filters?.limit ?? prev.limit ?? DEFAULT_OCCURRENCE_LIMIT }));
    }
    if (decoded.selectedYear !== undefined) setSelectedYear(decoded.selectedYear);
    if (decoded.selectedMonth !== undefined) setSelectedMonth(decoded.selectedMonth);
    if (decoded.sceneMode) setSceneMode(decoded.sceneMode);
    if (decoded.baseMap) setBaseMap(decoded.baseMap);
    setFlyNonce((n) => n + 1);
  }, []);

  const shareUrlState: ShareUrlState = useMemo(
    () => ({
      selectedRegionId: selectedRegionId || undefined,
      placeSearchResult,
      filters,
      selectedYear,
      selectedMonth,
      sceneMode,
      baseMap,
    }),
    [selectedRegionId, placeSearchResult, filters, selectedYear, selectedMonth, sceneMode, baseMap]
  );

  return {
    filters,
    setFilters,
    selectedRegionId,
    setSelectedRegionId,
    favorites,
    drawnBounds,
    drawnPolygon,
    exportScopePrompt,
    setExportScopePrompt,
    favoriteNameOpen,
    setFavoriteNameOpen,
    favoriteName,
    setFavoriteName,
    importError,
    setImportError,
    placeSearchResult,
    setPlaceSearchResult,
    drawRegionMode,
    drawShapeMode,
    sceneMode,
    setSceneMode,
    baseMap,
    setBaseMap,
    photorealistic3D,
    setPhotorealistic3D,
    flyMode,
    selectedYear,
    setSelectedYear,
    selectedMonth,
    setSelectedMonth,
    importedOccurrences,
    savedOccurrences,
    loading,
    error,
    progress,
    cancelLoad,
    hasTaxonFilter,
    setViewBounds,
    displayedOccurrences,
    visibleOnMapOccurrences,
    allOccurrences,
    regionDisplayName,
    selectedRegionBounds,
    selectedRegionPolygon,
    savedOccurrenceKeys,
    selectedOccurrenceKey,
    selectedOccurrenceRequestId,
    flyToBoundsKey,
    offlineMode,
    offlineLabel,
    savedOccurrenceLimitHit,
    setSavedOccurrenceLimitHit,
    maxSavedOccurrences: MAX_SAVED_OCCURRENCES,
    shareUrlState,
    hydrateFromShareUrl,
    handleGlobeHandle,
    handleExportImage,
    handleExportScopeChoice,
    handleExportGeoJSON,
    handleExportCSV,
    handleExportPDF,
    handleSaveDrawnRegion,
    handleConfirmFavoriteName,
    handleRemoveFavorite,
    handleDrawnRegion,
    handleFinishDrawRegion,
    handleResetNorth,
    handleResetHome,
    handleCancelDrawRegion,
    handleStartDrawRegion,
    handleToggleFlyMode,
    handleClearDrawnRegion,
    handleImportFile,
    handleClearImport,
    handleSelectOccurrence,
    handleSelectedOccurrenceHandled,
    handleRemoveSavedOccurrence,
    setFlyNonce,
    setFlyMode,
    setDrawRegionMode,
  };
}
