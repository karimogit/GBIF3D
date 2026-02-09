'use client';

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListSubheader from '@mui/material/ListSubheader';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import FilterList from '@mui/icons-material/FilterList';
import Search from '@mui/icons-material/Search';
import Download from '@mui/icons-material/Download';
import UploadFile from '@mui/icons-material/UploadFile';
import ArrowDropDown from '@mui/icons-material/ArrowDropDown';
import ImageOutlined from '@mui/icons-material/ImageOutlined';
import MapOutlined from '@mui/icons-material/MapOutlined';
import TableChartOutlined from '@mui/icons-material/TableChartOutlined';
import PictureAsPdfOutlined from '@mui/icons-material/PictureAsPdfOutlined';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import GitHub from '@mui/icons-material/GitHub';
import EditOutlined from '@mui/icons-material/EditOutlined';
import Public from '@mui/icons-material/Public';
import HelpOutline from '@mui/icons-material/HelpOutline';
import Check from '@mui/icons-material/Check';
import BookmarkAdd from '@mui/icons-material/BookmarkAdd';
import Bookmark from '@mui/icons-material/Bookmark';
import BookmarkBorder from '@mui/icons-material/BookmarkBorder';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Link from '@mui/material/Link';
import Popover from '@mui/material/Popover';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import { REGIONS } from '@/lib/regions';
import type { FavoriteRegion } from '@/lib/favorites';
import type { Bounds } from '@/lib/geometry';
import type { OccurrenceFilters, GBIFOccurrence } from '@/types/gbif';
import FilterForm from './FilterForm';

interface RegionOption {
  id: string;
  label: string;
  group?: string;
  bounds?: Bounds;
  /** ISO country code when option is a place in a country; used for API filter */
  countryCode?: string;
}

interface MapTopBarProps {
  selectedRegionId: string;
  onRegionChange: (regionId: string) => void;
  favorites: FavoriteRegion[];
  drawnBounds: { west: number; south: number; east: number; north: number } | null;
  placeSearchResult: { name: string; bounds: Bounds; countryCode?: string } | null;
  onPlaceSelect: (bounds: Bounds, name: string, countryCode?: string) => void;
  filters: OccurrenceFilters;
  onFiltersChange: (f: OccurrenceFilters) => void;
  /** Draw region on the globe */
  onStartDrawRegion?: () => void;
  drawRegionMode?: boolean;
  onCancelDrawRegion?: () => void;
  /** Save drawn region as favorite; shown when drawnBounds is set */
  onSaveDrawnRegion?: () => void;
  /** Clear drawn region; shown when selected region is drawn */
  onClearDrawnRegion?: () => void;
  /** Remove a saved favorite */
  onRemoveFavorite?: (id: string) => void;
  onExportImage?: () => void;
  onExportGeoJSON?: () => void;
  onExportCSV?: () => void;
  onExportPDF?: () => void;
  occurrenceCount?: number;
  /** Import GBIF occurrence CSV/JSON; called with selected file */
  onImportFile?: (file: File) => void;
  /** Number of imported occurrences (for showing count and clear button) */
  importedOccurrenceCount?: number;
  /** Imported occurrence records (for summary: species list, etc.) */
  importedOccurrences?: GBIFOccurrence[];
  /** Clear imported occurrences; shown when importedOccurrenceCount > 0 */
  onClearImport?: () => void;
  /** Saved occurrences (from info box Save button); show list and remove */
  savedOccurrences?: GBIFOccurrence[];
  /** When clicking a saved occurrence, select it (opens info box and flies to it). */
  onSelectOccurrence?: (key: number) => void;
  onRemoveSavedOccurrence?: (key: number) => void;
  /** Current scene mode (3D / 2D / Columbus); shown in View menu */
  sceneMode?: '3D' | '2D' | 'Columbus';
  /** Called when user selects a scene mode from the View menu */
  onSceneModeChange?: (mode: '3D' | '2D' | 'Columbus') => void;
  /** Current base map (imagery); shown in View menu */
  baseMap?: 'bing' | 'osm' | 'positron' | 'dark-matter' | 'opentopomap';
  /** Called when user selects a base map from the View menu */
  onBaseMapChange?: (baseMap: 'bing' | 'osm' | 'positron' | 'dark-matter' | 'opentopomap') => void;
  /** Google Photorealistic 3D Tiles overlay (Cesium Ion) */
  photorealistic3D?: boolean;
  onPhotorealistic3DChange?: (enabled: boolean) => void;
  /** GitHub repo URL for the "View on GitHub" button (e.g. https://github.com/org/gbif-globe) */
  githubUrl?: string;
}

const GITHUB_REPO_DEFAULT = 'https://github.com/karimogit/GBIF3D';

const PLACES_DEBOUNCE_MS = 400;

