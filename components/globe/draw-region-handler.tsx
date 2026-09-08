'use client';

import { useEffect, useRef, type MutableRefObject } from 'react';
import { useCesium } from 'resium';
import * as Cesium from 'cesium';
import type { DrawnRegion, LonLat } from '@/lib/geometry';
import {
  finishPolygonVertices,
  finishTwoPointShape,
  previewVerticesForShape,
  type DrawShapeMode,
} from '@/lib/draw-region';

export type { DrawShapeMode };

/** Vertex dots, connecting polyline and (from 3 vertices) a translucent fill for the in-progress shape. */
function addDrawPreviewEntities(viewer: Cesium.Viewer, vertices: LonLat[]): Cesium.Entity[] {
  if (vertices.length === 0) return [];
  const entities: Cesium.Entity[] = [];
  const pointColor = Cesium.Color.fromCssColorString('#78b578');
  // For dense circle previews, skip per-vertex dots (keep outline + fill only).
  const showVertexDots = vertices.length <= 8;
  if (showVertexDots) {
    for (const [lon, lat] of vertices) {
      entities.push(
        viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat),
          point: {
            pixelSize: 8,
            color: pointColor,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        })
      );
    }
  }

  if (vertices.length >= 2) {
    const closed =
      vertices.length >= 3 ? [...vertices, vertices[0]] : vertices;
    entities.push(
      viewer.entities.add({
        polyline: {
          positions: closed.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat)),
          width: 2,
          material: pointColor,
          clampToGround: true,
        },
      })
    );
  }

  if (vertices.length >= 3) {
    entities.push(
      viewer.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(
            vertices.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat))
          ),
          material: pointColor.withAlpha(0.15),
          outline: true,
          outlineColor: pointColor,
          outlineWidth: 2,
          height: 0,
        },
      })
    );
  }
  return entities;
}

/**
 * Region drawing on the globe.
 * - polygon: multi-click vertices; double-click or finishRef completes
 * - rectangle / circle: click-drag (or click + second click) then release to finish
 */
