'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Viewer } from 'resium';
import * as Cesium from 'cesium';
import type { GBIFOccurrence } from '@/types/gbif';
import type { Bounds } from '@/lib/geometry';
import {
  MAX_OCCURRENCES_FOR_ENTITIES,
  SAVE_OCCURRENCE_EVENT,
  VIEWER_CONTEXT_OPTIONS,
} from './globe/constants';
import {
  EXPORT_PDF_CANVAS_READY_EVENT,
  EXPORT_PDF_EVENT,
} from './globe/export-utils';
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
  EnvironmentalOverlaySync,
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
  onDrawnBounds?: (bounds: Bounds) => void;
  drawnBounds?: Bounds | null;
  sceneMode?: SceneModeType;
  baseMap?: BaseMapType;
  environmentalLayer?: 'none' | 'landcover';
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
  onDrawnBounds,
  drawnBounds,
  sceneMode = '3D',
  baseMap = 'osm',
  environmentalLayer = 'none',
  photorealistic3D = false,
  savedOccurrenceKeys,
  selectedOccurrenceKey,
  selectedOccurrenceRequestId,
  onSelectedOccurrenceHandled,
}: GlobeSceneProps) {
  const [isClient, setIsClient] = useState(false);
  const [ionEnabled, setIonEnabled] = useState(false);
  const [cameraTilt, setCameraTilt] = useState(0);
  const [terrain, setTerrain] = useState<Cesium.TerrainProvider | null>(null);
  const [imageUrlsByKey, setImageUrlsByKey] = useState<Record<number, string[]>>({});
  const [pickedOccurrenceKey, setPickedOccurrenceKey] = useState<number | null>(null);

  const usePrimitiveMode = occurrences.length > MAX_OCCURRENCES_FOR_ENTITIES;
  const displayedOccurrenceKey = selectedOccurrenceKey ?? pickedOccurrenceKey;

  useEffect(() => {
    if (selectedOccurrenceKey != null) {
      setPickedOccurrenceKey(selectedOccurrenceKey);
    }
  }, [selectedOccurrenceKey, selectedOccurrenceRequestId]);

  const handleOccurrenceImageLoaded = useCallback((occurrenceKey: number, urls: string[]) => {
    if (urls.length > 0) setImageUrlsByKey((prev) => ({ ...prev, [occurrenceKey]: urls }));
  }, []);

  const handlePickedKey = useCallback((key: number) => {
    setPickedOccurrenceKey(key);
  }, []);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
    const trimmed = token?.trim();
    if (!trimmed || typeof Cesium === 'undefined' || !Cesium.Ion) {
      setIonEnabled(false);
      return;
    }
    Cesium.Ion.defaultAccessToken = trimmed;
    setIonEnabled(true);
  }, []);

  const baseImageryProvider = useMemo(() => {
    if (!isClient) return undefined;
    return getDefaultImageryProvider();
  }, [isClient]);

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

  if (!isClient || !baseImageryProvider) return null;

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
      imageryProvider={baseImageryProvider}
      contextOptions={VIEWER_CONTEXT_OPTIONS}
    >
      <CameraTiltConstraints sceneMode={sceneMode} />
      <CameraTiltReporter onTiltChange={setCameraTilt} />
      <SceneModeSync sceneMode={sceneMode} />
      <EnsureBaseImagery provider={baseImageryProvider} />
      <BaseMapSync baseMap={baseMap} ionEnabled={ionEnabled} />
      <EnvironmentalOverlaySync layer={environmentalLayer} />
      <Photorealistic3DSync enabled={photorealistic3D && ionEnabled} />
      <OccurrenceImageLoader onImageLoaded={handleOccurrenceImageLoaded} />
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
      {drawRegionMode && onDrawnBounds && (
        <DrawRegionHandler active onDrawnBounds={onDrawnBounds} />
      )}
      {drawnBounds && <DrawnRegionOverlay bounds={drawnBounds} />}
      {usePrimitiveMode ? (
        <>
          <OccurrencePointsPrimitive
            occurrences={occurrences}
            sceneMode={sceneMode}
            cameraTilt={cameraTilt}
            imageUrlsByKey={imageUrlsByKey}
            savedOccurrenceKeys={savedOccurrenceKeys}
            selectedOccurrenceKey={displayedOccurrenceKey ?? undefined}
            onPickedKey={handlePickedKey}
          />
          <SelectedOccurrenceInfoSync
            displayedKey={displayedOccurrenceKey}
            occurrences={occurrences}
            imageUrlsByKey={imageUrlsByKey}
            savedOccurrenceKeys={savedOccurrenceKeys}
          />
        </>
      ) : (
        <OccurrenceEntities
          occurrences={occurrences}
          sceneMode={sceneMode}
          cameraTilt={cameraTilt}
          imageUrlsByKey={imageUrlsByKey}
          savedOccurrenceKeys={savedOccurrenceKeys}
          selectedOccurrenceKey={selectedOccurrenceKey}
        />
      )}
    </Viewer>
  );
}