/** Summary of imported occurrences: record count, species list, and actions */
function ImportSummaryContent({
  importedOccurrences,
  onChooseFile,
  onClear,
  hasClear,
}: {
  importedOccurrences: GBIFOccurrence[];
  onChooseFile: () => void;
  onClear: () => void;
  hasClear: boolean;
}) {
  const { total, speciesList } = useMemo(() => {
    const total = importedOccurrences.length;
    const byName = new Map<string, number>();
    for (const o of importedOccurrences) {
      const name = (o.scientificName || o.vernacularName || 'Unknown')?.trim() || 'Unknown';
      byName.set(name, (byName.get(name) ?? 0) + 1);
    }
    const speciesList = Array.from(byName.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
    return { total, speciesList };
  }, [importedOccurrences]);

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
        Import summary
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {total.toLocaleString()} record{total !== 1 ? 's' : ''}, {speciesList.length} species
      </Typography>
      <Box sx={{ maxHeight: 220, overflowY: 'auto', mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1 }}>
        {speciesList.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No species names in data
          </Typography>
        ) : (
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {speciesList.map(({ name, count }) => (
              <Typography key={name} component="li" variant="body2" sx={{ py: 0.25 }}>
                {name}
                {count > 1 && (
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                    ({count})
                  </Typography>
                )}
              </Typography>
            ))}
          </Box>
        )}
      </Box>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button size="small" variant="outlined" startIcon={<UploadFile />} onClick={onChooseFile}>
          Choose another file
        </Button>
        {hasClear && (
          <Button size="small" color="secondary" startIcon={<DeleteOutline />} onClick={onClear}>
            Clear import
          </Button>
        )}
      </Box>
    </Box>
  );
}

