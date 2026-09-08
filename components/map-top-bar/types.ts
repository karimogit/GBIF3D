import type { FavoriteRegion } from '@/lib/favorites';
import type { Bounds } from '@/lib/geometry';
import type { OccurrenceFilters, GBIFOccurrence } from '@/types/gbif';
import type { ExportDataOptions } from '@/lib/export-data';
import type { BaseMapId } from '@/lib/base-map';
import type { DrawShapeMode } from '@/lib/draw-shapes';

export type { BaseMapId, DrawShapeMode };

export interface RegionOption {
  id: string;
  label: string;
  group?: string;
  bounds?: Bounds;
  /** ISO country code when option is a place in a country; used for API filter */
  countryCode?: string;
}

export interface MapTopBarRegionProps {
  selectedRegionId: string;
  onRegionChange: (regionId: string) => void;
  favorites: FavoriteRegion[];
  drawnBounds: Bounds | null;
  placeSearchResult: { name: string; bounds: Bounds; countryCode?: string } | null;
  onPlaceSelect: (bounds: Bounds, name: string, countryCode?: string) => void;
  onStartDrawRegion?: (mode?: DrawShapeMode) => void;
  drawRegionMode?: boolean;
  drawShapeMode?: DrawShapeMode;
  onCancelDrawRegion?: () => void;
  onFinishDrawRegion?: () => void;
  onSaveDrawnRegion?: () => void;
  onClearDrawnRegion?: () => void;
  onRemoveFavorite?: (id: string) => void;
  regionBounds?: Bounds | null;
  regionName?: string;
}

export interface MapTopBarImportState {
  onImportFile?: (file: File) => void;
  importedOccurrenceCount?: number;
  importedOccurrences?: GBIFOccurrence[];
  onClearImport?: () => void;
}

export interface MapTopBarExportHandlers {
  onExportImage?: () => void;
  onExportGeoJSON?: (opts: ExportDataOptions) => void;
  onExportCSV?: (opts: ExportDataOptions) => void;
  onExportPDF?: (opts: ExportDataOptions) => void;
  occurrenceCount?: number;
  visibleOccurrenceCount?: number;
}

export interface MapTopBarSavedProps {
  savedOccurrences?: GBIFOccurrence[];
  onSelectOccurrence?: (key: number) => void;
  onRemoveSavedOccurrence?: (key: number) => void;
}

export interface MapTopBarViewOptions {
  sceneMode?: '3D' | '2D';
  onSceneModeChange?: (mode: '3D' | '2D') => void;
  baseMap?: BaseMapId;
  onBaseMapChange?: (baseMap: BaseMapId) => void;
  photorealistic3D?: boolean;
  onPhotorealistic3DChange?: (enabled: boolean) => void;
}

/** Preferred grouped prop shape for MapTopBar. */
export interface MapTopBarProps {
  region: MapTopBarRegionProps;
  filters: OccurrenceFilters;
  onFiltersChange: (f: OccurrenceFilters) => void;
  importState?: MapTopBarImportState;
  exportHandlers?: MapTopBarExportHandlers;
  saved?: MapTopBarSavedProps;
  viewOptions?: MapTopBarViewOptions;
  githubUrl?: string;
}

/**
 * Legacy flat props — accepted for a transition period / concurrent page.tsx edits.
 * Prefer the grouped {@link MapTopBarProps} shape.
 */
export type MapTopBarFlatProps = MapTopBarRegionProps &
  MapTopBarImportState &
  MapTopBarExportHandlers &
  MapTopBarSavedProps &
  MapTopBarViewOptions & {
    filters: OccurrenceFilters;
    onFiltersChange: (f: OccurrenceFilters) => void;
    githubUrl?: string;
  };

export function isGroupedMapTopBarProps(
  props: MapTopBarProps | MapTopBarFlatProps
): props is MapTopBarProps {
  return 'region' in props && props.region != null && typeof props.region === 'object';
}

/** Normalize grouped or flat props into the grouped shape used internally. */
export function normalizeMapTopBarProps(
  props: MapTopBarProps | MapTopBarFlatProps
): MapTopBarProps {
  if (isGroupedMapTopBarProps(props)) return props;
  const {
    filters,
    onFiltersChange,
    githubUrl,
    onImportFile,
    importedOccurrenceCount,
    importedOccurrences,
    onClearImport,
    onExportImage,
    onExportGeoJSON,
    onExportCSV,
    onExportPDF,
    occurrenceCount,
    visibleOccurrenceCount,
    savedOccurrences,
    onSelectOccurrence,
    onRemoveSavedOccurrence,
    sceneMode,
    onSceneModeChange,
    baseMap,
    onBaseMapChange,
    photorealistic3D,
    onPhotorealistic3DChange,
    ...region
  } = props;
  return {
    region,
    filters,
    onFiltersChange,
    githubUrl,
    importState: {
      onImportFile,
      importedOccurrenceCount,
      importedOccurrences,
      onClearImport,
    },
    exportHandlers: {
      onExportImage,
      onExportGeoJSON,
      onExportCSV,
      onExportPDF,
      occurrenceCount,
      visibleOccurrenceCount,
    },
    saved: {
      savedOccurrences,
      onSelectOccurrence,
      onRemoveSavedOccurrence,
    },
    viewOptions: {
      sceneMode,
      onSceneModeChange,
      baseMap,
      onBaseMapChange,
      photorealistic3D,
      onPhotorealistic3DChange,
    },
  };
}

export const GITHUB_REPO_DEFAULT = 'https://github.com/karimogit/GBIF3D';
export const PLACES_DEBOUNCE_MS = 400;
