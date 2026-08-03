'use client';

import { useEffect, useRef } from 'react';
import { useCesium } from 'resium';
import * as Cesium from 'cesium';
import type { GBIFOccurrence } from '@/types/gbif';
import type { Bounds } from '@/lib/geometry';
import { rectangleToBounds } from '@/lib/geometry';
import {
  BOUNDS_REPORT_THROTTLE_MS,
  EXPORT_IMAGE_EVENT,
  EXPORT_PDF_CANVAS_READY_EVENT,
  EXPORT_PDF_EVENT,
  LIGHTBOX_EVENT,
  LIGHTBOX_PHOTO_CLASS,
  SAVE_BUTTON_CLASS,
  SAVE_OCCURRENCE_EVENT,
  SELECTED_INFO_ENTITY_ID,
} from './constants';
import {
  captureCanvasAsDataUrl,
  downloadCanvasAsPng,
} from './export-utils';
import {
  type BaseMapType,
  type SceneModeType,
  createImageryProvider,
  getIonImageryStyle,
} from './imagery';

export type { SceneModeType };

/** Constrains how far the camera can tilt in 3D so angles stay readable. */
export function CameraTiltConstraints({ sceneMode }: { sceneMode: SceneModeType }) {
  const cesium = useCesium();
  useEffect(() => {
    const viewer = cesium?.viewer;
    const controller = viewer?.scene?.screenSpaceCameraController;
    if (!controller) return;
    // In 3D, limit extreme grazing angles; in 2D, use Cesium default.
    if (sceneMode === '3D') {
      controller.maximumTiltAngle = Cesium.Math.toRadians(70); // a bit shallower than horizon
    } else {
      controller.maximumTiltAngle = Cesium.Math.PI_OVER_TWO;
    }
  }, [cesium?.viewer, sceneMode]);
  return null;
}