export function DrawRegionHandler({
  active,
  mode = 'polygon',
  onDrawnRegion,
  onPreviewVerticesChange,
  finishRef,
}: {
  active: boolean;
  mode?: DrawShapeMode;
  onDrawnRegion: (region: DrawnRegion) => void;
  /** Live preview ring while drawing (empty when cleared / finished). */
  onPreviewVerticesChange?: (vertices: LonLat[]) => void;
  /** Assigned while drawing so imperative finishDrawing can complete the polygon. */
  finishRef?: MutableRefObject<(() => void) | null>;
}) {
  const cesium = useCesium();
  const viewer = cesium?.viewer;
  const verticesRef = useRef<LonLat[]>([]);
  const anchorRef = useRef<LonLat | null>(null);
  const draggingRef = useRef(false);
  const previewEntitiesRef = useRef<Cesium.Entity[]>([]);
  const onPreviewRef = useRef(onPreviewVerticesChange);
  onPreviewRef.current = onPreviewVerticesChange;

  useEffect(() => {
    if (!active) {
      verticesRef.current = [];
      anchorRef.current = null;
      draggingRef.current = false;
      if (finishRef) finishRef.current = null;
      onPreviewRef.current?.([]);
      return;
    }
    if (viewer == null || !viewer.scene?.canvas || !viewer.camera) return;

    const clearPreview = () => {
      for (const entity of previewEntitiesRef.current) viewer.entities.remove(entity);
      previewEntitiesRef.current = [];
    };

    const updatePreview = (vertices: LonLat[]) => {
      clearPreview();
      previewEntitiesRef.current = addDrawPreviewEntities(viewer, vertices);
      onPreviewRef.current?.(vertices);
    };

    const emitRegion = (region: DrawnRegion | null) => {
      if (!region) return;
      clearPreview();
      verticesRef.current = [];
      anchorRef.current = null;
      draggingRef.current = false;
      onPreviewRef.current?.([]);
      onDrawnRegion(region);
    };

    const finishPolygon = () => {
      emitRegion(finishPolygonVertices(verticesRef.current));
    };

    if (finishRef) {
      finishRef.current = mode === 'polygon' ? finishPolygon : null;
    }

    const pickLonLat = (position: Cesium.Cartesian2): LonLat | null => {
      try {
        const ray = viewer.camera.getPickRay(position);
        if (!ray) return null;
        const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
        if (!cartesian) return null;
        const carto = Cesium.Cartographic.fromCartesian(cartesian);
        return [
          Cesium.Math.toDegrees(carto.longitude),
          Cesium.Math.toDegrees(carto.latitude),
        ];
      } catch {
        return null;
      }
    };

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    // While drawing, suppress camera rotate/tilt on left-drag so shapes aren't fighting the view.
    const controller = viewer.scene.screenSpaceCameraController;
    const prevRotate = controller.enableRotate;
    const prevTilt = controller.enableTilt;
    const prevTranslate = controller.enableTranslate;
    if (mode !== 'polygon') {
      controller.enableRotate = false;
      controller.enableTilt = false;
      controller.enableTranslate = false;
    }

    if (mode === 'polygon') {
      handler.setInputAction((event: { position: Cesium.Cartesian2 }) => {
        const coord = pickLonLat(event.position);
        if (!coord) return;
        verticesRef.current = [...verticesRef.current, coord];
        updatePreview(verticesRef.current);
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

      handler.setInputAction(finishPolygon, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    } else {
      const shapeMode = mode;
      // Distinguishes click-drag finish from the LEFT_CLICK that Cesium also fires on release.
      let suppressNextClick = false;
      let dragMoved = false;
      let startedOnDown = false;

      const movedEnough = (a: LonLat, b: LonLat) =>
        Math.abs(a[0] - b[0]) > 1e-5 || Math.abs(a[1] - b[1]) > 1e-5;

      handler.setInputAction((event: { position: Cesium.Cartesian2 }) => {
        const coord = pickLonLat(event.position);
        if (!coord) return;
        if (!anchorRef.current) {
          anchorRef.current = coord;
          draggingRef.current = true;
          dragMoved = false;
          startedOnDown = true;
          updatePreview(previewVerticesForShape(shapeMode, coord, coord, []));
        }
      }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

      handler.setInputAction((event: { endPosition: Cesium.Cartesian2 }) => {
        if (!draggingRef.current || !anchorRef.current) return;
        const coord = pickLonLat(event.endPosition);
        if (!coord) return;
        if (movedEnough(anchorRef.current, coord)) dragMoved = true;
        updatePreview(previewVerticesForShape(shapeMode, anchorRef.current, coord, []));
      }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

      handler.setInputAction((event: { position: Cesium.Cartesian2 }) => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        const coord = pickLonLat(event.position);
        if (dragMoved && anchorRef.current && coord) {
          suppressNextClick = true;
          emitRegion(finishTwoPointShape(shapeMode, anchorRef.current, coord));
        }
      }, Cesium.ScreenSpaceEventType.LEFT_UP);

      handler.setInputAction((event: { position: Cesium.Cartesian2 }) => {
        if (suppressNextClick) {
          suppressNextClick = false;
          return;
        }
        const coord = pickLonLat(event.position);
        if (!coord) return;
        if (!anchorRef.current) {
          anchorRef.current = coord;
          startedOnDown = false;
          updatePreview(previewVerticesForShape(shapeMode, coord, coord, []));
          return;
        }
        // Ignore the click that pairs with the first LEFT_DOWN (no drag yet).
        if (startedOnDown && !dragMoved) {
          startedOnDown = false;
          return;
        }
        emitRegion(finishTwoPointShape(shapeMode, anchorRef.current, coord));
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    return () => {
      if (!handler.isDestroyed()) handler.destroy();
      clearPreview();
      verticesRef.current = [];
      anchorRef.current = null;
      draggingRef.current = false;
      if (finishRef) finishRef.current = null;
      onPreviewRef.current?.([]);
      try {
        controller.enableRotate = prevRotate;
        controller.enableTilt = prevTilt;
        controller.enableTranslate = prevTranslate;
      } catch {
        // viewer may be destroyed
      }
    };
  }, [active, mode, viewer, onDrawnRegion, finishRef]);

  return null;
}
