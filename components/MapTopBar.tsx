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
import MenuIcon from '@mui/icons-material/Menu';
import Check from '@mui/icons-material/Check';
import BookmarkAdd from '@mui/icons-material/BookmarkAdd';
import Bookmark from '@mui/icons-material/Bookmark';
import BookmarkBorder from '@mui/icons-material/BookmarkBorder';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import Popover from '@mui/material/Popover';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import { REGIONS } from '@/lib/regions';
import type { Bounds } from '@/lib/geometry';
import FilterForm from './FilterForm';
import ImportSummaryContent from './map-top-bar/ImportSummaryContent';
import HelpDialog from './map-top-bar/HelpDialog';
import AboutMenuContent from './map-top-bar/AboutMenuContent';
import {
  type MapTopBarProps,
  type RegionOption,
  GITHUB_REPO_DEFAULT,
  PLACES_DEBOUNCE_MS,
} from './map-top-bar/types';

export type { MapTopBarProps } from './map-top-bar/types';

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
    const trimmed = placeQuery.trim();
    if (trimmed.length < 2) {
      setPlaceResults([]);
      setPlaceLoading(false);
      return;
    }
    if (placeTimeoutRef.current) clearTimeout(placeTimeoutRef.current);
    placeTimeoutRef.current = setTimeout(() => {
      fetchPlaces(trimmed);
      placeTimeoutRef.current = null;
    }, PLACES_DEBOUNCE_MS);
    return () => {
      if (placeTimeoutRef.current) clearTimeout(placeTimeoutRef.current);
    };
  }, [placeQuery, fetchPlaces]);

  const staticOptions = useMemo(() => {
    const list: RegionOption[] = [
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
        // When choosing a predefined region (not a searched place), clear any place search
        setPlaceQuery('');
        onRegionChange(newValue.id);
      }
    },
    [onRegionChange, onPlaceSelect, setPlaceQuery]
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
            minWidth: { xs: 160, sm: 0 },
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
            clearOnEscape
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
                <Box component="ul" sx={{ m: 0, p: 0 }}>
                  {params.children}
                </Box>
              </li>
            )}
            size="small"
            sx={{ minWidth: { xs: 0, sm: 260 } }}
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
      <Box
        sx={{
          display: 'flex',
          flexWrap: { xs: 'nowrap', sm: 'wrap' },
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 0.5,
          flexShrink: 0,
          flex: { xs: '0 0 auto', sm: 1 },
          minWidth: 0,
        }}
      >
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
          display: { xs: 'none', md: 'inline-flex' },
          bgcolor: filterAnchor ? 'action.selected' : undefined,
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        Filters
        {(filters.taxonKeys?.length ?? 0) > 0 || filters.taxonKey != null ? ' • active' : ''}
      </Button>
      {/* On mobile: single hamburger menu; on desktop: individual buttons */}
      <IconButton
        size="small"
        onClick={(e) => {
          moreButtonAnchorRef.current = e.currentTarget;
          setMoreMenuAnchor(e.currentTarget);
        }}
        aria-label="Menu"
        aria-haspopup="true"
        aria-expanded={Boolean(moreMenuAnchor)}
        sx={{
          display: { xs: 'inline-flex', md: 'none' },
          color: 'rgba(255,255,255,0.9)',
        }}
      >
        <MenuIcon fontSize="small" />
      </IconButton>
      <Menu
        anchorEl={moreMenuAnchor}
        open={Boolean(moreMenuAnchor)}
        onClose={() => setMoreMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { minWidth: 220, maxWidth: 'min(420px, calc(100vw - 24px))', maxHeight: 'min(70vh, 400px)' } } }}
      >
        {/* Filters entry for mobile */}
        <MenuItem
          onClick={() => {
            setMoreMenuAnchor(null);
            if (moreButtonAnchorRef.current) {
              setFilterAnchor(moreButtonAnchorRef.current);
            }
          }}
        >
          <ListItemIcon><FilterList fontSize="small" /></ListItemIcon>
          <ListItemText primary="Filters" />
        </MenuItem>
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
              if (importedOccurrenceCount > 0 && moreButtonAnchorRef.current) {
                setImportSummaryAnchor(moreButtonAnchorRef.current);
              } else {
                setImportDialogOpen(true);
              }
            }}
          >
            <ListItemIcon><UploadFile fontSize="small" /></ListItemIcon>
            <ListItemText primary={`Import${importedOccurrenceCount > 0 ? ` (${importedOccurrenceCount})` : ''}`} />
          </MenuItem>
        )}
        {importedOccurrenceCount > 0 && onClearImport && (
          <MenuItem
            onClick={() => {
              onClearImport();
              setMoreMenuAnchor(null);
            }}
          >
            <ListItemIcon><DeleteOutline fontSize="small" /></ListItemIcon>
            <ListItemText primary="Clear import" />
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
        {onSceneModeChange && (
          <MenuItem
            onClick={() => {
              setMoreMenuAnchor(null);
              if (moreButtonAnchorRef.current) {
                setViewMenuAnchor(moreButtonAnchorRef.current);
              }
            }}
          >
            <ListItemIcon><Public fontSize="small" /></ListItemIcon>
            <ListItemText primary="View options" />
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            setMoreMenuAnchor(null);
            if (moreButtonAnchorRef.current) {
              setAboutMenuAnchor(moreButtonAnchorRef.current);
            }
          }}
        >
          <ListItemIcon><InfoOutlined fontSize="small" /></ListItemIcon>
          <ListItemText primary="About" />
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMoreMenuAnchor(null);
            setHelpOpen(true);
          }}
        >
          <ListItemIcon><HelpOutline fontSize="small" /></ListItemIcon>
          <ListItemText primary="Help" />
        </MenuItem>
        <MenuItem component="a" href={githubUrl} target="_blank" rel="noopener noreferrer" onClick={() => setMoreMenuAnchor(null)}>
          <ListItemIcon><GitHub fontSize="small" /></ListItemIcon>
          <ListItemText primary="View on GitHub" />
        </MenuItem>
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
              maxWidth: {
                xs: 'calc(100vw - 24px)',
                md: 'min(420px, calc(100vw - 220px))',
              },
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
            sx={{ minWidth: 0, display: { xs: 'none', md: 'inline-flex' } }}
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
            sx={{ minWidth: 0, display: { xs: 'none', md: 'inline-flex' } }}
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
              sx={{ minWidth: 0, ml: 0.5, flexShrink: 0, display: { xs: 'none', md: 'inline-flex' } }}
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
            sx={{ minWidth: 0, display: { xs: 'none', md: 'inline-flex' } }}
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
            sx={{ minWidth: 0, display: { xs: 'none', md: 'inline-flex' } }}
          >
            Export
          </Button>
          <Menu
            anchorEl={exportMenuAnchor}
            open={Boolean(exportMenuAnchor)}
            onClose={() => setExportMenuAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{ paper: { sx: { mt: 1, maxWidth: 'calc(100vw - 24px)' } } }}
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
            sx={{ minWidth: 0, display: { xs: 'none', md: 'inline-flex' } }}
          >
            View
          </Button>
          <Menu
            anchorEl={viewMenuAnchor}
            open={Boolean(viewMenuAnchor)}
            onClose={() => setViewMenuAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            slotProps={{ paper: { sx: { mt: 1, minWidth: 260, maxWidth: 'calc(100vw - 24px)' } } }}
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
              ...(onPhotorealistic3DChange != null
                ? [
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
                        primary="Photorealistic 3D"
                        secondary="3D buildings overlay"
                      />
                    </MenuItem>,
                    <Divider key="photorealistic-divider" sx={{ my: 1 }} />,
                  ]
                : []),
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
            ].filter(Boolean)}
          </Menu>
          <Box
            aria-hidden="true"
            sx={{
              mx: 1,
              width: '1px',
              height: 20,
              alignSelf: 'center',
              backgroundColor: '#ffffff',
              opacity: 0.9,
              display: { xs: 'none', md: 'block' },
            }}
          />
          <Button
            variant="outlined"
            size="small"
            startIcon={<InfoOutlined />}
            endIcon={<ArrowDropDown sx={{ display: { xs: 'none', md: 'block' } }} />}
            onClick={(e) => setAboutMenuAnchor(e.currentTarget)}
            aria-label="About"
            aria-haspopup="true"
            aria-expanded={Boolean(aboutMenuAnchor)}
            sx={{ minWidth: 0, display: { xs: 'none', md: 'inline-flex' }, '& .MuiButton-startIcon': { mr: { xs: 0, md: 0.5 } } }}
          >
            <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>About</Box>
          </Button>
          <IconButton
            size="small"
            aria-label="Help: how this tool works"
            onClick={() => setHelpOpen(true)}
            sx={{
              color: 'rgba(255,255,255,0.9)',
              p: 0.5,
              display: { xs: 'none', md: 'inline-flex' },
              '&:hover': { backgroundColor: 'rgba(255,255,255,0.08)' },
            }}
          >
            <HelpOutline fontSize="small" />
          </IconButton>
          <IconButton
            component="a"
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            size="small"
            aria-label="View on GitHub"
            sx={{
              color: 'rgba(255,255,255,0.9)',
              p: 0.5,
              display: { xs: 'none', md: 'inline-flex' },
              '&:hover': { backgroundColor: 'rgba(255,255,255,0.08)' },
            }}
          >
            <GitHub fontSize="small" />
          </IconButton>
        </>
      )}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
        <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
        <Menu
          anchorEl={aboutMenuAnchor}
          open={Boolean(aboutMenuAnchor)}
          onClose={() => setAboutMenuAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{ paper: { sx: { mt: 1, minWidth: 280, maxWidth: 'min(420px, calc(100vw - 24px))' } } }}
        >
          <AboutMenuContent />
        </Menu>
      </Box>
      </Box>
    </Box>
  );
}