/** Reports the camera tilt angle (pitch) so we can hide dots when viewing from an angle. */
export function CameraTiltReporter({ onTiltChange }: { onTiltChange: (tiltRadians: number) => void }) {
  const cesium = useCesium();
  useEffect(() => {
    const v = cesium?.viewer;
    if (!v?.camera) return;
    
    let rafId: number | null = null;
    let cancelled = false;
    
    const updateTilt = () => {
      if (cancelled || !v?.camera) return;
      try {
        // Camera pitch: 0 = looking straight down, PI/2 = looking horizontally
        const pitch = v.camera.pitch;
        onTiltChange(pitch);
      } catch {
        // ignore
      }
      rafId = requestAnimationFrame(updateTilt);
    };
    
    rafId = requestAnimationFrame(updateTilt);
    
    return () => {
      cancelled = true;
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [cesium?.viewer, onTiltChange]);
  return null;
}

/** When user selects an occurrence entity, fetches its images from our API and notifies parent. */
export function OccurrenceImageLoader({
  onImageLoaded,
}: {
  onImageLoaded: (occurrenceKey: number, urls: string[]) => void;
}) {
  const cesium = useCesium();
  useEffect(() => {
    let v: (typeof cesium)['viewer'];
    try {
      v = cesium?.viewer;
      if (v?.selectedEntityChanged == null) return;
    } catch {
      return;
    }
    const viewer = v;
    let cancelled = false;
    let activeController: AbortController | null = null;
    let requestSeq = 0;
    const remove = viewer.selectedEntityChanged.addEventListener((entity: Cesium.Entity | undefined) => {
      if (cancelled) return;
      activeController?.abort();
      const key = entity?.id != null ? Number(entity.id) : NaN;
      if (!Number.isInteger(key) || key < 1) {
        return;
      }
      const controller = new AbortController();
      activeController = controller;
      const seq = ++requestSeq;
      fetch(`/api/occurrence/${key}/image`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data: { urls?: string[] }) => {
          if (!cancelled && !controller.signal.aborted && seq === requestSeq && Array.isArray(data?.urls)) {
            onImageLoaded(key, data.urls);
          }
        })
        .catch(() => {
          if (!cancelled && !controller.signal.aborted && seq === requestSeq) onImageLoaded(key, []);
        });
    });
    return () => {
      cancelled = true;
      activeController?.abort();
      try {
        if (typeof remove === 'function') remove();
      } catch {
        // ignore
      }
    };
  }, [cesium?.viewer, onImageLoaded]);
  return null;
}

/** Listens for export-image event and captures the Cesium scene canvas (after a render) so PNG is not black. */
export function ExportImageHandler() {
  const cesium = useCesium();
  useEffect(() => {
    let v: (typeof cesium)['viewer'];
    try {
      v = cesium?.viewer;
      if (v?.scene?.canvas == null) return;
    } catch {
      return;
    }
    const viewer = v;
    const handler = () => {
      try {
        const canvas = viewer.scene?.canvas;
        if (!canvas) return;
        viewer.scene.requestRender();
        requestAnimationFrame(() => {
          downloadCanvasAsPng(canvas as HTMLCanvasElement, 'gbif-globe.png');
        });
      } catch {
        // ignore
      }
    };
    window.addEventListener(EXPORT_IMAGE_EVENT, handler);
    return () => window.removeEventListener(EXPORT_IMAGE_EVENT, handler);
  }, [cesium?.viewer]);
  return null;
}

/** Listens for export-pdf event; captures globe canvas and dispatches canvas-ready with data URL for PDF. */
export function ExportPdfCanvasHandler() {
  const cesium = useCesium();
  useEffect(() => {
    const viewer = cesium?.viewer;
    const handler = () => {
      try {
        const canvas = viewer?.scene?.canvas;
        if (!canvas) {
          window.dispatchEvent(
            new CustomEvent(EXPORT_PDF_CANVAS_READY_EVENT, { detail: { imageDataUrl: null } })
          );
          return;
        }
        viewer.scene.requestRender();
        requestAnimationFrame(() => {
          const dataUrl = captureCanvasAsDataUrl(canvas as HTMLCanvasElement);
          window.dispatchEvent(
            new CustomEvent(EXPORT_PDF_CANVAS_READY_EVENT, { detail: { imageDataUrl: dataUrl } })
          );
        });
      } catch {
        window.dispatchEvent(
          new CustomEvent(EXPORT_PDF_CANVAS_READY_EVENT, { detail: { imageDataUrl: null } })
        );
      }
    };
    window.addEventListener(EXPORT_PDF_EVENT, handler);
    return () => window.removeEventListener(EXPORT_PDF_EVENT, handler);
  }, [cesium?.viewer]);
  return null;
}

/** Ensures links in the InfoBox popup open correctly (sandboxed iframe can block them). Handles photo click for lightbox. */
export function InfoBoxLinkFix() {
  const cesium = useCesium();
  useEffect(() => {
    let v: (typeof cesium)['viewer'];
    try {
      v = cesium?.viewer;
      if (v?.infoBox?.frame == null) return;
    } catch {
      return;
    }
    const frame = v.infoBox.frame;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Element;
      const photo = target?.closest?.(`.${LIGHTBOX_PHOTO_CLASS}`);
      if (photo) {
        e.preventDefault();
        e.stopPropagation();
        const el = photo as HTMLElement;
        const fullUrl = el.dataset?.fullurl ?? (photo as HTMLImageElement).src ?? '';
        if (!fullUrl) return;
        try {
          const allurlsRaw = el.dataset?.allurls;
          const indexRaw = el.dataset?.index;
          if (allurlsRaw != null && indexRaw != null) {
            const urls = JSON.parse(allurlsRaw) as string[];
            const index = Math.max(0, Math.min(parseInt(indexRaw, 10), urls.length - 1));
            (window.top ?? window).dispatchEvent(new CustomEvent(LIGHTBOX_EVENT, { detail: { urls, index } }));
          } else {
            (window.top ?? window).dispatchEvent(new CustomEvent(LIGHTBOX_EVENT, { detail: { url: fullUrl } }));
          }
        } catch {
          (window.top ?? window).dispatchEvent(new CustomEvent(LIGHTBOX_EVENT, { detail: { url: fullUrl } }));
        }
        return;
      }
      const saveBtn = target?.closest?.(`.${SAVE_BUTTON_CLASS}`);
      if (saveBtn) {
        e.preventDefault();
        e.stopPropagation();
        const key = parseInt((saveBtn as HTMLElement).dataset?.key ?? '', 10);
        const action = (saveBtn as HTMLElement).dataset?.action as 'add' | 'remove' | undefined;
        if (Number.isInteger(key) && (action === 'add' || action === 'remove')) {
          (window.top ?? window).dispatchEvent(
            new CustomEvent(SAVE_OCCURRENCE_EVENT, { detail: { key, action } })
          );
        }
        return;
      }
      const a = target?.closest?.('a');
      if (!a || !a.href) return;
      e.preventDefault();
      e.stopPropagation();
      (window.top ?? window).open(a.href, '_blank', 'noopener,noreferrer');
    };
    const onLoad = () => {
      const doc = frame.contentDocument;
      if (!doc) return;
      doc.addEventListener('click', handleClick);
    };
    if (frame.contentDocument?.body) onLoad();
    else frame.addEventListener('load', onLoad);
    return () => {
      frame.removeEventListener('load', onLoad);
      try {
        frame.contentDocument?.removeEventListener('click', handleClick);
      } catch {
        // ignore
      }
    };
  }, [cesium?.viewer]);
  return null;
}

