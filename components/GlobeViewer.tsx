'use client';

import type { ChunkProgress } from '@/lib/gbif';
import type { Bounds, DrawnRegion, LonLat } from '@/lib/geometry';
import type { BaseMapId } from '@/lib/base-map';
import { toImageryBaseMap } from '@/lib/base-map';
import type { GBIFOccurrence } from '@/types/gbif';
import GlobeScene, { type GlobeSceneHandle, type DrawShapeMode } from './GlobeScene';

interface GlobeViewerProps {
  /** Already-filtered occurrences to show on the globe (parent owns fetch + display merge). */
  occurrences: GBIFOccurrence[];
  loading?: boolean;
  error?: string | null;
  progress?: ChunkProgress | null;
  onCancelLoad?: () => void;
  hasTaxonFilter?: boolean;
  onBoundsChange: (bounds: Bounds) => void;
  onGlobeHandle?: (handle: GlobeSceneHandle | null) => void;
  flyToBounds?: Bounds | null;
  flyToBoundsKey?: string | number;
  drawRegionMode?: boolean;
  drawShapeMode?: DrawShapeMode;
  onDrawnRegion?: (region: DrawnRegion) => void;
  drawnBounds?: Bounds | null;
  drawnPolygon?: LonLat[] | null;
  sceneMode?: '3D' | '2D';
  baseMap?: BaseMapId;
  photorealistic3D?: boolean;
  flyMode?: boolean;
  onFlyModeChange?: (enabled: boolean) => void;
  savedOccurrenceKeys?: Set<number>;
  selectedOccurrenceKey?: number | null;
  selectedOccurrenceRequestId?: number;
  onSelectedOccurrenceHandled?: () => void;
}

export default function GlobeViewer({
  occurrences,
  loading = false,
  error = null,
  progress = null,
  onCancelLoad,
  hasTaxonFilter = false,
  onBoundsChange,
  onGlobeHandle,
  flyToBounds = null,
  flyToBoundsKey,
  drawRegionMode = false,
  drawShapeMode = 'polygon',
  onDrawnRegion,
  drawnBounds = null,
  drawnPolygon = null,
  sceneMode = '3D',
  baseMap = 'opentopomap',
  photorealistic3D = false,
  flyMode = false,
  onFlyModeChange,
  savedOccurrenceKeys,
  selectedOccurrenceKey,
  selectedOccurrenceRequestId,
  onSelectedOccurrenceHandled,
}: GlobeViewerProps) {
  const progressLabel =
    progress != null
      ? `Loaded ${progress.loadedChunks} / ${progress.totalChunks} chunks (${progress.loadedRecords.toLocaleString()} records)`
      : 'Loading occurrences from GBIF…';

  const drawHint =
    drawShapeMode === 'rectangle'
      ? 'Click and drag (or click two corners) to draw a rectangle.'
      : drawShapeMode === 'circle'
        ? 'Click the center, then drag (or click again) to set the radius.'
        : 'Click to add polygon points. Double-click or tap Done to finish.';

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
      }}
    >
      <GlobeScene
        occurrences={occurrences}
        savedOccurrenceKeys={savedOccurrenceKeys}
        selectedOccurrenceKey={selectedOccurrenceKey}
        selectedOccurrenceRequestId={selectedOccurrenceRequestId}
        onSelectedOccurrenceHandled={onSelectedOccurrenceHandled}
        onBoundsChange={onBoundsChange}
        onGlobeHandle={onGlobeHandle}
        flyToBounds={flyToBounds ?? undefined}
        flyToBoundsKey={flyToBoundsKey}
        drawRegionMode={drawRegionMode}
        drawShapeMode={drawShapeMode}
        onDrawnRegion={onDrawnRegion}
        drawnBounds={drawnBounds}
        drawnPolygon={drawnPolygon}
        sceneMode={sceneMode}
        baseMap={toImageryBaseMap(baseMap)}
        photorealistic3D={photorealistic3D}
        flyMode={flyMode}
        onFlyModeChange={onFlyModeChange}
        loading={loading}
        error={error}
      />
      {drawRegionMode && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute',
            top: 124,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '10px 16px',
            background: 'rgba(0,0,0,0.75)',
            color: '#fff',
            borderRadius: 8,
            fontSize: 14,
            zIndex: 997,
            pointerEvents: 'none',
          }}
        >
          {drawHint}
        </div>
      )}
      {flyMode && !drawRegionMode && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute',
            top: 124,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '10px 16px',
            background: 'rgba(0,0,0,0.75)',
            color: '#fff',
            borderRadius: 8,
            fontSize: 14,
            zIndex: 997,
            pointerEvents: 'none',
            textAlign: 'center',
            maxWidth: 'min(420px, calc(100vw - 32px))',
          }}
        >
          Fly mode — WASD move, Q/E up/down, Shift faster, drag to look. Esc or toggle to exit.
          {photorealistic3D ? ' Photorealistic 3D is on.' : ' Tip: enable Photorealistic 3D in View.'}
        </div>
      )}
      {loading && (
        <>
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.15)',
              pointerEvents: 'auto',
              zIndex: 998,
            }}
          />
          <div
            role="status"
            aria-live="polite"
            aria-label="Loading occurrences"
            style={{
              position: 'absolute',
              top: 80,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '8px 16px',
              background: 'rgba(0,0,0,0.7)',
              color: '#fff',
              borderRadius: 8,
              fontSize: 14,
              zIndex: 999,
            }}
          >
            <span>{progressLabel}</span>
            {onCancelLoad && (
              <button
                type="button"
                onClick={onCancelLoad}
                style={{
                  pointerEvents: 'auto',
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.6)',
                  color: '#fff',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </>
      )}
      {!loading && !hasTaxonFilter && !drawRegionMode && occurrences.length === 0 && !error && (
        <div
          role="status"
          style={{
            position: 'absolute',
            top: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '8px 16px',
            background: 'rgba(0, 0, 0, 0.7)',
            color: '#fff',
            borderRadius: 8,
            maxWidth: '90%',
            fontSize: 14,
            zIndex: 999,
            textAlign: 'center',
          }}
        >
          Open <strong>Filters</strong> and pick a species or taxonomic group to load occurrences for this region.
        </div>
      )}
      {!loading && hasTaxonFilter && occurrences.length === 0 && !error && (
        <div
          role="status"
          style={{
            position: 'absolute',
            top: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '8px 16px',
            background: 'rgba(0, 0, 0, 0.7)',
            color: '#fff',
            borderRadius: 8,
            maxWidth: '90%',
            fontSize: 14,
            zIndex: 999,
            textAlign: 'center',
          }}
        >
          No occurrences found for this species in the current area. Try a broader region (e.g. World) or another filter.
        </div>
      )}
      {error && (
        <div
          role="alert"
          style={{
            position: 'absolute',
            top: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '8px 16px',
            background: 'rgba(198, 40, 40, 0.9)',
            color: '#fff',
            borderRadius: 8,
            maxWidth: '90%',
            zIndex: 1000,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
