'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Viewer, useCesium } from 'resium';
import * as Cesium from 'cesium';
import type { GBIFOccurrence } from '@/types/gbif';
import type { Bounds, DrawnRegion, LonLat } from '@/lib/geometry';
import { CESIUM_ION_TOKEN } from '@/lib/ion';
import { VIEWER_CONTEXT_OPTIONS, type ExportRegionDetail } from './globe/constants';
import type { GlobeSceneHandle } from './globe/globe-handle';
import {
  captureCanvasAsDataUrl,
  downloadCanvasAsPng,
  prepareCanvasForExport,
} from './globe/export-utils';
import {
  resetCameraHome,
  resetCameraNorth,
  restoreCameraState,
  saveCameraState,
  setTopDownExportView,
  waitForTilesLoaded,
} from './globe/export-camera';
import {
  DEFAULT_BASE_MAP,
  type BaseMapType,
  type SceneModeType,
  getDefaultImageryProvider,
} from './globe/imagery';
import {
  OccurrencePointsPrimitive,
  SelectedOccurrenceInfoSync,
} from './globe/occurrence-layer';
import {
  BaseMapSync,
  CameraBoundsReporter,
  CameraTiltConstraints,
  CameraTiltReporter,
  DrawRegionHandler,
  DrawnRegionOverlay,
  EnsureBaseImagery,
  FlyModeHandler,
  FlyToBounds,
  InfoBoxLinkFix,
  MapKeyboardPan,
  OccurrenceImageLoader,
  Photorealistic3DSync,
  SceneModeSync,
  SelectOccurrence,
  type DrawShapeMode,
} from './globe/scene-handlers';

export type { BaseMapType, SceneModeType } from './globe/imagery';
export type { GlobeSceneHandle } from './globe/globe-handle';
export type { DrawShapeMode };

interface GlobeSceneProps {
  occurrences: GBIFOccurrence[];
  onBoundsChange: (bounds: Bounds) => void;
  flyToBounds?: Bounds | null;
  /** Remount FlyToBounds when this changes so re-selecting the same region re-flies. */
  flyToBoundsKey?: string | number;
  drawRegionMode?: boolean;
  drawShapeMode?: DrawShapeMode;
  onDrawnRegion?: (region: DrawnRegion) => void;
  /** Live preview vertices while a region is being drawn. */
  onDrawPreviewVerticesChange?: (vertices: LonLat[]) => void;
  drawnBounds?: Bounds | null;
  drawnPolygon?: LonLat[] | null;
  sceneMode?: SceneModeType;
  baseMap?: BaseMapType;
  photorealistic3D?: boolean;
  flyMode?: boolean;
  onFlyModeChange?: (enabled: boolean) => void;
  loading?: boolean;
  error?: string | null;
  savedOccurrenceKeys?: Set<number>;
  selectedOccurrenceKey?: number | null;
  selectedOccurrenceRequestId?: number;
  onSelectedOccurrenceHandled?: () => void;
  /** Registers imperative export/draw commands with the parent (avoids dynamic forwardRef). */
  onGlobeHandle?: (handle: GlobeSceneHandle | null) => void;
}

/**
 * Registers Cesium-backed export/draw commands onto a mutable ref from the parent Viewer tree.
 * useCesium() only works inside Viewer children.
 */
