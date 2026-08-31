import type { FavoriteRegion } from '@/lib/favorites';
import type { Bounds } from '@/lib/geometry';
import type { OccurrenceFilters, GBIFOccurrence } from '@/types/gbif';
import type { ExportDataOptions } from '@/lib/export-data';

export interface RegionOption {
  id: string;
  label: string;
  group?: string;
  bounds?: Bounds;
  /** ISO country code when option is a place in a country; used for API filter */
  countryCode?: string;
}

export interface MapTopBarProps {
  selectedRegionId: string;
  onRegionChange: (regionId: string) => void;
  favorites: FavoriteRegion[];
  drawnBounds: { west: number; south: number; east: number; north: number } | null;
  placeSearchResult: { name: string; bounds: Bounds; countryCode?: string } | null;
  onPlaceSelect: (bounds: Bounds, name: string, countryCode?: string) => void;
  filters: OccurrenceFilters;
  onFiltersChange: (f: OccurrenceFilters) => void;
  onStartDrawRegion?: () => void;
  drawRegionMode?: boolean;
  onCancelDrawRegion?: () => void;
  onSaveDrawnRegion?: () => void;
  onClearDrawnRegion?: () => void;
  onRemoveFavorite?: (id: string) => void;
  onExportImage?: () => void;
  onExportGeoJSON?: (opts: ExportDataOptions) => void;
  onExportCSV?: (opts: ExportDataOptions) => void;
  onExportPDF?: (opts: ExportDataOptions) => void;
  occurrenceCount?: number;
  visibleOccurrenceCount?: number;
  regionBounds?: Bounds | null;
  regionName?: string;
  onImportFile?: (file: File) => void;
  importedOccurrenceCount?: number;
  importedOccurrences?: GBIFOccurrence[];
  onClearImport?: () => void;
  savedOccurrences?: GBIFOccurrence[];
  onSelectOccurrence?: (key: number) => void;
  onRemoveSavedOccurrence?: (key: number) => void;
  sceneMode?: '3D' | '2D';
  onSceneModeChange?: (mode: '3D' | '2D') => void;
  baseMap?: 'bing' | 'osm' | 'positron' | 'dark-matter' | 'opentopomap';
  onBaseMapChange?: (baseMap: 'bing' | 'osm' | 'positron' | 'dark-matter' | 'opentopomap') => void;
  photorealistic3D?: boolean;
  onPhotorealistic3DChange?: (enabled: boolean) => void;
  githubUrl?: string;
}

export const GITHUB_REPO_DEFAULT = 'https://github.com/karimogit/GBIF3D';
export const PLACES_DEBOUNCE_MS = 400;
