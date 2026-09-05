'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Viewer } from 'resium';
import * as Cesium from 'cesium';
import type { GBIFOccurrence } from '@/types/gbif';
import type { Bounds, DrawnRegion, LonLat } from '@/lib/geometry';
import { CESIUM_ION_TOKEN } from '@/lib/ion';
import { MAX_OCCURRENCES_FOR_ENTITIES, VIEWER_CONTEXT_OPTIONS } from './globe/constants';
import {
  type BaseMapType,
  type SceneModeType,
  getDefaultImageryProvider,
} from './globe/imagery';
import {
  OccurrenceEntities,
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
  ExportImageHandler,
  ExportPdfCanvasHandler,
  FlyToBounds,
  InfoBoxLinkFix,
  OccurrenceImageLoader,
  Photorealistic3DSync,
  SceneModeSync,
  SelectOccurrence,
} from './globe/scene-handlers';

export { SAVE_OCCURRENCE_EVENT } from './globe/constants';
export { EXPORT_PDF_EVENT, EXPORT_PDF_CANVAS_READY_EVENT } from './globe/export-utils';
export type { BaseMapType, SceneModeType } from './globe/imagery';

interface GlobeSceneProps {
  occurrences: GBIFOccurrence[];
  onBoundsChange: (bounds: Bounds) => void;
  flyToBounds?: Bounds | null;
  drawRegionMode?: boolean;
  onDrawnRegion?: (region: DrawnRegion) => void;
  drawnBounds?: Bounds | null;
  drawnPolygon?: LonLat[] | null;
  sceneMode?: SceneModeType;
  baseMap?: BaseMapType;
  photorealistic3D?: boolean;
  loading?: boolean;
  error?: string | null;
  savedOccurrenceKeys?: Set<number>;
  selectedOccurrenceKey?: number | null;
  selectedOccurrenceRequestId?: number;
  onSelectedOccurrenceHandled?: () => void;
}

export default function GlobeScene({
  occurrences,
  onBoundsChange,
  flyToBounds,
  drawRegionMode = false,
  onDrawnRegion,
  drawnBounds,
  drawnPolygon,
  sceneMode = '3D',
  baseMap = 'osm',
  photorealistic3D = false,
  savedOccurrenceKeys,
  selectedOccurrenceKey,
  selectedOccurrenceRequestId,
  onSelectedOccurrenceHandled,
}: GlobeSceneProps) {
  const [isClient, setIsClient] = useState(false);
  const [ionEnabled, setIonEnabled] = useState(false);
  const [pointsHidden, setPointsHidden] = useState(false);
  const [terrain, setTerrain] = useState<Cesium.TerrainProvider | null>(null);
  const [imageUrlsByKey, setImageUrlsByKey] = useState<Record<number, string[]>>({});
  const [pickedOccurrenceKey, setPickedOccurrenceKey] = useState<number | null>(null);
  const [pickRequestId, setPickRequestId] = useState(0);

  const usePrimitiveMode = occurrences.length > MAX_OCCURRENCES_FOR_ENTITIES;
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
      <CameraTiltConstraints sceneMode={sceneMode} />
      <CameraTiltReporter onPointsHiddenChange={setPointsHidden} />
      <SceneModeSync sceneMode={sceneMode} />
      <EnsureBaseImagery provider={baseImageryProvider} />
      <BaseMapSync baseMap={baseMap} ionEnabled={ionEnabled} />
      <Photorealistic3DSync enabled={photorealistic3D && ionEnabled} />
      <OccurrenceImageLoader
        occurrenceKey={usePrimitiveMode ? displayedOccurrenceKey : null}
        onImageLoaded={handleOccurrenceImageLoaded}
      />
      <ExportImageHandler />
      <ExportPdfCanvasHandler />
      <InfoBoxLinkFix />
      <CameraBoundsReporter onBoundsChange={onBoundsChange} />
      {flyToBounds && <FlyToBounds bounds={flyToBounds} />}
      {selectedOccurrenceKey != null && (
        <SelectOccurrence
          occurrenceKey={selectedOccurrenceKey}
          requestId={selectedOccurrenceRequestId}
          occurrences={occurrences}
          usePrimitiveMode={usePrimitiveMode}
          onHandled={onSelectedOccurrenceHandled}
        />
      )}
      {drawRegionMode && onDrawnRegion && (
        <DrawRegionHandler active onDrawnRegion={onDrawnRegion} />
      )}
      {drawnBounds && (
        <DrawnRegionOverlay bounds={drawnBounds} polygon={drawnPolygon ?? undefined} />
      )}
      {usePrimitiveMode ? (
        <>
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
        </>
      ) : (
        <OccurrenceEntities
          occurrences={occurrences}
          sceneMode={sceneMode}
          pointsHidden={pointsHidden}
          imageUrlsByKey={imageUrlsByKey}
          savedOccurrenceKeys={savedOccurrenceKeys}
          selectedOccurrenceKey={selectedOccurrenceKey}
        />
      )}
    </Viewer>
  );
}
