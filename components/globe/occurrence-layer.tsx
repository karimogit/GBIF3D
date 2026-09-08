'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useCesium } from 'resium';
import * as Cesium from 'cesium';
import type { GBIFOccurrence } from '@/types/gbif';
import { SELECTED_INFO_ENTITY_ID } from './constants';
import {
  colorForOccurrence,
  getOccurrencePointScaleByDistance,
  occurrenceToDescription,
} from './occurrence-infobox';
import type { SceneModeType } from './imagery';

function hasCoords(o: GBIFOccurrence): boolean {
  return (
    o.decimalLatitude != null &&
    o.decimalLongitude != null &&
    Number.isFinite(o.decimalLatitude) &&
    Number.isFinite(o.decimalLongitude)
  );
}

export function OccurrencePointsPrimitive({
  occurrences,
  sceneMode,
  pointsHidden,
  selectedOccurrenceKey,
  onPickedKey,
}: {
  occurrences: GBIFOccurrence[];
  sceneMode: SceneModeType;
  /** True while the camera is tilted so far that dots would smear across the horizon. */
  pointsHidden: boolean;
  selectedOccurrenceKey?: number | null;
  onPickedKey: (key: number) => void;
}) {
  const cesium = useCesium();
  const collectionRef = useRef<Cesium.PointPrimitiveCollection | null>(null);
  const pointsByKeyRef = useRef<Map<number, Cesium.PointPrimitive>>(new Map());
  const selectedKeyRef = useRef<number | null | undefined>(selectedOccurrenceKey);
  const handlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);

  const withCoords = useMemo(() => occurrences.filter(hasCoords), [occurrences]);

  useEffect(() => {
    const viewer = cesium?.viewer;
    if (viewer?.scene?.primitives == null) return;

    const collection = new Cesium.PointPrimitiveCollection();
    viewer.scene.primitives.add(collection);
    collectionRef.current = collection;
    const pointsByKey = pointsByKeyRef.current;

    return () => {
      if (collectionRef.current) {
        viewer.scene.primitives.remove(collectionRef.current);
        collectionRef.current = null;
      }
      pointsByKey.clear();
    };
  }, [cesium?.viewer]);

  // Rebuild points only when the occurrence set or scene mode changes (not selection/hide).
  useEffect(() => {
    const collection = collectionRef.current;
    if (!collection) return;

    collection.removeAll();
    pointsByKeyRef.current.clear();
    const height = sceneMode === '2D' ? 0 : 1;
    const selectedKey = selectedKeyRef.current;

    for (const occ of withCoords) {
      const isSelected = selectedKey != null && occ.key === selectedKey;
      const point = collection.add({
        position: Cesium.Cartesian3.fromDegrees(occ.decimalLongitude!, occ.decimalLatitude!, height),
        color: colorForOccurrence(occ),
        pixelSize: isSelected ? 18 : 11,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: isSelected ? 3 : 2,
        id: occ.key,
      });
      point.scaleByDistance = getOccurrencePointScaleByDistance();
      point.disableDepthTestDistance = sceneMode === '2D' ? Number.POSITIVE_INFINITY : 0;
      pointsByKeyRef.current.set(occ.key, point);
    }

    collection.show = !pointsHidden;
    // pointsHidden applied for initial show; selection/hide updates use dedicated effects
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild only on data/mode/viewer
  }, [cesium?.viewer, withCoords, sceneMode]);

  useEffect(() => {
    const collection = collectionRef.current;
    if (!collection) return;
    collection.show = !pointsHidden;
  }, [pointsHidden]);

  useEffect(() => {
    const points = pointsByKeyRef.current;
    const prev = selectedKeyRef.current;
    if (prev != null && prev !== selectedOccurrenceKey) {
      const prevPoint = points.get(prev);
      if (prevPoint) {
        prevPoint.pixelSize = 11;
        prevPoint.outlineWidth = 2;
      }
    }
    if (selectedOccurrenceKey != null) {
      const nextPoint = points.get(selectedOccurrenceKey);
      if (nextPoint) {
        nextPoint.pixelSize = 18;
        nextPoint.outlineWidth = 3;
      }
    }
    selectedKeyRef.current = selectedOccurrenceKey;
  }, [selectedOccurrenceKey]);

  useEffect(() => {
    const viewer = cesium?.viewer;
    if (viewer?.scene?.canvas == null) return;

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handlerRef.current = handler;

    handler.setInputAction((event: { position: Cesium.Cartesian2 }) => {
      try {
        const picked = viewer.scene.pick(event.position);
        if (picked?.id != null && typeof picked.id === 'number') {
          onPickedKey(picked.id);
        }
      } catch {
        // ignore
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      if (handlerRef.current && !handlerRef.current.isDestroyed()) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
    };
  }, [cesium?.viewer, onPickedKey]);

  return null;
}

/**
 * In primitive mode there is no Entity per point, so a single hidden entity carries the
 * info-box content for whichever occurrence is currently displayed.
 */
export function SelectedOccurrenceInfoSync({
  displayedKey,
  selectionRequestId,
  occurrences,
  imageUrlsByKey,
  savedOccurrenceKeys,
  onDeselected,
}: {
  displayedKey: number | null;
  /** Increments on every pick so re-picking the same point re-opens the info box. */
  selectionRequestId: number;
  occurrences: GBIFOccurrence[];
  imageUrlsByKey: Record<number, string[]>;
  savedOccurrenceKeys?: Set<number>;
  /** Called when the user closes the info box (Cesium clears the selection). */
  onDeselected?: () => void;
}) {
  const cesium = useCesium();
  const entityRef = useRef<Cesium.Entity | null>(null);

  useEffect(() => {
    const viewer = cesium?.viewer;
    if (viewer?.entities == null) return;

    const entity = viewer.entities.add({
      id: SELECTED_INFO_ENTITY_ID,
      position: Cesium.Cartesian3.fromDegrees(0, 0, 0),
      name: '',
      description: '',
      show: false,
    });
    entityRef.current = entity;

    const remove = viewer.selectedEntityChanged.addEventListener((selected: Cesium.Entity | undefined) => {
      if (selected !== entity) onDeselected?.();
    });

    return () => {
      try {
        remove();
      } catch {
        // ignore
      }
      viewer.entities.remove(entity);
      entityRef.current = null;
    };
  }, [cesium?.viewer, onDeselected]);

  const occ = useMemo(
    () => (displayedKey == null ? undefined : occurrences.find((o) => o.key === displayedKey)),
    [displayedKey, occurrences]
  );

  // Keep the description/position current without touching the selection, so refreshed data
  // (image loads, saves, filter changes) doesn't re-open a box the user dismissed.
  useEffect(() => {
    const entity = entityRef.current;
    if (!entity) return;
    if (!occ || !hasCoords(occ)) {
      entity.show = false;
      return;
    }
    entity.position = new Cesium.ConstantPositionProperty(
      Cesium.Cartesian3.fromDegrees(occ.decimalLongitude!, occ.decimalLatitude!, 0)
    );
    entity.description = new Cesium.ConstantProperty(
      occurrenceToDescription(occ, imageUrlsByKey[occ.key], savedOccurrenceKeys)
    );
    entity.name = occ.scientificName || occ.vernacularName || `Occurrence ${occ.key}`;
    entity.show = true;
  }, [occ, imageUrlsByKey, savedOccurrenceKeys]);

  // Only a new pick (or an explicit deselect) changes which entity is selected.
  useEffect(() => {
    const viewer = cesium?.viewer;
    const entity = entityRef.current;
    if (!viewer || !entity) return;
    if (displayedKey == null || !occ || !hasCoords(occ)) {
      if (viewer.selectedEntity === entity) viewer.selectedEntity = undefined;
      return;
    }
    viewer.selectedEntity = entity;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- occ is derived from displayedKey; selectionRequestId forces re-selection
  }, [cesium?.viewer, displayedKey, selectionRequestId]);

  return null;
}
