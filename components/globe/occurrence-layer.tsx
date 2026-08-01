'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Entity, PointGraphics, useCesium } from 'resium';
import * as Cesium from 'cesium';
import type { GBIFOccurrence } from '@/types/gbif';
import { SELECTED_INFO_ENTITY_ID } from './constants';
import {
  colorForOccurrence,
  getOccurrencePointScaleByDistance,
  occurrenceToDescription,
} from './occurrence-infobox';
import type { SceneModeType } from './imagery';

export function OccurrencePointsPrimitive({
  occurrences,
  sceneMode,
  cameraTilt,
  imageUrlsByKey,
  savedOccurrenceKeys,
  selectedOccurrenceKey,
  onPickedKey,
}: {
  occurrences: GBIFOccurrence[];
  sceneMode: SceneModeType;
  cameraTilt: number;
  imageUrlsByKey: Record<number, string[]>;
  savedOccurrenceKeys?: Set<number>;
  selectedOccurrenceKey?: number | null;
  onPickedKey: (key: number) => void;
}) {
  const cesium = useCesium();
  const collectionRef = useRef<Cesium.PointPrimitiveCollection | null>(null);
  const handlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);

  const withCoords = useMemo(
    () =>
      occurrences.filter(
        (o) =>
          o.decimalLatitude != null &&
          o.decimalLongitude != null &&
          Number.isFinite(o.decimalLatitude) &&
          Number.isFinite(o.decimalLongitude)
      ),
    [occurrences]
  );

  useEffect(() => {
    const viewer = cesium?.viewer;
    if (viewer?.scene?.primitives == null) return;

    const collection = new Cesium.PointPrimitiveCollection();
    viewer.scene.primitives.add(collection);
    collectionRef.current = collection;

    return () => {
      if (collectionRef.current) {
        viewer.scene.primitives.remove(collectionRef.current);
        collectionRef.current = null;
      }
    };
  }, [cesium?.viewer]);

  useEffect(() => {
    const collection = collectionRef.current;
    if (!collection) return;

    collection.removeAll();
    const height = sceneMode === '2D' ? 0 : 1;
    const alpha = cameraTilt > -0.5 ? 0 : 1;

    for (const occ of withCoords) {
      const color = colorForOccurrence(occ).withAlpha(alpha);
      const point = collection.add({
        position: Cesium.Cartesian3.fromDegrees(
          occ.decimalLongitude!,
          occ.decimalLatitude!,
          height
        ),
        color,
        pixelSize: selectedOccurrenceKey != null && occ.key === selectedOccurrenceKey ? 18 : 11,
        outlineColor: Cesium.Color.WHITE.withAlpha(alpha),
        outlineWidth: selectedOccurrenceKey != null && occ.key === selectedOccurrenceKey ? 3 : 2,
        id: occ.key,
      });
      point.scaleByDistance = getOccurrencePointScaleByDistance();
      point.disableDepthTestDistance =
        sceneMode === '2D' ? Number.POSITIVE_INFINITY : 0;
    }
  }, [withCoords, sceneMode, cameraTilt, selectedOccurrenceKey]);

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

export function SelectedOccurrenceInfoSync({
  displayedKey,
  occurrences,
  imageUrlsByKey,
  savedOccurrenceKeys,
}: {
  displayedKey: number | null;
  occurrences: GBIFOccurrence[];
  imageUrlsByKey: Record<number, string[]>;
  savedOccurrenceKeys?: Set<number>;
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

    return () => {
      viewer.entities.remove(entity);
      entityRef.current = null;
    };
  }, [cesium?.viewer]);

  useEffect(() => {
    const viewer = cesium?.viewer;
    const entity = entityRef.current;
    if (!viewer || !entity) return;

    if (displayedKey == null) {
      entity.show = false;
      if (viewer.selectedEntity === entity) viewer.selectedEntity = undefined;
      return;
    }

    const occ = occurrences.find((o) => o.key === displayedKey);
    if (!occ || occ.decimalLatitude == null || occ.decimalLongitude == null) {
      entity.show = false;
      return;
    }

    entity.position = new Cesium.ConstantPositionProperty(
      Cesium.Cartesian3.fromDegrees(
        occ.decimalLongitude,
        occ.decimalLatitude,
        0
      )
    );
    entity.description = new Cesium.ConstantProperty(
      occurrenceToDescription(
        occ,
        imageUrlsByKey[occ.key],
        savedOccurrenceKeys
      )
    );
    entity.name = occ.scientificName || occ.vernacularName || `Occurrence ${occ.key}`;
    entity.show = true;
    viewer.selectedEntity = entity;
  }, [cesium?.viewer, displayedKey, occurrences, imageUrlsByKey, savedOccurrenceKeys]);

  return null;
}

export function OccurrenceEntities({
  occurrences,
  sceneMode,
  cameraTilt,
  imageUrlsByKey,
  savedOccurrenceKeys,
  selectedOccurrenceKey,
}: {
  occurrences: GBIFOccurrence[];
  sceneMode: SceneModeType;
  cameraTilt: number;
  imageUrlsByKey: Record<number, string[]>;
  savedOccurrenceKeys?: Set<number>;
  selectedOccurrenceKey?: number | null;
}) {
  const withCoords = occurrences.filter(
    (o) =>
      o.decimalLatitude != null &&
      o.decimalLongitude != null &&
      Number.isFinite(o.decimalLatitude) &&
      Number.isFinite(o.decimalLongitude)
  );

  return (
    <>
      {withCoords.map((occ) => {
        const isSelected = selectedOccurrenceKey != null && occ.key === selectedOccurrenceKey;
        return (
          <Entity
            key={occ.key}
            id={occ.key}
            position={Cesium.Cartesian3.fromDegrees(
              occ.decimalLongitude!,
              occ.decimalLatitude!,
              sceneMode === '2D' ? 0 : 1
            )}
            description={occurrenceToDescription(
              occ,
              imageUrlsByKey[occ.key],
              savedOccurrenceKeys
            )}
            name={occ.scientificName || occ.vernacularName || `Occurrence ${occ.key}`}
          >
            <PointGraphics
              pixelSize={isSelected ? 18 : 11}
              scaleByDistance={getOccurrencePointScaleByDistance()}
              color={colorForOccurrence(occ).withAlpha(cameraTilt > -0.5 ? 0.0 : 1.0)}
              outlineColor={Cesium.Color.WHITE.withAlpha(
                cameraTilt > -0.5 ? 0.0 : isSelected ? 1.0 : 0.8
              )}
              outlineWidth={isSelected ? 3 : 2}
              disableDepthTestDistance={
                sceneMode === '2D' ? Number.POSITIVE_INFINITY : undefined
              }
              heightReference={
                sceneMode === '2D'
                  ? Cesium.HeightReference.NONE
                  : Cesium.HeightReference.RELATIVE_TO_GROUND
              }
            />
          </Entity>
        );
      })}
    </>
  );
}