function GlobeCommands({
  register,
  drawFinishRef,
}: {
  register: (api: GlobeSceneHandle) => void;
  drawFinishRef: MutableRefObject<(() => void) | null>;
}) {
  const cesium = useCesium();

  useEffect(() => {
    const exportImage = (detail?: ExportRegionDetail) => {
      try {
        const viewer = cesium?.viewer;
        if (viewer?.scene?.canvas == null) return;
        const onPostRender = () => {
          viewer.scene.postRender.removeEventListener(onPostRender);
          try {
            const canvas = viewer.scene?.canvas;
            if (!canvas) return;
            const prepared = prepareCanvasForExport(canvas as HTMLCanvasElement, viewer, detail);
            downloadCanvasAsPng(prepared, 'gbif-globe.png');
          } catch {
            // ignore
          }
        };
        viewer.scene.postRender.addEventListener(onPostRender);
        viewer.scene.requestRender();
      } catch {
        // ignore
      }
    };

    const capturePdfSnapshot = async (detail?: ExportRegionDetail): Promise<string | null> => {
      const viewer = cesium?.viewer;
      if (!viewer?.scene?.canvas) return null;
      const frameBounds = detail?.frameBounds ?? null;
      const savedCamera = saveCameraState(viewer);
      try {
        if (frameBounds) {
          setTopDownExportView(viewer, frameBounds);
        } else {
          viewer.scene.requestRender();
        }
        await waitForTilesLoaded(viewer);
        return await new Promise<string | null>((resolve) => {
          const onPostRender = () => {
            viewer.scene.postRender.removeEventListener(onPostRender);
            try {
              const canvas = viewer.scene?.canvas;
              if (!canvas) {
                resolve(null);
                return;
              }
              const prepared = prepareCanvasForExport(canvas as HTMLCanvasElement, viewer, detail);
              resolve(captureCanvasAsDataUrl(prepared));
            } catch {
              resolve(null);
            } finally {
              try {
                restoreCameraState(viewer, savedCamera);
                viewer.scene.requestRender();
              } catch {
                // viewer may be destroyed
              }
            }
          };
          try {
            viewer.scene.postRender.addEventListener(onPostRender);
            viewer.scene.requestRender();
          } catch {
            try {
              restoreCameraState(viewer, savedCamera);
            } catch {
              // ignore
            }
            resolve(null);
          }
        });
      } catch {
        try {
          restoreCameraState(viewer, savedCamera);
        } catch {
          // ignore
        }
        return null;
      }
    };

    const finishDrawing = () => {
      drawFinishRef.current?.();
    };

    const resetNorth = () => {
      try {
        const viewer = cesium?.viewer;
        if (viewer?.camera == null) return;
        resetCameraNorth(viewer);
      } catch {
        // viewer may be destroyed
      }
    };

    const resetHome = () => {
      try {
        const viewer = cesium?.viewer;
        if (viewer?.camera == null) return;
        resetCameraHome(viewer);
      } catch {
        // viewer may be destroyed
      }
    };

    register({ exportImage, capturePdfSnapshot, finishDrawing, resetNorth, resetHome });
  }, [cesium?.viewer, register, drawFinishRef]);

  return null;
}