export default function MapTopBar({
  selectedRegionId,
  onRegionChange,
  favorites,
  drawnBounds,
  placeSearchResult,
  onPlaceSelect,
  filters,
  onFiltersChange,
  onStartDrawRegion,
  drawRegionMode = false,
  onCancelDrawRegion,
  onSaveDrawnRegion,
  onClearDrawnRegion,
  onRemoveFavorite,
  onExportImage,
  onExportGeoJSON,
  onExportCSV,
  onExportPDF,
  occurrenceCount = 0,
  onImportFile,
  importedOccurrenceCount = 0,
  importedOccurrences = [],
  onClearImport,
  savedOccurrences = [],
  onSelectOccurrence,
  onRemoveSavedOccurrence,
  sceneMode = '3D',
  onSceneModeChange,
  baseMap = 'bing',
  onBaseMapChange,
  photorealistic3D = false,
  onPhotorealistic3DChange,
  githubUrl = GITHUB_REPO_DEFAULT,
}: MapTopBarProps) {
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeResults, setPlaceResults] = useState<RegionOption[]>([]);
  const [placeLoading, setPlaceLoading] = useState(false);
  const [filterAnchor, setFilterAnchor] = useState<null | HTMLElement>(null);
  const [exportMenuAnchor, setExportMenuAnchor] = useState<null | HTMLElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importSummaryAnchor, setImportSummaryAnchor] = useState<null | HTMLElement>(null);
  const [savedOccurrencesAnchor, setSavedOccurrencesAnchor] = useState<null | HTMLElement>(null);
  const [viewMenuAnchor, setViewMenuAnchor] = useState<null | HTMLElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [aboutMenuAnchor, setAboutMenuAnchor] = useState<null | HTMLElement>(null);
  const [savedMenuAnchor, setSavedMenuAnchor] = useState<null | HTMLElement>(null);
  const [moreMenuAnchor, setMoreMenuAnchor] = useState<null | HTMLElement>(null);
  const placeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moreButtonAnchorRef = useRef<HTMLElement | null>(null);

  const fetchPlaces = useCallback(async (q: string) => {
    if (!q || q.length < 2) {
      setPlaceResults([]);
      return;
    }
    setPlaceLoading(true);
    try {
      const res = await fetch(`/api/places/search?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as {
        results: Array<{ display_name: string; place_id: number; bounds: Bounds; country_code?: string }>;
      };
      const list = (data.results ?? []).map((r) => ({
        id: `place-${r.place_id}`,
        label: r.display_name,
        group: 'Places',
        bounds: r.bounds,
        ...(r.country_code ? { countryCode: r.country_code } : {}),
      }));
      setPlaceResults(list);
    } catch {
      setPlaceResults([]);
    } finally {
      setPlaceLoading(false);
    }
  }, []);

  useEffect(() => {
    if (placeTimeoutRef.current) clearTimeout(placeTimeoutRef.current);
    placeTimeoutRef.current = setTimeout(() => {
      fetchPlaces(placeQuery);
      placeTimeoutRef.current = null;
    }, PLACES_DEBOUNCE_MS);
    return () => {
      if (placeTimeoutRef.current) clearTimeout(placeTimeoutRef.current);
    };
  }, [placeQuery, fetchPlaces]);

  const staticOptions = useMemo(() => {
    const list: RegionOption[] = [
      { id: 'current-view', label: 'Current view' },
      ...(drawnBounds != null ? [{ id: 'drawn', label: 'Drawn region' }] : []),
      ...REGIONS.map((r) => ({ id: r.id, label: r.name })),
      ...(favorites.length > 0
        ? favorites.map((f) => ({ id: f.id, label: f.name, group: 'Saved' }))
        : []),
    ];
    return list;
  }, [drawnBounds, favorites]);

  const options = useMemo(
    () => (placeResults.length > 0 ? [...staticOptions, ...placeResults] : staticOptions),
    [staticOptions, placeResults]
  );

  const value = useMemo(() => {
    if (selectedRegionId === 'place' && placeSearchResult) {
      return { id: 'place', label: placeSearchResult.name };
    }
    return options.find((o) => o.id === selectedRegionId) ?? null;
  }, [selectedRegionId, placeSearchResult, options]);

  const handleChange = useCallback(
    (_: unknown, newValue: RegionOption | null) => {
      if (!newValue) {
        onRegionChange('');
        return;
      }
      if (newValue.bounds) {
        onPlaceSelect(newValue.bounds, newValue.label, newValue.countryCode);
      } else {
        onRegionChange(newValue.id);
      }
    },
    [onRegionChange, onPlaceSelect]
  );

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 'max(8px, env(safe-area-inset-top))',
        left: 'max(8px, env(safe-area-inset-left))',
        right: 'max(8px, env(safe-area-inset-right))',
        zIndex: 1300,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1,
        backgroundColor: 'transparent',
        borderRadius: 2,
        p: 0.5,
        pl: 1,
        pointerEvents: 'none',
        '& > *': { pointerEvents: 'auto' },
        '& .MuiButton-root': {
          backgroundColor: 'rgba(255, 255, 255, 0.92)',
          '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.98)' },
          minHeight: 44,
          minWidth: 44,
          '@media (min-width: 600px)': { minHeight: 'auto', minWidth: 'auto' },
        },
        '& .MuiIconButton-root': { minWidth: 44, minHeight: 44 },
        '& .MuiOutlinedInput-root': {
          backgroundColor: 'rgba(255, 255, 255, 0.92)',
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0,0,0,0.23)' },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.main' },
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: { xs: '1 1 100%', sm: 1 }, maxWidth: { sm: 'calc(100% - 200px)' }, pointerEvents: 'auto' }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1,
            py: 0.5,
            borderRadius: 1,
            backgroundColor: 'rgba(255, 255, 255, 0.92)',
          }}
        >
          <Box
            component="img"
            src="/icon.svg"
            alt=""
            sx={{ width: 32, height: 32, flexShrink: 0 }}
          />
          <Typography variant="subtitle1" sx={{ fontWeight: 600, flexShrink: 0, display: { xs: 'none', sm: 'block' } }}>
            GBIF 3D
          </Typography>
        </Box>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, display: { xs: 'none', sm: 'block' } }} />
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            flex: { xs: 1, sm: 'none' },
            minWidth: { xs: 120, sm: 0 },
            maxWidth: { xs: '100%', sm: 'none' },
            backgroundColor: 'rgba(255, 255, 255, 0.92)',
            borderRadius: 1,
            border: '1px solid rgba(0, 0, 0, 0.12)',
            pl: 0.5,
            pr: 0.5,
            py: 0.25,
            '& .MuiOutlinedInput-root': {
              backgroundColor: 'transparent',
              '& fieldset': { border: 'none' },
              '&:hover fieldset': { border: 'none' },
              '&.Mui-focused fieldset': { border: 'none', boxShadow: 'none' },
            },
            '& .MuiButton-root': {
              backgroundColor: 'transparent',
              '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.06)' },
            },
          }}
        >
          <Autocomplete
            value={value}
            onChange={handleChange}
            onInputChange={(_, v) => setPlaceQuery(v)}
            options={options}
            getOptionLabel={(o) => o.label}
            isOptionEqualToValue={(a, b) => a.id === b.id && a.label === b.label}
            groupBy={(o) => o.group ?? ''}
            renderGroup={(params) => (
              <li key={params.key}>
                {params.group ? (
                  <ListSubheader component="div" sx={{ lineHeight: 2 }}>
                    {params.group}
                  </ListSubheader>
                ) : null}
                {params.children}
              </li>
            )}
            size="small"
            sx={{ minWidth: { xs: 0, sm: 200 } }}
            loading={placeLoading}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder="Search places..."
                size="small"
                variant="outlined"
                sx={{
                  ...(value
                    ? {
                        '& .MuiOutlinedInput-input': {
                          paddingRight: 4,
                        },
                      }
                    : {}),
                }}
                InputProps={{
                  ...params.InputProps,
                  startAdornment: (
                    <>
                      <Search sx={{ color: 'action.active', mr: 0.5, fontSize: 20 }} />
                      {params.InputProps.startAdornment}
                    </>
                  ),
                  endAdornment: (
                    <>
                      {placeLoading ? <CircularProgress color="inherit" size={18} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
          />
          {onStartDrawRegion != null && (
            <>
              {drawRegionMode && onCancelDrawRegion ? (
                <Button
                  variant="text"
                  size="small"
                  color="secondary"
                  onClick={onCancelDrawRegion}
                  aria-label="Cancel drawing"
                  sx={{ minWidth: 0, flexShrink: 0 }}
                >
                  Cancel
                </Button>
              ) : (
                <IconButton
                  size="small"
                  onClick={onStartDrawRegion}
                  disabled={drawRegionMode}
                  aria-label="Draw a region on the globe"
                  sx={{ flexShrink: 0 }}
                >
                  <EditOutlined fontSize="small" />
                </IconButton>
              )}
              {drawnBounds != null && selectedRegionId === 'drawn' && (
                <>
                  {onSaveDrawnRegion && (
                    <Button
                      variant="text"
                      size="small"
                      startIcon={<BookmarkAdd />}
                      onClick={onSaveDrawnRegion}
                      aria-label="Save drawn region as favorite"
                      sx={{ minWidth: 0, flexShrink: 0 }}
                    >
                      Save
                    </Button>
                  )}
                  {onClearDrawnRegion && (
                    <Button
                      variant="text"
                      size="small"
                      color="secondary"
                      startIcon={<DeleteOutline />}
                      onClick={onClearDrawnRegion}
                      aria-label="Clear drawn region"
                      sx={{ minWidth: 0, flexShrink: 0 }}
                    >
                      Clear
                    </Button>
                  )}
                </>
              )}
            </>
          )}
        </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5, flexShrink: 0, flex: 1, minWidth: 0 }}>
      <Button
        variant="outlined"
        size="small"
        startIcon={<FilterList />}
        endIcon={<ArrowDropDown />}
        onClick={(e) => setFilterAnchor(e.currentTarget)}
        aria-label="Filters"
        aria-haspopup="true"
        aria-expanded={Boolean(filterAnchor)}
        sx={{
          minWidth: 0,
          bgcolor: filterAnchor ? 'action.selected' : undefined,
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        Filters
      </Button>
      {/* On mobile: single "More" menu; on desktop: individual buttons */}
      <Button
        variant="outlined"
        size="small"
        endIcon={<ArrowDropDown />}
        onClick={(e) => {
          moreButtonAnchorRef.current = e.currentTarget;
          setMoreMenuAnchor(e.currentTarget);
        }}
        aria-label="More options"
        aria-haspopup="true"
        aria-expanded={Boolean(moreMenuAnchor)}
        sx={{
          minWidth: 0,
          display: { xs: 'inline-flex', sm: 'none' },
          bgcolor: moreMenuAnchor ? 'action.selected' : undefined,
        }}
      >
        More
      </Button>
      <Menu
        anchorEl={moreMenuAnchor}
        open={Boolean(moreMenuAnchor)}
        onClose={() => setMoreMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { minWidth: 220, maxWidth: 'min(420px, calc(100vw - 24px))', maxHeight: 'min(70vh, 400px)' } } }}
      >
        {favorites.length > 0 && onRemoveFavorite && (
          <MenuItem
            onClick={() => {
              setMoreMenuAnchor(null);
              setSavedMenuAnchor(moreButtonAnchorRef.current);
            }}
          >
            <ListItemIcon><Bookmark fontSize="small" /></ListItemIcon>
            <ListItemText primary="Saved regions" />
          </MenuItem>
        )}
        {onImportFile && (
          <MenuItem
            onClick={() => {
              setMoreMenuAnchor(null);
              setImportDialogOpen(true);
            }}
          >
            <ListItemIcon><UploadFile fontSize="small" /></ListItemIcon>
            <ListItemText primary={`Import${importedOccurrenceCount > 0 ? ` (${importedOccurrenceCount})` : ''}`} />
          </MenuItem>
        )}
        {savedOccurrences.length > 0 && (
          <MenuItem
            onClick={() => {
              setMoreMenuAnchor(null);
              setSavedOccurrencesAnchor(moreButtonAnchorRef.current);
            }}
          >
            <ListItemIcon><Bookmark fontSize="small" /></ListItemIcon>
            <ListItemText primary={`Saved occurrences (${savedOccurrences.length})`} />
          </MenuItem>
        )}
        {(onExportImage || onExportGeoJSON || onExportCSV || onExportPDF) &&
          [
            onExportImage && (
              <MenuItem
                key="more-export-img"
                onClick={() => {
                  onExportImage();
                  setMoreMenuAnchor(null);
                }}
              >
                <ListItemIcon><ImageOutlined fontSize="small" /></ListItemIcon>
                <ListItemText primary="Export as image" />
              </MenuItem>
            ),
            onExportGeoJSON && (
              <MenuItem key="more-export-geojson" onClick={() => { onExportGeoJSON?.(); setMoreMenuAnchor(null); }} disabled={occurrenceCount === 0}>
                <ListItemIcon><MapOutlined fontSize="small" /></ListItemIcon>
                <ListItemText primary="Export as GeoJSON" />
              </MenuItem>
            ),
            onExportCSV && (
              <MenuItem key="more-export-csv" onClick={() => { onExportCSV?.(); setMoreMenuAnchor(null); }} disabled={occurrenceCount === 0}>
                <ListItemIcon><TableChartOutlined fontSize="small" /></ListItemIcon>
                <ListItemText primary="Export as CSV" />
              </MenuItem>
            ),
            onExportPDF && (
              <MenuItem key="more-export-pdf" onClick={() => { onExportPDF?.(); setMoreMenuAnchor(null); }} disabled={occurrenceCount === 0}>
                <ListItemIcon><PictureAsPdfOutlined fontSize="small" /></ListItemIcon>
                <ListItemText primary="Export as PDF" />
              </MenuItem>
            ),
          ].filter(Boolean)}
      </Menu>
      <Popover
        open={Boolean(filterAnchor)}
        anchorEl={filterAnchor}
        onClose={() => setFilterAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              borderRadius: 2,
              mt: 2,
              p: 2,
              maxHeight: 'min(85vh, 520px)',
              maxWidth: 'min(420px, calc(100vw - 220px))',
              overflow: 'auto',
            },
          },
        }}
      >
        <FilterForm
          filters={filters}
          onFiltersChange={onFiltersChange}
          speciesSearchId="topbar-filter-species"
        />
      </Popover>

      {favorites.length > 0 && onRemoveFavorite && (
        <>
          <Button
            variant="outlined"
            size="small"
            onClick={(e) => setSavedMenuAnchor(e.currentTarget)}
            aria-label="Saved regions"
            aria-haspopup="true"
            aria-expanded={Boolean(savedMenuAnchor)}
            sx={{ minWidth: 0, display: { xs: 'none', sm: 'inline-flex' } }}
          >
            Saved
          </Button>
          <Menu
            anchorEl={savedMenuAnchor}
            open={Boolean(savedMenuAnchor)}
            onClose={() => setSavedMenuAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            slotProps={{ paper: { sx: { maxWidth: 'calc(100vw - 24px)', maxHeight: 'min(70vh, 400px)' } } }}
          >
            {favorites.map((fav) => (
              <MenuItem
                key={fav.id}
                onClick={() => {
                  onRegionChange(fav.id);
                  setSavedMenuAnchor(null);
                }}
                sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}
              >
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{fav.name}</span>
                <IconButton
                  size="small"
                  aria-label={`Remove ${fav.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveFavorite(fav.id);
                    setSavedMenuAnchor(null);
                  }}
                >
                  <DeleteOutline fontSize="small" />
                </IconButton>
              </MenuItem>
            ))}
          </Menu>
        </>
      )}

      {onImportFile && (
        <>
          <input
            type="file"
            ref={importInputRef}
            accept=".csv,.json,.txt,.zip,text/csv,application/json,application/zip"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                onImportFile(file);
                setImportDialogOpen(false);
                setImportSummaryAnchor(null);
                e.target.value = '';
              }
            }}
          />
          <Button
            variant="outlined"
            size="small"
            startIcon={<UploadFile />}
            onClick={(e) => {
              if (importedOccurrenceCount > 0) {
                setImportSummaryAnchor(importSummaryAnchor ? null : e.currentTarget);
              } else {
                setImportDialogOpen(true);
              }
            }}
            aria-label="Import GBIF dataset (CSV or JSON)"
            aria-haspopup={importedOccurrenceCount > 0 ? 'dialog' : undefined}
            aria-expanded={importedOccurrenceCount > 0 ? Boolean(importSummaryAnchor) : undefined}
            sx={{ minWidth: 0, display: { xs: 'none', sm: 'inline-flex' } }}
          >
            Import{importedOccurrenceCount > 0 ? ` (${importedOccurrenceCount})` : ''}
          </Button>
          {importedOccurrenceCount > 0 && (
            <Popover
              open={Boolean(importSummaryAnchor)}
              anchorEl={importSummaryAnchor}
              onClose={() => setImportSummaryAnchor(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              transformOrigin={{ vertical: 'top', horizontal: 'left' }}
              slotProps={{ paper: { sx: { minWidth: 280, maxWidth: 380, maxHeight: '70vh', p: 2 } } }}
            >
              <ImportSummaryContent
                importedOccurrences={importedOccurrences}
                onChooseFile={() => {
                  setImportSummaryAnchor(null);
                  importInputRef.current?.click();
                }}
                onClear={() => {
                  setImportSummaryAnchor(null);
                  onClearImport?.();
                }}
                hasClear={Boolean(onClearImport)}
              />
            </Popover>
          )}
          <Dialog
            open={importDialogOpen}
            onClose={() => setImportDialogOpen(false)}
            maxWidth="sm"
            PaperProps={{ sx: { borderRadius: 2, m: 1, maxWidth: 'min(420px, calc(100vw - 16px))' } }}
          >
            <DialogTitle>Import GBIF-style data</DialogTitle>
            <DialogContent dividers>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Import a GBIF-style occurrence dataset as CSV or JSON. Files must include at least{' '}
                <code style={{ marginLeft: 2, marginRight: 2 }}>decimalLatitude</code>
                {' and '}
                <code style={{ marginLeft: 2, marginRight: 2 }}>decimalLongitude</code>
                {' columns/fields.'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Imported occurrences are shown on the map alongside API data and are <strong>not</strong> limited by
                the “Max results” setting. They stay in this browser tab until you clear them or refresh.
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setImportDialogOpen(false)}>Cancel</Button>
              <Button
                variant="contained"
                onClick={() => importInputRef.current?.click()}
                startIcon={<UploadFile />}
              >
                Choose file…
              </Button>
            </DialogActions>
          </Dialog>
          {importedOccurrenceCount > 0 && onClearImport && (
            <Button
              variant="text"
              size="small"
              color="secondary"
              startIcon={<DeleteOutline />}
              onClick={onClearImport}
              aria-label="Clear imported occurrences"
              sx={{ minWidth: 0, ml: 0.5, flexShrink: 0 }}
            >
              Clear
            </Button>
          )}
        </>
      )}

      {savedOccurrences.length > 0 && (
        <>
          <Button
            variant="outlined"
            size="small"
            startIcon={savedOccurrences.length > 0 ? <Bookmark /> : <BookmarkBorder />}
            onClick={(e) => setSavedOccurrencesAnchor(e.currentTarget)}
            aria-label={savedOccurrences.length > 0 ? `Saved occurrences (${savedOccurrences.length})` : 'Saved occurrences'}
            sx={{ minWidth: 0, display: { xs: 'none', sm: 'inline-flex' } }}
          >
            Saved{savedOccurrences.length > 0 ? ` (${savedOccurrences.length})` : ''}
          </Button>
          <Menu
            anchorEl={savedOccurrencesAnchor}
            open={Boolean(savedOccurrencesAnchor)}
            onClose={() => setSavedOccurrencesAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            slotProps={{ paper: { sx: { minWidth: 280, maxWidth: 'min(400px, calc(100vw - 24px))' } } }}
          >
            {savedOccurrences.length === 0 ? (
              <MenuItem disabled>No saved occurrences</MenuItem>
            ) : (
              savedOccurrences.map((occ) => {
                const name = occ.vernacularName?.trim() || occ.scientificName || `Occurrence ${occ.key}`;
                return (
                  <MenuItem
                    key={occ.key}
                    onClick={() => {
                      setSavedOccurrencesAnchor(null);
                      onSelectOccurrence?.(occ.key);
                    }}
                    sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}
                  >
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                    <IconButton
                      size="small"
                      aria-label={`Remove ${name} from saved`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onRemoveSavedOccurrence?.(occ.key);
                      }}
                    >
                      <DeleteOutline fontSize="small" />
                    </IconButton>
                  </MenuItem>
                );
              })
            )}
          </Menu>
        </>
      )}

      {(onExportImage || onExportGeoJSON || onExportCSV || onExportPDF) && (
        <>
          <Button
            variant="outlined"
            size="small"
            startIcon={<Download />}
            endIcon={<ArrowDropDown />}
            onClick={(e) => setExportMenuAnchor(e.currentTarget)}
            aria-label="Export"
            aria-haspopup="true"
            aria-expanded={Boolean(exportMenuAnchor)}
            sx={{ minWidth: 0, display: { xs: 'none', sm: 'inline-flex' } }}
          >
            Export
          </Button>
          <Menu
            anchorEl={exportMenuAnchor}
            open={Boolean(exportMenuAnchor)}
            onClose={() => setExportMenuAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{ paper: { sx: { maxWidth: 'calc(100vw - 24px)' } } }}
          >
            {[
              onExportImage && (
                <MenuItem
                  key="export-img"
                  onClick={() => {
                    onExportImage();
                    setExportMenuAnchor(null);
                  }}
                >
                  <ListItemIcon>
                    <ImageOutlined fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary="Export as image" />
                </MenuItem>
              ),
              onExportGeoJSON && (
                <MenuItem
                  key="export-geojson"
                  onClick={() => {
                    onExportGeoJSON();
                    setExportMenuAnchor(null);
                  }}
                  disabled={occurrenceCount === 0}
                >
                  <ListItemIcon>
                    <MapOutlined fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary="Export as GeoJSON" secondary={occurrenceCount === 0 ? 'No data' : undefined} />
                </MenuItem>
              ),
              onExportCSV && (
                <MenuItem
                  key="export-csv"
                  onClick={() => {
                    onExportCSV();
                    setExportMenuAnchor(null);
                  }}
                  disabled={occurrenceCount === 0}
                >
                  <ListItemIcon>
                    <TableChartOutlined fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary="Export as CSV" secondary={occurrenceCount === 0 ? 'No data' : undefined} />
                </MenuItem>
              ),
              onExportPDF && (
                <MenuItem
                  key="export-pdf"
                  onClick={() => {
                    onExportPDF();
                    setExportMenuAnchor(null);
                  }}
                  disabled={occurrenceCount === 0}
                >
                  <ListItemIcon>
                    <PictureAsPdfOutlined fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Export as PDF"
                    secondary={occurrenceCount === 0 ? 'No data' : 'Species summary & filter info'}
                  />
                </MenuItem>
              ),
            ].filter(Boolean)}
          </Menu>
        </>
      )}

      {onSceneModeChange && (
        <>
          <Button
            variant="outlined"
            size="small"
            startIcon={<Public />}
            endIcon={<ArrowDropDown />}
            onClick={(e) => setViewMenuAnchor(e.currentTarget)}
            aria-label="View options"
            aria-haspopup="true"
            aria-expanded={Boolean(viewMenuAnchor)}
            sx={{ minWidth: 0 }}
          >
            View
          </Button>
          <Menu
            anchorEl={viewMenuAnchor}
            open={Boolean(viewMenuAnchor)}
            onClose={() => setViewMenuAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            slotProps={{ paper: { sx: { minWidth: 260, maxWidth: 'calc(100vw - 24px)' } } }}
          >
            {[
              <ListSubheader key="view-type" sx={{ lineHeight: 2 }}>View type</ListSubheader>,
              <MenuItem
                key="3d"
                onClick={() => {
                  onSceneModeChange('3D');
                  setViewMenuAnchor(null);
                }}
              >
                {sceneMode === '3D' && (
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <Check fontSize="small" color="primary" />
                  </ListItemIcon>
                )}
                {sceneMode !== '3D' && <ListItemIcon sx={{ minWidth: 32 }} />}
                <ListItemText primary="3D Globe" secondary="Perspective view of the globe" />
              </MenuItem>,
              <MenuItem
                key="2d"
                onClick={() => {
                  onSceneModeChange('2D');
                  setViewMenuAnchor(null);
                }}
              >
                {sceneMode === '2D' && (
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <Check fontSize="small" color="primary" />
                  </ListItemIcon>
                )}
                {sceneMode !== '2D' && <ListItemIcon sx={{ minWidth: 32 }} />}
                <ListItemText primary="2D Map" secondary="Top-down flat map" />
              </MenuItem>,
              <MenuItem
                key="columbus"
                onClick={() => {
                  onSceneModeChange('Columbus');
                  setViewMenuAnchor(null);
                }}
              >
                {sceneMode === 'Columbus' && (
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <Check fontSize="small" color="primary" />
                  </ListItemIcon>
                )}
                {sceneMode !== 'Columbus' && <ListItemIcon sx={{ minWidth: 32 }} />}
                <ListItemText primary="Columbus View" secondary="2D map wrapped on a cylinder" />
              </MenuItem>,
              <Divider key="adv-divider" sx={{ my: 1 }} />,
              ...(onBaseMapChange
                ? [
                    <ListSubheader key="base-subheader" sx={{ lineHeight: 2 }}>Base map</ListSubheader>,
                    ...[
                      { id: 'bing' as const, primary: 'Bing Aerial', secondary: 'Satellite imagery (Cesium Ion)' },
                      { id: 'osm' as const, primary: 'OpenStreetMap', secondary: 'Street map' },
                      { id: 'opentopomap' as const, primary: 'OpenTopoMap', secondary: 'Terrain and contours' },
                      { id: 'positron' as const, primary: 'CartoDB Positron', secondary: 'Light, minimal style' },
                      { id: 'dark-matter' as const, primary: 'CartoDB Dark Matter', secondary: 'Dark style' },
                    ].map(({ id, primary, secondary }) => (
                      <MenuItem
                        key={id}
                        onClick={() => {
                          onBaseMapChange(id);
                          setViewMenuAnchor(null);
                        }}
                      >
                        {baseMap === id && (
                          <ListItemIcon sx={{ minWidth: 32 }}>
                            <Check fontSize="small" color="primary" />
                          </ListItemIcon>
                        )}
                        {baseMap !== id && <ListItemIcon sx={{ minWidth: 32 }} />}
                        <ListItemText primary={primary} secondary={secondary} />
                      </MenuItem>
                    )),
                  ]
                : []),
              ...(onPhotorealistic3DChange != null
                ? [
                    <Divider key="photorealistic-divider" sx={{ my: 1 }} />,
                    <MenuItem
                      key="photorealistic3d"
                      onClick={() => {
                        onPhotorealistic3DChange(!photorealistic3D);
                      }}
                    >
                      {photorealistic3D && (
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          <Check fontSize="small" color="primary" />
                        </ListItemIcon>
                      )}
                      {!photorealistic3D && <ListItemIcon sx={{ minWidth: 32 }} />}
                      <ListItemText
                        primary="Photorealistic 3D (Google)"
                        secondary="3D buildings overlay (Cesium Ion)"
                      />
                    </MenuItem>,
                  ]
                : []),
            ].filter(Boolean)}
          </Menu>
        </>
      )}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0, marginLeft: 'auto' }}>
        <Dialog
          open={helpOpen}
          onClose={() => setHelpOpen(false)}
          maxWidth="sm"
          PaperProps={{ sx: { borderRadius: 2, m: 1, maxWidth: 'min(360px, calc(100vw - 16px))' } }}
        >
          <DialogTitle>How GBIF 3D works</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" component="div" sx={{ '& p': { mb: 1.25 } }}>
              <p><strong>1. Pick a region</strong> — Use the Region menu to choose a predefined region, search for a place, or use the current view.</p>
              <p><strong>2. Add species filters</strong> — Open Filters to search by species/taxon, taxonomic group, IUCN status, date range, and advanced options (e.g. country, dataset, institution).</p>
              <p><strong>3. Import your own data</strong> — Use Import to add GBIF-style CSV or JSON files; imported points appear alongside API data.</p>
              <p><strong>4. Explore the globe</strong> — Each dot is an occurrence. Rotate, pan, and zoom to see where records are concentrated. Use the fullscreen icon to go fullscreen.</p>
              <p><strong>5. Use the timeline</strong> — Click a year (and optionally a month) at the bottom to focus on that period. Click “All” to reset.</p>
              <p><strong>6. Draw your own area</strong> — Use Draw region to define a custom box on the globe and fetch occurrences for that area; you can save it as a favorite.</p>
              <p><strong>7. Export</strong> — Use Export to save the current data as an image, GeoJSON, CSV, or a PDF report.</p>
              <p><strong>Navigation tips</strong> — Left-click and drag to rotate (3D) or pan (2D); right-click and drag to pan; use the mouse wheel to zoom; on touch, drag to pan and pinch to zoom.</p>
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setHelpOpen(false)}>Close</Button>
          </DialogActions>
        </Dialog>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, marginLeft: 'auto' }}>
        <IconButton
          size="small"
          aria-label="Help: how this tool works"
          onClick={() => setHelpOpen(true)}
          sx={{
            color: 'rgba(0,0,0,0.7)',
            backgroundColor: 'rgba(255, 255, 255, 0.92)',
            border: '1px solid rgba(0, 0, 0, 0.23)',
            '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.98)' },
          }}
        >
          <HelpOutline fontSize="small" />
        </IconButton>
        <Button
          variant="outlined"
          size="small"
          startIcon={<InfoOutlined />}
          endIcon={<ArrowDropDown sx={{ display: { xs: 'none', sm: 'block' } }} />}
          onClick={(e) => setAboutMenuAnchor(e.currentTarget)}
          aria-label="About"
          aria-haspopup="true"
          aria-expanded={Boolean(aboutMenuAnchor)}
          sx={{ minWidth: 0, '& .MuiButton-startIcon': { mr: { xs: 0, sm: 0.5 } } }}
        >
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>About</Box>
        </Button>
        <Menu
          anchorEl={aboutMenuAnchor}
          open={Boolean(aboutMenuAnchor)}
          onClose={() => setAboutMenuAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{ paper: { sx: { minWidth: 260, maxWidth: 'calc(100vw - 24px)' } } }}
        >
          <Paper component="div" sx={{ p: 2, boxShadow: 'none', backgroundColor: 'transparent' }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              GBIF 3D
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Explore where species have been recorded on an interactive 3D globe. Data comes from GBIF: millions of observations from museums, surveys, and citizen science.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Pick a region or search for a place, import your own GBIF-style datasets, filter by species or year, and draw your own area. Each dot is an occurrence; colors show IUCN status. Use the <strong>timeline</strong> at the bottom to filter by year. Use <strong>View</strong> for 3D/2D/Columbus, base maps, and optional Photorealistic 3D (Google). Export current data as image, GeoJSON, CSV, or PDF.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Built with Next.js, Cesium (Resium), and the GBIF API.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Developer: <Link href="https://kar.im" target="_blank" rel="noopener noreferrer">Karim Osman</Link>
            </Typography>
          </Paper>
        </Menu>

        <Button
          component="a"
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          variant="outlined"
          size="small"
          startIcon={<GitHub />}
          aria-label="View on GitHub"
          sx={{ minWidth: 0, '& .MuiButton-startIcon': { mr: { xs: 0, sm: 0.5 } } }}
        >
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>GitHub</Box>
        </Button>
        </Box>
      </Box>
      </Box>
    </Box>
  );
}
