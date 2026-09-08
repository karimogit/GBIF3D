'use client';

import { useMemo, useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
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
import PentagonOutlined from '@mui/icons-material/PentagonOutlined';
import CropSquare from '@mui/icons-material/CropSquare';
import CircleOutlined from '@mui/icons-material/CircleOutlined';
import Public from '@mui/icons-material/Public';
import HelpOutline from '@mui/icons-material/HelpOutline';
import MenuIcon from '@mui/icons-material/Menu';
import Check from '@mui/icons-material/Check';
import BookmarkAdd from '@mui/icons-material/BookmarkAdd';
import Bookmark from '@mui/icons-material/Bookmark';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import Dialog from '@mui/material/Dialog';
import Popover from '@mui/material/Popover';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Tooltip from '@mui/material/Tooltip';
import { REGIONS } from '@/lib/regions';
import { ION_TOKEN_CONFIGURED } from '@/lib/ion';
import type { Bounds } from '@/lib/geometry';
import { formatAreaHectares } from '@/lib/geometry';
import type { DrawShapeMode } from '@/lib/draw-shapes';
import FilterForm from './FilterForm';
import ImportSummaryContent from './map-top-bar/ImportSummaryContent';
import HelpDialog from './map-top-bar/HelpDialog';
import AboutMenuContent from './map-top-bar/AboutMenuContent';
import ExportDataDialog from './map-top-bar/ExportDataDialog';
import type { ExportDataFormat, ExportDataOptions } from '@/lib/export-data';
import {
  type MapTopBarProps,
  type MapTopBarFlatProps,
  type RegionOption,
  GITHUB_REPO_DEFAULT,
  PLACES_DEBOUNCE_MS,
  normalizeMapTopBarProps,
} from './map-top-bar/types';

export type { MapTopBarProps, MapTopBarFlatProps } from './map-top-bar/types';

export default function MapTopBar(rawProps: MapTopBarProps | MapTopBarFlatProps) {
  const props = normalizeMapTopBarProps(rawProps);
  const {
    selectedRegionId,
    onRegionChange,
    favorites,
    drawnBounds,
    drawnPolygon = null,
    placeSearchResult,
    onPlaceSelect,
    onStartDrawRegion,
    drawRegionMode = false,
    drawShapeMode = 'polygon',
    onCancelDrawRegion,
    onFinishDrawRegion,
    onSaveDrawnRegion,
    onClearDrawnRegion,
    onRemoveFavorite,
    regionBounds = null,
    regionName,
  } = props.region;
  const { filters, onFiltersChange } = props;
  const {
    onImportFile,
    importedOccurrenceCount = 0,
    importedOccurrences = [],
    onClearImport,
  } = props.importState ?? {};
  const {
    onExportImage,
    onExportGeoJSON,
    onExportCSV,
    onExportPDF,
    occurrenceCount = 0,
    visibleOccurrenceCount = 0,
  } = props.exportHandlers ?? {};
  const {
    savedOccurrences = [],
    onSelectOccurrence,
    onRemoveSavedOccurrence,
  } = props.saved ?? {};
  const {
    sceneMode = '3D',
    onSceneModeChange,
    baseMap = 'opentopomap',
    onBaseMapChange,
    photorealistic3D = false,
    onPhotorealistic3DChange,
  } = props.viewOptions ?? {};
  const githubUrl = props.githubUrl ?? GITHUB_REPO_DEFAULT;
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeResults, setPlaceResults] = useState<RegionOption[]>([]);
  const [placeLoading, setPlaceLoading] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterAnchor, setFilterAnchor] = useState<null | HTMLElement>(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const openFilters = useCallback((anchor?: HTMLElement | null) => {
    if (anchor) setFilterAnchor(anchor);
    setFilterOpen(true);
  }, []);

  const closeFilters = useCallback(() => {
    setFilterOpen(false);
    setFilterAnchor(null);
  }, []);
  const [exportMenuAnchor, setExportMenuAnchor] = useState<null | HTMLElement>(null);
  const [exportDialogFormat, setExportDialogFormat] = useState<ExportDataFormat | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importSummaryAnchor, setImportSummaryAnchor] = useState<null | HTMLElement>(null);
  const [savedOccurrencesAnchor, setSavedOccurrencesAnchor] = useState<null | HTMLElement>(null);
  const [viewMenuAnchor, setViewMenuAnchor] = useState<null | HTMLElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [aboutMenuAnchor, setAboutMenuAnchor] = useState<null | HTMLElement>(null);
  const [savedMenuAnchor, setSavedMenuAnchor] = useState<null | HTMLElement>(null);
  const [moreMenuAnchor, setMoreMenuAnchor] = useState<null | HTMLElement>(null);
  const [drawMenuAnchor, setDrawMenuAnchor] = useState<null | HTMLElement>(null);
  // Out-of-order responses must not overwrite results for the latest query.
  const placeRequestSeqRef = useRef(0);
  const moreButtonAnchorRef = useRef<HTMLElement | null>(null);

  const drawTools: Array<{
    mode: DrawShapeMode;
    label: string;
    secondary: string;
    icon: ReactNode;
  }> = [
    {
      mode: 'polygon',
      label: 'Polygon',
      secondary: 'Click points, then Done',
      icon: <PentagonOutlined fontSize="small" />,
    },
    {
      mode: 'rectangle',
      label: 'Rectangle',
      secondary: 'Click and drag two corners',
      icon: <CropSquare fontSize="small" />,
    },
    {
      mode: 'circle',
      label: 'Circle',
      secondary: 'Center, then set radius',
      icon: <CircleOutlined fontSize="small" />,
    },
  ];

  const startDraw = useCallback(
    (mode: DrawShapeMode) => {
      setDrawMenuAnchor(null);
      onStartDrawRegion?.(mode);
    },
    [onStartDrawRegion]
  );

  const openExportDialog = useCallback((format: ExportDataFormat) => {
    setExportMenuAnchor(null);
    setMoreMenuAnchor(null);
    setExportDialogFormat(format);
  }, []);

  const hasExportableData = occurrenceCount > 0 || visibleOccurrenceCount > 0;
  const hasExportActions = Boolean(onExportImage || onExportGeoJSON || onExportCSV || onExportPDF);

  /** Same export entries for the desktop Export menu and the mobile overflow menu. */
  const renderExportMenuItems = (keyPrefix: string, closeMenu: () => void, withHints: boolean) =>
    [
      onExportImage && (
        <MenuItem
          key={`${keyPrefix}-img`}
          onClick={() => {
            onExportImage();
            closeMenu();
          }}
        >
          <ListItemIcon>
            <ImageOutlined fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Export as image" />
        </MenuItem>
      ),
      onExportGeoJSON && (
        <MenuItem key={`${keyPrefix}-geojson`} onClick={() => openExportDialog('geojson')} disabled={!hasExportableData}>
          <ListItemIcon>
            <MapOutlined fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Export as GeoJSON" secondary={withHints && !hasExportableData ? 'No data' : undefined} />
        </MenuItem>
      ),
      onExportCSV && (
        <MenuItem key={`${keyPrefix}-csv`} onClick={() => openExportDialog('csv')} disabled={!hasExportableData}>
          <ListItemIcon>
            <TableChartOutlined fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Export as CSV" secondary={withHints && !hasExportableData ? 'No data' : undefined} />
        </MenuItem>
      ),
      onExportPDF && (
        <MenuItem key={`${keyPrefix}-pdf`} onClick={() => openExportDialog('pdf')} disabled={!hasExportableData}>
          <ListItemIcon>
            <PictureAsPdfOutlined fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Export as PDF"
            secondary={withHints ? (!hasExportableData ? 'No data' : 'Species summary & filter info') : undefined}
          />
        </MenuItem>
      ),
    ].filter(Boolean);

  const handleExportConfirm = useCallback(
    (opts: ExportDataOptions) => {
      if (exportDialogFormat === 'geojson') onExportGeoJSON?.(opts);
      else if (exportDialogFormat === 'csv') onExportCSV?.(opts);
      else if (exportDialogFormat === 'pdf') onExportPDF?.(opts);
      setExportDialogFormat(null);
    },
    [exportDialogFormat, onExportGeoJSON, onExportCSV, onExportPDF]
  );

  const fetchPlaces = useCallback(async (q: string) => {
    const seq = ++placeRequestSeqRef.current;
    setPlaceLoading(true);
    try {
      const res = await fetch(`/api/places/search?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as {
        results?: Array<{ display_name: string; place_id: number; bounds: Bounds; country_code?: string }>;
      };
      if (seq !== placeRequestSeqRef.current) return;
      const list: RegionOption[] = (data.results ?? []).map((r) => ({
        id: `place-${r.place_id}`,
        label: r.display_name,
        group: 'Places',
        bounds: r.bounds,
        ...(r.country_code ? { countryCode: r.country_code } : {}),
      }));
      setPlaceResults(list);
    } catch {
      if (seq === placeRequestSeqRef.current) setPlaceResults([]);
    } finally {
      if (seq === placeRequestSeqRef.current) setPlaceLoading(false);
    }
  }, []);

  useEffect(() => {
    const trimmed = placeQuery.trim();
    if (trimmed.length < 2) {
      placeRequestSeqRef.current += 1;
      setPlaceResults([]);
      setPlaceLoading(false);
      return;
    }
    const timeout = setTimeout(() => fetchPlaces(trimmed), PLACES_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [placeQuery, fetchPlaces]);

  const staticOptions = useMemo(() => {
    const drawnArea =
      drawnPolygon && drawnPolygon.length >= 3 ? formatAreaHectares(drawnPolygon) : null;
    const drawnLabel = drawnArea ? `Drawn region (${drawnArea})` : 'Drawn region';
    const list: RegionOption[] = [
      ...(drawnBounds != null ? [{ id: 'drawn', label: drawnLabel }] : []),
      ...REGIONS.map((r) => ({ id: r.id, label: r.name })),
      ...(favorites.length > 0
        ? favorites.map((f) => {
            const area =
              f.polygon && f.polygon.length >= 3 ? formatAreaHectares(f.polygon) : null;
            return {
              id: f.id,
              label: area ? `${f.name} (${area})` : f.name,
              group: 'Saved',
            };
          })
        : []),
    ];
    return list;
  }, [drawnBounds, drawnPolygon, favorites]);

  const options = useMemo(() => {
    // Include the selected place so Autocomplete value is always in `options` (avoids MUI warning).
    const selectedPlace: RegionOption[] =
      selectedRegionId === 'place' && placeSearchResult
        ? [{ id: 'place', label: placeSearchResult.name, group: 'Places' }]
        : [];
    const withPlaces =
      placeResults.length > 0 ? [...staticOptions, ...placeResults] : staticOptions;
    if (selectedPlace.length === 0) return withPlaces;
    const withoutDup = withPlaces.filter((o) => o.id !== 'place');
    return [...selectedPlace, ...withoutDup];
  }, [staticOptions, placeResults, selectedRegionId, placeSearchResult]);

  const value = useMemo(() => {
    if (selectedRegionId === 'place' && placeSearchResult) {
      return options.find((o) => o.id === 'place') ?? { id: 'place', label: placeSearchResult.name };
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

  /** Top-level toolbar entries shared by desktop buttons and the mobile overflow menu. */
  type ToolbarAction = {
    id: string;
    label: string;
    /** Longer label for the mobile overflow menu when it differs from the desktop button. */
    menuLabel?: string;
    ariaLabel: string;
    icon: ReactNode;
    endIcon?: ReactNode;
    visible: boolean;
    desktopVariant: 'button' | 'icon';
    href?: string;
    expanded?: boolean;
    selected?: boolean;
    onActivate: (anchor: HTMLElement | null) => void;
  };

  const toolbarActions = useMemo((): ToolbarAction[] => {
    const filterActive =
      (filters.taxonKeys?.length ?? 0) > 0 || filters.taxonKey != null;
    return [
      {
        id: 'filters',
        label: `Filters${filterActive ? ' • active' : ''}`,
        menuLabel: 'Filters',
        ariaLabel: 'Filters',
        icon: <FilterList fontSize="small" />,
        endIcon: <ArrowDropDown />,
        visible: true,
        desktopVariant: 'button',
        expanded: filterOpen,
        selected: filterOpen,
        onActivate: (anchor) => openFilters(anchor),
      },
      {
        id: 'saved-regions',
        label: 'Saved',
        menuLabel: 'Saved regions',
        ariaLabel: 'Saved regions',
        icon: <Bookmark fontSize="small" />,
        visible: favorites.length > 0 && Boolean(onRemoveFavorite),
        desktopVariant: 'button',
        expanded: Boolean(savedMenuAnchor),
        onActivate: (anchor) => setSavedMenuAnchor(anchor),
      },
      {
        id: 'import',
        label: `Import${importedOccurrenceCount > 0 ? ` (${importedOccurrenceCount})` : ''}`,
        ariaLabel: 'Import GBIF dataset (CSV, TSV, JSON or Darwin Core Archive)',
        icon: <UploadFile fontSize="small" />,
        visible: Boolean(onImportFile),
        desktopVariant: 'button',
        expanded: importedOccurrenceCount > 0 ? Boolean(importSummaryAnchor) : undefined,
        onActivate: (anchor) => {
          if (importedOccurrenceCount > 0) {
            setImportSummaryAnchor(importSummaryAnchor ? null : anchor);
          } else {
            setImportDialogOpen(true);
          }
        },
      },
      {
        id: 'saved-occurrences',
        label: `Saved (${savedOccurrences.length})`,
        menuLabel: `Saved occurrences (${savedOccurrences.length})`,
        ariaLabel: `Saved occurrences (${savedOccurrences.length})`,
        icon: <Bookmark fontSize="small" />,
        visible: savedOccurrences.length > 0,
        desktopVariant: 'button',
        expanded: Boolean(savedOccurrencesAnchor),
        onActivate: (anchor) => setSavedOccurrencesAnchor(anchor),
      },
      {
        id: 'export',
        label: 'Export',
        ariaLabel: 'Export',
        icon: <Download fontSize="small" />,
        endIcon: <ArrowDropDown />,
        visible: hasExportActions,
        desktopVariant: 'button',
        expanded: Boolean(exportMenuAnchor),
        onActivate: (anchor) => setExportMenuAnchor(anchor),
      },
      {
        id: 'view',
        label: 'View',
        menuLabel: 'View options',
        ariaLabel: 'View options',
        icon: <Public fontSize="small" />,
        endIcon: <ArrowDropDown />,
        visible: Boolean(onSceneModeChange),
        desktopVariant: 'button',
        expanded: Boolean(viewMenuAnchor),
        onActivate: (anchor) => setViewMenuAnchor(anchor),
      },
      {
        id: 'about',
        label: 'About',
        ariaLabel: 'About',
        icon: <InfoOutlined fontSize="small" />,
        endIcon: <ArrowDropDown />,
        visible: true,
        desktopVariant: 'button',
        expanded: Boolean(aboutMenuAnchor),
        onActivate: (anchor) => setAboutMenuAnchor(anchor),
      },
      {
        id: 'help',
        label: 'Help',
        ariaLabel: 'Help: how this tool works',
        icon: <HelpOutline fontSize="small" />,
        visible: true,
        desktopVariant: 'icon',
        onActivate: () => setHelpOpen(true),
      },
      {
        id: 'github',
        label: 'View on GitHub',
        ariaLabel: 'View on GitHub',
        icon: <GitHub fontSize="small" />,
        visible: true,
        desktopVariant: 'icon',
        href: githubUrl,
        onActivate: () => undefined,
      },
    ];
  }, [
    filters.taxonKeys,
    filters.taxonKey,
    filterOpen,
    openFilters,
    favorites.length,
    onRemoveFavorite,
    savedMenuAnchor,
    onImportFile,
    importedOccurrenceCount,
    importSummaryAnchor,
    savedOccurrences.length,
    savedOccurrencesAnchor,
    hasExportActions,
    exportMenuAnchor,
    onSceneModeChange,
    viewMenuAnchor,
    aboutMenuAnchor,
    githubUrl,
  ]);

  const visibleToolbarActions = toolbarActions.filter((a) => a.visible);

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 'max(8px, env(safe-area-inset-top))',
        left: 'max(8px, env(safe-area-inset-left))',
        right: 'max(8px, env(safe-area-inset-right))',
        zIndex: 1300,
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        flexWrap: 'wrap',
        alignItems: { xs: 'stretch', md: 'center' },
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
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          minWidth: 0,
          flex: { xs: '1 1 auto', md: 1 },
          maxWidth: { md: 'calc(100% - 200px)' },
          width: { xs: '100%', md: 'auto' },
          pointerEvents: 'auto',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1,
            py: 0.5,
            borderRadius: 1,
            backgroundColor: 'rgba(255, 255, 255, 0.92)',
            flexShrink: 0,
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
            flex: 1,
            minWidth: 0,
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
            sx={{ flex: 1, minWidth: 0, width: '100%' }}
            loading={placeLoading}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder="Search places..."
                size="small"
                variant="outlined"
                sx={{
                  width: '100%',
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
                <>
                  {drawShapeMode === 'polygon' && onFinishDrawRegion && (
                    <Button
                      variant="text"
                      size="small"
                      color="primary"
                      onClick={onFinishDrawRegion}
                      aria-label="Finish drawing polygon"
                      sx={{ minWidth: 0, flexShrink: 0 }}
                    >
                      Done
                    </Button>
                  )}
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
                </>
              ) : (
                <>
                  <Tooltip title="Draw region">
                    <IconButton
                      size="small"
                      onClick={(e) => setDrawMenuAnchor(e.currentTarget)}
                      disabled={drawRegionMode}
                      aria-label="Draw a region on the globe"
                      aria-haspopup="true"
                      aria-expanded={Boolean(drawMenuAnchor)}
                      sx={{ flexShrink: 0 }}
                    >
                      <EditOutlined fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Menu
                    anchorEl={drawMenuAnchor}
                    open={Boolean(drawMenuAnchor)}
                    onClose={() => setDrawMenuAnchor(null)}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                    transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                    slotProps={{ paper: { sx: { minWidth: 220, maxWidth: 'calc(100vw - 24px)' } } }}
                  >
                    <ListSubheader sx={{ lineHeight: 2 }}>Draw region</ListSubheader>
                    {drawTools.map((tool) => (
                      <MenuItem key={tool.mode} onClick={() => startDraw(tool.mode)}>
                        <ListItemIcon>{tool.icon}</ListItemIcon>
                        <ListItemText primary={tool.label} secondary={tool.secondary} />
                      </MenuItem>
                    ))}
                  </Menu>
                </>
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
                      sx={{ minWidth: 0, flexShrink: 0, display: { xs: 'none', sm: 'inline-flex' } }}
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
                      sx={{ minWidth: 0, flexShrink: 0, display: { xs: 'none', sm: 'inline-flex' } }}
                    >
                      Clear
                    </Button>
                  )}
                </>
              )}
            </>
          )}
        </Box>
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
            flexShrink: 0,
            backgroundColor: 'rgba(255, 255, 255, 0.92)',
            border: '1px solid rgba(0, 0, 0, 0.12)',
            borderRadius: 1,
            color: 'text.primary',
          }}
        >
          <MenuIcon fontSize="small" />
        </IconButton>
      </Box>
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 0.5,
          flexShrink: 0,
          flex: 1,
          minWidth: 0,
        }}
      >
      {/* Mobile hamburger menu (button is in the search row above) */}
      <Menu
        anchorEl={moreMenuAnchor}
        open={Boolean(moreMenuAnchor)}
        onClose={() => setMoreMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { minWidth: 220, maxWidth: 'min(420px, calc(100vw - 24px))', maxHeight: 'min(70vh, 400px)' } } }}
      >
        {visibleToolbarActions.map((action) =>
          action.href ? (
            <MenuItem
              key={action.id}
              component="a"
              href={action.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMoreMenuAnchor(null)}
            >
              <ListItemIcon>{action.icon}</ListItemIcon>
              <ListItemText primary={action.menuLabel ?? action.label} />
            </MenuItem>
          ) : (
            <MenuItem
              key={action.id}
              onClick={() => {
                setMoreMenuAnchor(null);
                action.onActivate(moreButtonAnchorRef.current);
              }}
            >
              <ListItemIcon>{action.icon}</ListItemIcon>
              <ListItemText primary={action.menuLabel ?? action.label} />
            </MenuItem>
          )
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
      </Menu>

      {visibleToolbarActions.map((action) => {
        const dividerBefore =
          action.id === 'about' ? (
            <Box
              key="about-divider"
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
          ) : null;
        if (action.desktopVariant === 'icon') {
          if (action.href) {
            return (
              <span key={action.id} style={{ display: 'contents' }}>
                {dividerBefore}
                <IconButton
                  component="a"
                  href={action.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  size="small"
                  aria-label={action.ariaLabel}
                  sx={{
                    color: 'rgba(255,255,255,0.9)',
                    p: 0.5,
                    display: { xs: 'none', md: 'inline-flex' },
                    '&:hover': { backgroundColor: 'rgba(255,255,255,0.08)' },
                  }}
                >
                  {action.icon}
                </IconButton>
              </span>
            );
          }
          return (
            <span key={action.id} style={{ display: 'contents' }}>
              {dividerBefore}
              <IconButton
                size="small"
                aria-label={action.ariaLabel}
                onClick={() => action.onActivate(null)}
                sx={{
                  color: 'rgba(255,255,255,0.9)',
                  p: 0.5,
                  display: { xs: 'none', md: 'inline-flex' },
                  '&:hover': { backgroundColor: 'rgba(255,255,255,0.08)' },
                }}
              >
                {action.icon}
              </IconButton>
            </span>
          );
        }
        return (
          <span key={action.id} style={{ display: 'contents' }}>
            {dividerBefore}
            <Button
              variant="outlined"
              size="small"
              startIcon={action.icon}
              endIcon={action.endIcon}
              onClick={(e) => action.onActivate(e.currentTarget)}
              aria-label={action.ariaLabel}
              aria-haspopup={
                action.endIcon ||
                action.id === 'saved-regions' ||
                action.id === 'saved-occurrences' ||
                action.id === 'import' ||
                action.id === 'filters'
                  ? true
                  : undefined
              }
              aria-expanded={action.expanded}
              sx={{
                minWidth: 0,
                display: { xs: 'none', md: 'inline-flex' },
                bgcolor: action.selected ? 'action.selected' : undefined,
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              {action.label}
            </Button>
            {action.id === 'import' && importedOccurrenceCount > 0 && onClearImport && (
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
          </span>
        );
      })}

      <Dialog
        open={filterOpen && isMobile}
        onClose={closeFilters}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { borderRadius: 2, m: 1, maxWidth: 'min(420px, calc(100vw - 16px))' } }}
      >
        <DialogTitle>Filters</DialogTitle>
        <DialogContent dividers>
          <FilterForm
            filters={filters}
            onFiltersChange={onFiltersChange}
            speciesSearchId="topbar-filter-species"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeFilters}>Done</Button>
        </DialogActions>
      </Dialog>
      <Popover
        open={filterOpen && !isMobile && Boolean(filterAnchor)}
        anchorEl={filterAnchor}
        onClose={closeFilters}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              borderRadius: 2,
              mt: 2,
              p: 2,
              maxHeight: 'min(85vh, 520px)',
              maxWidth: 'min(420px, calc(100vw - 24px))',
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
      )}

      {onImportFile && (
        <>
          <input
            type="file"
            ref={importInputRef}
            accept=".csv,.tsv,.json,.txt,.zip,text/csv,text/tab-separated-values,application/json,application/zip"
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
                Import a GBIF-style occurrence dataset as CSV/TSV, JSON, or a GBIF download ZIP (simple CSV or Darwin
                Core Archive). Files must include at least{' '}
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
        </>
      )}

      {savedOccurrences.length > 0 && (
        <Menu
          anchorEl={savedOccurrencesAnchor}
          open={Boolean(savedOccurrencesAnchor)}
          onClose={() => setSavedOccurrencesAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          slotProps={{ paper: { sx: { minWidth: 280, maxWidth: 'min(400px, calc(100vw - 24px))' } } }}
        >
          {savedOccurrences.map((occ) => {
            const name = occ.vernacularName?.trim() || occ.scientificName || `Occurrence ${occ.gbifKey ?? occ.key}`;
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
          })}
        </Menu>
      )}

      {hasExportActions && (
        <Menu
          anchorEl={exportMenuAnchor}
          open={Boolean(exportMenuAnchor)}
          onClose={() => setExportMenuAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{ paper: { sx: { mt: 1, maxWidth: 'calc(100vw - 24px)' } } }}
        >
          {renderExportMenuItems('export', () => setExportMenuAnchor(null), true)}
        </Menu>
      )}

      {onSceneModeChange && (
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
                      disabled={!ION_TOKEN_CONFIGURED}
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
                        secondary={ION_TOKEN_CONFIGURED ? '3D buildings overlay' : 'Requires a Cesium Ion token'}
                      />
                    </MenuItem>,
                    <Divider key="photorealistic-divider" sx={{ my: 1 }} />,
                  ]
                : []),
              ...(onBaseMapChange
                ? [
                    <ListSubheader key="base-subheader" sx={{ lineHeight: 2 }}>Base map</ListSubheader>,
                    ...[
                      {
                        id: 'bing' as const,
                        primary: 'Bing Aerial',
                        secondary: ION_TOKEN_CONFIGURED
                          ? 'Satellite imagery (Cesium Ion)'
                          : 'Requires a Cesium Ion token',
                        disabled: !ION_TOKEN_CONFIGURED,
                      },
                      { id: 'osm' as const, primary: 'OpenStreetMap', secondary: 'Street map' },
                      { id: 'opentopomap' as const, primary: 'OpenTopoMap', secondary: 'Terrain and contours' },
                    ].map(({ id, primary, secondary, disabled }) => (
                      <MenuItem
                        key={id}
                        disabled={disabled}
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
      )}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
        <ExportDataDialog
          open={exportDialogFormat != null}
          format={exportDialogFormat}
          visibleCount={visibleOccurrenceCount}
          allCount={occurrenceCount}
          hasRegion={regionBounds != null}
          regionName={regionName}
          onClose={() => setExportDialogFormat(null)}
          onConfirm={handleExportConfirm}
        />
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
  );
}