export default function GlobeScene({
  occurrences,
  onBoundsChange,
  flyToBounds,
  flyToBoundsKey,
  drawRegionMode = false,
  drawShapeMode = 'polygon',
  onDrawnRegion,
  onDrawPreviewVerticesChange,
  drawnBounds,
  drawnPolygon,
  sceneMode = '3D',
  baseMap = DEFAULT_BASE_MAP,
  photorealistic3D = false,
  flyMode = false,
  onFlyModeChange,
  savedOccurrenceKeys,
  selectedOccurrenceKey,
  selectedOccurrenceRequestId,
  onSelectedOccurrenceHandled,
  onGlobeHandle,
}: GlobeSceneProps) {
  const [isClient, setIsClient] = useState(false);
  const [ionEnabled, setIonEnabled] = useState(false);
  const [pointsHidden, setPointsHidden] = useState(false);
  const [terrain, setTerrain] = useState<Cesium.TerrainProvider | null>(null);
  const [imageUrlsByKey, setImageUrlsByKey] = useState<Record<number, string[]>>({});
  const [pickedOccurrenceKey, setPickedOccurrenceKey] = useState<number | null>(null);
  const [pickRequestId, setPickRequestId] = useState(0);

  const commandsRef = useRef<GlobeSceneHandle | null>(null);
  const drawFinishRef = useRef<(() => void) | null>(null);
  const onGlobeHandleRef = useRef(onGlobeHandle);
  onGlobeHandleRef.current = onGlobeHandle;

  const registerCommands = useCallback((api: GlobeSceneHandle) => {
    commandsRef.current = api;
    onGlobeHandleRef.current?.(api);
  }, []);

  useEffect(() => {
    return () => {
      commandsRef.current = null;
      onGlobeHandleRef.current?.(null);
    };
  }, []);

  const displayedOccurrenceKey = selectedOccurrenceKey ?? pickedOccurrenceKey;

  useEffect(() => {
    if (selectedOccurrenceKey != null) {
      setPickedOccurrenceKey(selectedOccurrenceKey);
      setPickRequestId((id) => id + 1);
    }
  }, [selectedOccurrenceKey, selectedOccurrenceRequestId]);

  const handleOccurrenceImageLoaded = useCallback((occurrenceKey: number, urls: string[]) => {
    if (urls.length > 0) setImageUrlsByKey((prev) => ({ ...prev, [occurrenceKey]: urls }));
  }, []);

  const handlePickedKey = useCallback((key: number) => {
    setPickedOccurrenceKey(key);
    setPickRequestId((id) => id + 1);
  }, []);

  const handleDeselected = useCallback(() => {
    setPickedOccurrenceKey(null);
  }, []);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (CESIUM_ION_TOKEN == null || typeof Cesium === 'undefined' || !Cesium.Ion) {
      setIonEnabled(false);
      return;
    }
    Cesium.Ion.defaultAccessToken = CESIUM_ION_TOKEN;
    setIonEnabled(true);
  }, []);

  const baseImageryProvider = useMemo(() => {
    if (!isClient) return undefined;
    return getDefaultImageryProvider();
  }, [isClient]);

  // Cesium >= 1.104 replaced the Viewer `imageryProvider` option with `baseLayer`. Passing the
  // old option is silently ignored, which made the Viewer boot with Ion world imagery (a failing
  // network request without a token) before BaseMapSync swapped it out.
  const baseLayer = useMemo(
    () => (baseImageryProvider ? new Cesium.ImageryLayer(baseImageryProvider) : undefined),
    [baseImageryProvider],
  );

  useEffect(() => {
    let cancelled = false;
    if (!ionEnabled) {
      setTerrain(new Cesium.EllipsoidTerrainProvider());
      return () => {
        cancelled = true;
      };
    }
    Cesium.createWorldTerrainAsync()
      .then((t) => {
        if (!cancelled) setTerrain(t);
      })
      .catch(() => {
        if (!cancelled) setTerrain(new Cesium.EllipsoidTerrainProvider());
      });
    return () => {
      cancelled = true;
    };
  }, [ionEnabled]);

  if (!isClient || !baseImageryProvider || !baseLayer) return null;

  return (
    <Viewer
      full
      timeline={false}
      animation={false}
      baseLayerPicker={false}
      geocoder={false}
      homeButton={false}
      sceneModePicker={false}
      navigationHelpButton={false}
      fullscreenButton
      vrButton={false}
      scene3DOnly={false}
      requestRenderMode={false}
      terrainProvider={terrain ?? undefined}
      baseLayer={baseLayer}
      contextOptions={VIEWER_CONTEXT_OPTIONS}
    >
      <GlobeCommands register={registerCommands} drawFinishRef={drawFinishRef} />
      <CameraTiltConstraints sceneMode={sceneMode} />
      <CameraTiltReporter onPointsHiddenChange={setPointsHidden} />
      <SceneModeSync sceneMode={sceneMode} />
      <EnsureBaseImagery provider={baseImageryProvider} />
      <BaseMapSync baseMap={baseMap} ionEnabled={ionEnabled} />
      <Photorealistic3DSync enabled={photorealistic3D && ionEnabled} />
      <OccurrenceImageLoader
        occurrenceKey={displayedOccurrenceKey}
        onImageLoaded={handleOccurrenceImageLoaded}
      />
      <InfoBoxLinkFix />
      <CameraBoundsReporter onBoundsChange={onBoundsChange} />
      {flyToBounds && (
        <FlyToBounds key={flyToBoundsKey ?? 'fly'} bounds={flyToBounds} />
      )}
      {selectedOccurrenceKey != null && (
        <SelectOccurrence
          occurrenceKey={selectedOccurrenceKey}
          requestId={selectedOccurrenceRequestId}
          occurrences={occurrences}
          onHandled={onSelectedOccurrenceHandled}
        />
      )}
      {drawRegionMode && onDrawnRegion && (
        <DrawRegionHandler
          active
          mode={drawShapeMode}
          onDrawnRegion={onDrawnRegion}
          onPreviewVerticesChange={onDrawPreviewVerticesChange}
          finishRef={drawFinishRef}
        />
      )}
      <MapKeyboardPan enabled={!drawRegionMode} reserveWasd={flyMode} />
      <FlyModeHandler
        active={flyMode && !drawRegionMode}
        onRequestExit={() => onFlyModeChange?.(false)}
      />
      {drawnBounds && (
        <DrawnRegionOverlay bounds={drawnBounds} polygon={drawnPolygon ?? undefined} />
      )}
      <OccurrencePointsPrimitive
        occurrences={occurrences}
        sceneMode={sceneMode}
        pointsHidden={pointsHidden}
        selectedOccurrenceKey={displayedOccurrenceKey ?? undefined}
        onPickedKey={handlePickedKey}
      />
      <SelectedOccurrenceInfoSync
        displayedKey={displayedOccurrenceKey}
        selectionRequestId={pickRequestId}
        occurrences={occurrences}
        imageUrlsByKey={imageUrlsByKey}
        savedOccurrenceKeys={savedOccurrenceKeys}
        onDeselected={handleDeselected}
      />
    </Viewer>
  );
}