export function CameraBoundsReporter({ onBoundsChange }: { onBoundsChange: (b: Bounds) => void }) {
  const cesium = useCesium();
  useEffect(() => {
    let v: typeof cesium.viewer;
    try {
      v = cesium?.viewer;
      if (v == null || !v.scene?.canvas || !v.camera) return;
    } catch {
      return;
    }
    let lastReport = 0;
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;
    const reportBounds = () => {
      try {
        if (!v.camera || !v.scene?.globe) return;
        const rect = v.camera.computeViewRectangle();
        if (rect) {
          onBoundsChange(
            rectangleToBounds(
              rect.west,
              rect.south,
              rect.east,
              rect.north,
              true
            )
          );
          lastReport = Date.now();
        }
      } catch {
        // viewer may be destroyed mid-callback
      }
    };
    const handler = () => {
      const now = Date.now();
      const elapsed = now - lastReport;
      if (throttleTimer) clearTimeout(throttleTimer);
      if (elapsed >= BOUNDS_REPORT_THROTTLE_MS || lastReport === 0) {
        reportBounds();
      } else {
        throttleTimer = setTimeout(() => {
          throttleTimer = null;
          reportBounds();
        }, BOUNDS_REPORT_THROTTLE_MS - elapsed);
      }
    };
    let cancelled = false;
    const rafId = requestAnimationFrame(() => {
      if (cancelled || !v?.scene?.canvas || !v.camera?.moveEnd) return;
      try {
        v.camera.moveEnd.addEventListener(handler);
        handler();
      } catch {
        // scene/camera not ready
      }
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (throttleTimer) clearTimeout(throttleTimer);
      try {
        if (v?.camera?.moveEnd) v.camera.moveEnd.removeEventListener(handler);
      } catch {
        // viewer may already be destroyed
      }
    };
  }, [cesium?.viewer, onBoundsChange]);
  return null;
}

export function FlyToBounds({ bounds }: { bounds: Bounds }) {
  const cesium = useCesium();
  useEffect(() => {
    if (!bounds) return;
    let viewer: typeof cesium.viewer;
    try {
      viewer = cesium?.viewer;
      if (viewer == null || !viewer.scene?.canvas || !viewer.camera) return;
    } catch {
      return;
    }
    const { west, south, east, north } = bounds;
    const rectangle = Cesium.Rectangle.fromDegrees(west, south, east, north);
    try {
      viewer.camera.flyTo({
        destination: rectangle,
        duration: 1.2,
        complete: () => {},
      });
    } catch {
      // viewer may be destroyed
    }
  }, [cesium?.viewer, bounds.west, bounds.south, bounds.east, bounds.north]);
  return null;
}

/** Selects an occurrence entity by key and flies to it, opening the info box. */
export function SelectOccurrence({
  occurrenceKey,
  requestId,
  occurrences,
  usePrimitiveMode,
  onHandled,
}: {
  occurrenceKey: number | null;
  requestId?: number;
  occurrences: GBIFOccurrence[];
  usePrimitiveMode: boolean;
  onHandled?: () => void;
}) {
  const cesium = useCesium();
  useEffect(() => {
    if (occurrenceKey == null) return;
    let viewer: typeof cesium.viewer;
    try {
      viewer = cesium?.viewer;
      if (viewer == null || !viewer.entities || !viewer.camera) return;
    } catch {
      return;
    }
    const occ = occurrences.find((o) => o.key === occurrenceKey);
    if (!occ || occ.decimalLatitude == null || occ.decimalLongitude == null) {
      onHandled?.();
      return;
    }

    const position = Cesium.Cartesian3.fromDegrees(
      occ.decimalLongitude,
      occ.decimalLatitude,
      0
    );
    const currentHeading = viewer.camera.heading;

    if (usePrimitiveMode) {
      const infoEntity = viewer.entities.getById(SELECTED_INFO_ENTITY_ID);
      try {
        viewer.camera.flyTo({
          destination: position,
          duration: 1.2,
          orientation: {
            heading: currentHeading,
            pitch: -Cesium.Math.PI_OVER_TWO,
            roll: 0,
          },
          complete: () => {
            try {
              if (infoEntity) viewer.selectedEntity = infoEntity;
            } catch {
              // viewer may be destroyed
            } finally {
              onHandled?.();
            }
          },
        });
      } catch {
        // viewer may be destroyed
        onHandled?.();
      }
      return;
    }

    let retryCount = 0;
    const MAX_RETRIES = 20;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const findAndSelectEntity = () => {
      if (cancelled) return;
      const entity = viewer.entities.getById(String(occurrenceKey));
      if (!entity) {
        retryCount++;
        if (retryCount < MAX_RETRIES) {
          timeoutId = setTimeout(findAndSelectEntity, 50);
        } else {
          onHandled?.();
        }
        return;
      }
      try {
        viewer.camera.flyTo({
          destination: position,
          duration: 1.2,
          orientation: {
            heading: currentHeading,
            pitch: -Cesium.Math.PI_OVER_TWO,
            roll: 0,
          },
          complete: () => {
            if (cancelled) return;
            try {
              viewer.selectedEntity = entity;
            } catch {
              // viewer may be destroyed
            } finally {
              onHandled?.();
            }
          },
        });
      } catch {
        // viewer may be destroyed
        onHandled?.();
      }
    };

    findAndSelectEntity();

    return () => {
      cancelled = true;
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, [cesium?.viewer, occurrenceKey, requestId, occurrences, usePrimitiveMode, onHandled]);
  return null;
}

/** Applies scene mode from top bar (3D / 2D) to the Cesium viewer. */
export function SceneModeSync({ sceneMode }: { sceneMode: SceneModeType }) {
  const cesium = useCesium();
  useEffect(() => {
    const viewer = cesium?.viewer;
    if (viewer?.scene == null) return;
    let mode: Cesium.SceneMode | undefined;
    try {
      switch (sceneMode) {
        case '3D':
          mode = Cesium.SceneMode.SCENE3D;
          break;
        case '2D':
          mode = Cesium.SceneMode.SCENE2D;
          break;
      }
      if (mode != null) {
        viewer.scene.mode = mode;
      }
    } catch {
      // viewer may be destroyed
    }
  }, [cesium?.viewer, sceneMode]);
  return null;
}

/** Replaces the base imagery layer when base map selection changes (View menu). */
export function BaseMapSync({ baseMap, ionEnabled }: { baseMap: BaseMapType; ionEnabled: boolean }) {
  const cesium = useCesium();
  useEffect(() => {
    const viewer = cesium?.viewer;
    if (viewer?.scene?.imageryLayers == null) return;

    const layers = viewer.scene.imageryLayers;
    const base = layers.get(0);
    if (!base) return;

    const ionStyle = getIonImageryStyle(baseMap);
    if (ionStyle != null) {
      if (!ionEnabled) {
        // Bing via ion requires a valid token; keep the app usable by falling back to a free basemap.
        try {
          const fallback = createImageryProvider('osm');
          layers.addImageryProvider(fallback, 0);
          layers.remove(base, true);
        } catch {
          // ignore
        }
        return;
      }
      let cancelled = false;
      Cesium.createWorldImageryAsync({ style: ionStyle })
        .then((provider) => {
          if (cancelled) return;
          try {
            layers.addImageryProvider(provider, 0);
            layers.remove(base, true);
            // If the provider later fails (e.g. bad token / rate limit), fall back to OSM.
            const errorEvent = (provider as unknown as { errorEvent?: Cesium.Event }).errorEvent;
            if (errorEvent && typeof (errorEvent as unknown as { addEventListener?: unknown }).addEventListener === 'function') {
              const remove = (errorEvent as unknown as { addEventListener: (cb: () => void) => () => void }).addEventListener(() => {
                try {
                  const fallback = createImageryProvider('osm');
                  layers.addImageryProvider(fallback, 0);
                  // remove the failing top layer if it exists at index 1+
                  const top = layers.get(0);
                  if (top) layers.remove(top, true);
                } catch {
                  // ignore
                }
                try {
                  remove?.();
                } catch {
                  // ignore
                }
              });
            }
          } catch {
            // ignore
          }
        })
        .catch(() => {
          if (cancelled) return;
          try {
            const fallback = createImageryProvider('osm');
            layers.addImageryProvider(fallback, 0);
            layers.remove(base, true);
          } catch {
            // ignore
          }
        });
      return () => {
        cancelled = true;
      };
    }

    try {
      const provider = createImageryProvider(baseMap);
      layers.addImageryProvider(provider, 0);
      layers.remove(base, true);
    } catch {
      // Keep existing base layer if replacement fails.
    }
  }, [cesium?.viewer, baseMap, ionEnabled]);
  return null;
}

/** Ensures we never end up with zero imagery layers (blank globe). */
export function EnsureBaseImagery({ provider }: { provider: Cesium.ImageryProvider }) {
  const cesium = useCesium();
  useEffect(() => {
    const viewer = cesium?.viewer;
    if (viewer?.scene?.imageryLayers == null) return;
    const layers = viewer.scene.imageryLayers;
    if (layers.length > 0) return;
    try {
      layers.addImageryProvider(provider, 0);
    } catch {
      // ignore
    }
  }, [cesium?.viewer, provider]);
  return null;
}

/** Optional Google Photorealistic 3D Tiles overlay (Cesium Ion). */
export function Photorealistic3DSync({ enabled }: { enabled: boolean }) {
  const cesium = useCesium();
  const tilesetRef = useRef<Cesium.Cesium3DTileset | null>(null);

  useEffect(() => {
    const viewer = cesium?.viewer;
    if (viewer?.scene?.primitives == null) return;

    if (!enabled) {
      const tileset = tilesetRef.current;
      if (tileset) {
        viewer.scene.primitives.remove(tileset);
        tilesetRef.current = null;
      }
      return;
    }

    const createGooglePhotorealistic3DTileset =
      (Cesium as unknown as { createGooglePhotorealistic3DTileset?: () => Promise<Cesium.Cesium3DTileset> })
        .createGooglePhotorealistic3DTileset;
    if (typeof createGooglePhotorealistic3DTileset !== 'function') {
      return;
    }

    let cancelled = false;
    const createTileset = async (): Promise<Cesium.Cesium3DTileset> => {
      // Cesium emits a warning if Google Photorealistic is used without Google geocoder.
      // We don't use Cesium's geocoder UI, so we silence the warning via additionalOptions when supported.
      try {
        return await (createGooglePhotorealistic3DTileset as unknown as (opts?: unknown) => Promise<Cesium.Cesium3DTileset>)({
          additionalOptions: { onlyUsingWithGoogleGeocoder: true },
        });
      } catch {
        return await createGooglePhotorealistic3DTileset();
      }
    };

    createTileset()
      .then((tileset) => {
        if (cancelled || !viewer?.scene?.primitives) return;
        viewer.scene.primitives.add(tileset);
        tilesetRef.current = tileset;
      })
      .catch(() => {
        // Token or API not available; fail silently
      });

    return () => {
      cancelled = true;
      const tileset = tilesetRef.current;
      if (tileset && viewer?.scene?.primitives) {
        viewer.scene.primitives.remove(tileset);
        tilesetRef.current = null;
      }
    };
  }, [cesium?.viewer, enabled]);
  return null;
}

/** Optional environmental overlay (e.g. land cover / relief) as second imagery layer. */
export function EnvironmentalOverlaySync({ layer }: { layer: 'none' | 'landcover' }) {
  const cesium = useCesium();
  useEffect(() => {
    const viewer = cesium?.viewer;
    if (viewer?.scene?.imageryLayers == null) return;
    if (layer === 'none') {
      // Remove overlay if present (index 1)
      while (viewer.scene.imageryLayers.length > 1) {
        viewer.scene.imageryLayers.remove(viewer.scene.imageryLayers.get(1));
      }
      return;
    }
    // Land cover / relief: OpenTopoMap as semi-transparent overlay (hotspots / terrain context)
    const provider = new Cesium.UrlTemplateImageryProvider({
      url: 'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
      credit: 'Map tiles: © OpenTopoMap (CC-BY-SA)',
    });
    const existing = viewer.scene.imageryLayers.get(1);
    if (existing) viewer.scene.imageryLayers.remove(existing, true);
    const newLayer = viewer.scene.imageryLayers.addImageryProvider(provider, 1);
    newLayer.alpha = 0.45;
    return () => {
      viewer.scene.imageryLayers.remove(newLayer, true);
    };
  }, [cesium?.viewer, layer]);
  return null;
}

/** Renders the drawn region as a rectangle entity (using Cesium API directly). */
export function DrawnRegionOverlay({ bounds }: { bounds: Bounds }) {
  const cesium = useCesium();
  useEffect(() => {
    let v: (typeof cesium)['viewer'];
    try {
      v = cesium?.viewer;
      if (v == null || !v.entities) return;
    } catch {
      return;
    }
    const viewer = v;
    const { west, south, east, north } = bounds;
    const entity = viewer.entities.add({
      rectangle: {
        coordinates: Cesium.Rectangle.fromDegrees(west, south, east, north),
        fill: false,
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#78b578'),
        outlineWidth: 32,
      },
    });
    return () => {
      viewer.entities.remove(entity);
    };
  }, [cesium?.viewer, bounds.west, bounds.south, bounds.east, bounds.north]);
  return null;
}

/** Two-click rectangle drawing on the globe; reports bounds via onDrawnBounds. */
export function DrawRegionHandler({
  active,
  onDrawnBounds,
}: {
  active: boolean;
  onDrawnBounds: (b: Bounds) => void;
}) {
  const cesium = useCesium();
  const firstClickRef = useRef<Cesium.Cartographic | null>(null);

  useEffect(() => {
    if (!active) {
      firstClickRef.current = null;
      return;
    }
    let v: (typeof cesium)['viewer'];
    try {
      v = cesium?.viewer;
      if (v == null || !v.scene?.canvas || !v.camera) return;
    } catch {
      return;
    }
    const viewer = v;
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    handler.setInputAction((event: { position: Cesium.Cartesian2 }) => {
      try {
        const ray = viewer.camera.getPickRay(event.position);
        if (!ray) return;
        const position = viewer.scene.globe.pick(ray, viewer.scene);
        if (!position) return;
        const carto = Cesium.Cartographic.fromCartesian(position);
        const lonDeg = Cesium.Math.toDegrees(carto.longitude);
        const latDeg = Cesium.Math.toDegrees(carto.latitude);

        const first = firstClickRef.current;
        if (first == null) {
          firstClickRef.current = new Cesium.Cartographic(
            carto.longitude,
            carto.latitude,
            carto.height
          );
          return;
        }

        const lon1 = Cesium.Math.toDegrees(first.longitude);
        const lat1 = Cesium.Math.toDegrees(first.latitude);
        const west = Math.min(lon1, lonDeg);
        const east = Math.max(lon1, lonDeg);
        const south = Math.min(lat1, latDeg);
        const north = Math.max(lat1, latDeg);
        firstClickRef.current = null;
        onDrawnBounds(rectangleToBounds(west, south, east, north));
      } catch {
        // ignore pick/camera errors
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      if (!handler.isDestroyed()) handler.destroy();
      firstClickRef.current = null;
    };
  }, [active, cesium?.viewer, onDrawnBounds]);

  return null;
}
