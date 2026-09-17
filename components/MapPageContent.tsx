'use client';

import { useCallback, useEffect, useState } from 'react';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import GlobeViewer from '@/components/GlobeViewerDynamic';
import MapTopBar from '@/components/MapTopBar';
import OccurrenceTimeline from '@/components/OccurrenceTimeline';
import IucnLegend from '@/components/IucnLegend';
import ErrorBoundary from '@/components/ErrorBoundary';
import Lightbox from '@/components/Lightbox';
import MapCornerControls from '@/components/MapCornerControls';
import MapAppDialogs from '@/components/MapAppDialogs';
import OfflineBanner from '@/components/OfflineBanner';
import GuidedTour, { shouldAutoStartTour } from '@/components/GuidedTour';
import { useMapAppState, REGION_ID_PLACE, DEFAULT_BASE_MAP } from '@/lib/hooks/use-map-app-state';
import { useShareUrl } from '@/lib/hooks/use-share-url';

export default function MapPageContent() {
  const app = useMapAppState();
  const [tourOpen, setTourOpen] = useState(false);
  const [shareSnackbar, setShareSnackbar] = useState(false);

  const { copyShareUrl } = useShareUrl(app.shareUrlState, DEFAULT_BASE_MAP, app.hydrateFromShareUrl);

  useEffect(() => {
    if (shouldAutoStartTour()) {
      const t = setTimeout(() => setTourOpen(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  const handleShare = useCallback(async () => {
    const ok = await copyShareUrl();
    setShareSnackbar(ok);
  }, [copyShareUrl]);

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
      <GuidedTour open={tourOpen} onClose={() => setTourOpen(false)} />
      <Snackbar
        open={shareSnackbar}
        autoHideDuration={3000}
        onClose={() => setShareSnackbar(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" variant="filled" onClose={() => setShareSnackbar(false)}>
          Link copied to clipboard
        </Alert>
      </Snackbar>
      <MapAppDialogs
        exportScopePrompt={app.exportScopePrompt}
        onExportScopeChoice={app.handleExportScopeChoice}
        onCloseExportScope={() => app.setExportScopePrompt(null)}
        favoriteNameOpen={app.favoriteNameOpen}
        favoriteName={app.favoriteName}
        onFavoriteNameChange={app.setFavoriteName}
        onConfirmFavoriteName={app.handleConfirmFavoriteName}
        onCloseFavoriteName={() => app.setFavoriteNameOpen(false)}
        importError={app.importError}
        onCloseImportError={() => app.setImportError(null)}
        savedOccurrenceLimitHit={app.savedOccurrenceLimitHit}
        maxSavedOccurrences={app.maxSavedOccurrences}
        onCloseSavedLimit={() => app.setSavedOccurrenceLimitHit(false)}
      />
      <OfflineBanner offlineMode={app.offlineMode} offlineLabel={app.offlineLabel} />
      <div style={{ position: 'absolute', inset: 0 }}>
        <ErrorBoundary>
          <GlobeViewer
            occurrences={app.displayedOccurrences}
            loading={app.loading}
            error={app.error}
            progress={app.progress}
            onCancelLoad={app.cancelLoad}
            hasTaxonFilter={app.hasTaxonFilter}
            onBoundsChange={app.setViewBounds}
            onGlobeHandle={app.handleGlobeHandle}
            flyToBounds={app.selectedRegionBounds ?? undefined}
            flyToBoundsKey={app.flyToBoundsKey}
            drawRegionMode={app.drawRegionMode}
            drawShapeMode={app.drawShapeMode}
            onDrawnRegion={app.handleDrawnRegion}
            drawnBounds={
              app.selectedRegionId === 'drawn'
                ? app.drawnBounds
                : app.selectedRegionPolygon
                  ? app.selectedRegionBounds
                  : null
            }
            drawnPolygon={app.selectedRegionPolygon}
            sceneMode={app.sceneMode}
            baseMap={app.baseMap}
            photorealistic3D={app.photorealistic3D}
            flyMode={app.flyMode}
            onFlyModeChange={app.setFlyMode}
            savedOccurrenceKeys={app.savedOccurrenceKeys}
            selectedOccurrenceKey={app.selectedOccurrenceKey}
            selectedOccurrenceRequestId={app.selectedOccurrenceRequestId}
            onSelectedOccurrenceHandled={app.handleSelectedOccurrenceHandled}
          />
        </ErrorBoundary>
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
          <div data-tour="timeline" style={{ pointerEvents: 'auto' }}>
            <OccurrenceTimeline
              occurrences={app.allOccurrences}
              selectedYear={app.selectedYear}
              selectedMonth={app.selectedMonth}
              onYearChange={app.setSelectedYear}
              onMonthChange={app.setSelectedMonth}
            />
          </div>
        </div>
        <MapCornerControls
          onShare={handleShare}
          onResetHome={app.handleResetHome}
          onResetNorth={app.handleResetNorth}
          flyMode={app.flyMode}
          onToggleFlyMode={app.handleToggleFlyMode}
        />
        <MapTopBar
          region={{
            selectedRegionId: app.selectedRegionId,
            onRegionChange: (id) => {
              app.setSelectedRegionId(id);
              app.setFlyNonce((n) => n + 1);
              if (id !== REGION_ID_PLACE) app.setPlaceSearchResult(null);
            },
            favorites: app.favorites,
            drawnBounds: app.drawnBounds,
            drawnPolygon: app.drawnPolygon,
            placeSearchResult: app.placeSearchResult,
            onPlaceSelect: (bounds, name, countryCode) => {
              app.setPlaceSearchResult({
                name,
                bounds,
                ...(countryCode != null ? { countryCode } : {}),
              });
              app.setSelectedRegionId(REGION_ID_PLACE);
              app.setFlyNonce((n) => n + 1);
            },
            onStartDrawRegion: app.handleStartDrawRegion,
            drawRegionMode: app.drawRegionMode,
            drawShapeMode: app.drawShapeMode,
            onCancelDrawRegion: app.handleCancelDrawRegion,
            onFinishDrawRegion: app.handleFinishDrawRegion,
            onSaveDrawnRegion: app.handleSaveDrawnRegion,
            onClearDrawnRegion: app.handleClearDrawnRegion,
            onRemoveFavorite: app.handleRemoveFavorite,
            regionBounds: app.selectedRegionBounds,
            regionName: app.regionDisplayName || undefined,
          }}
          filters={app.filters}
          onFiltersChange={app.setFilters}
          importState={{
            onImportFile: app.handleImportFile,
            importedOccurrenceCount: app.importedOccurrences.length,
            importedOccurrences: app.importedOccurrences,
            onClearImport: app.importedOccurrences.length > 0 ? app.handleClearImport : undefined,
          }}
          exportHandlers={{
            onExportImage: app.handleExportImage,
            onExportGeoJSON: app.handleExportGeoJSON,
            onExportCSV: app.handleExportCSV,
            onExportPDF: app.handleExportPDF,
            occurrenceCount: app.allOccurrences.length,
            visibleOccurrenceCount: app.visibleOnMapOccurrences.length,
          }}
          saved={{
            savedOccurrences: app.savedOccurrences,
            onSelectOccurrence: app.handleSelectOccurrence,
            onRemoveSavedOccurrence: app.handleRemoveSavedOccurrence,
          }}
          viewOptions={{
            sceneMode: app.sceneMode,
            onSceneModeChange: app.setSceneMode,
            baseMap: app.baseMap,
            onBaseMapChange: app.setBaseMap,
            photorealistic3D: app.photorealistic3D,
            onPhotorealistic3DChange: app.setPhotorealistic3D,
          }}
          onStartTour={() => setTourOpen(true)}
          githubUrl={process.env.NEXT_PUBLIC_GITHUB_REPO_URL}
        />
      </div>
    </main>
  );
}
