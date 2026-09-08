'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useCesium } from 'resium';
import * as Cesium from 'cesium';
import type { GBIFOccurrence } from '@/types/gbif';
import type { Bounds, LonLat } from '@/lib/geometry';
import { rectangleToBounds } from '@/lib/geometry';
import {
  BOUNDS_REPORT_THROTTLE_MS,
  LIGHTBOX_EVENT,
  LIGHTBOX_PHOTO_CLASS,
  SAVE_BUTTON_CLASS,
  SAVE_OCCURRENCE_EVENT,
  SELECTED_INFO_ENTITY_ID,
} from './constants';
import {
  DEFAULT_BASE_MAP,
  type BaseMapType,
  type SceneModeType,
  createImageryProvider,
  getIonImageryStyle,
} from './imagery';

export { DrawRegionHandler, type DrawShapeMode } from './draw-region-handler';
export { MapKeyboardPan, FlyModeHandler } from './map-navigation';

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

/** Camera pitch (radians) above which dots are hidden: 0 = straight down, -PI/2 = horizon-level. */
const POINTS_HIDDEN_PITCH_THRESHOLD = -0.5;

/**
 * Reports whether the camera is tilted past the threshold where dots should be hidden.
 * Only fires when the boolean flips, so camera movement doesn't re-render the scene every frame.
 */
export function CameraTiltReporter({
  onPointsHiddenChange,
}: {
  onPointsHiddenChange: (hidden: boolean) => void;
}) {
  const cesium = useCesium();
  useEffect(() => {
    const viewer = cesium?.viewer;
    if (!viewer?.camera) return;

    let lastHidden: boolean | null = null;
    const update = () => {
      try {
        const hidden = viewer.camera.pitch > POINTS_HIDDEN_PITCH_THRESHOLD;
        if (hidden !== lastHidden) {
          lastHidden = hidden;
          onPointsHiddenChange(hidden);
        }
      } catch {
        // viewer may be destroyed
      }
    };
    update();
    viewer.camera.changed.addEventListener(update);
    return () => {
      try {
        viewer.camera.changed.removeEventListener(update);
      } catch {
        // ignore
      }
    };
  }, [cesium?.viewer, onPointsHiddenChange]);
  return null;
}

/**
 * Fetches occurrence images from our API when an occurrence is selected.
 * Primary path: `occurrenceKey` prop (primitive / shared info entity). Entity selection remains
 * as a fallback for safety.
 */
export function OccurrenceImageLoader({
  occurrenceKey,
  onImageLoaded,
}: {
  occurrenceKey?: number | null;
  onImageLoaded: (occurrenceKey: number, urls: string[]) => void;
}) {
  const cesium = useCesium();
  const fetchedKeysRef = useRef(new Set<number>());
  const activeControllerRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);

  const load = useCallback(
    (key: number) => {
      if (!Number.isInteger(key) || key < 1 || fetchedKeysRef.current.has(key)) return;
      activeControllerRef.current?.abort();
      const controller = new AbortController();
      activeControllerRef.current = controller;
      const seq = ++requestSeqRef.current;
      fetch(`/api/occurrence/${key}/image`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data: { urls?: string[] }) => {
          if (controller.signal.aborted || seq !== requestSeqRef.current) return;
          fetchedKeysRef.current.add(key);
          onImageLoaded(key, Array.isArray(data?.urls) ? data.urls : []);
        })
        .catch(() => {
          if (!controller.signal.aborted && seq === requestSeqRef.current) onImageLoaded(key, []);
        });
    },
    [onImageLoaded]
  );

  useEffect(() => {
    if (occurrenceKey != null) load(occurrenceKey);
  }, [occurrenceKey, load]);

  // Fallback: entity-id selection (shared info entity is ignored — it has no occurrence key).
  useEffect(() => {
    const viewer = cesium?.viewer;
    if (viewer?.selectedEntityChanged == null) return;
    const remove = viewer.selectedEntityChanged.addEventListener((entity: Cesium.Entity | undefined) => {
      if (entity == null || entity.id === SELECTED_INFO_ENTITY_ID) return;
      load(Number(entity.id));
    });
    return () => {
      try {
        remove();
      } catch {
        // ignore
      }
    };
  }, [cesium?.viewer, load]);

  useEffect(() => () => activeControllerRef.current?.abort(), []);

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
  const viewer = cesium?.viewer;
  useEffect(() => {
    const v = viewer;
    if (v == null || !v.scene?.canvas || !v.camera) return;
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
  }, [viewer, onBoundsChange]);
  return null;
}

export function FlyToBounds({ bounds }: { bounds: Bounds }) {
  const cesium = useCesium();
  const viewer = cesium?.viewer;
  const { west, south, east, north } = bounds;
  useEffect(() => {
    if (viewer == null || !viewer.scene?.canvas || !viewer.camera) return;
    const rectangle = Cesium.Rectangle.fromDegrees(west, south, east, north);
    try {
      viewer.camera.flyTo({ destination: rectangle, duration: 1.2 });
    } catch {
      // viewer may be destroyed
    }
  }, [viewer, west, south, east, north]);
  return null;
}

/** Flies to an occurrence and selects the shared info entity (primitive path). */
export function SelectOccurrence({
  occurrenceKey,
  requestId,
  occurrences,
  onHandled,
}: {
  occurrenceKey: number | null;
  requestId?: number;
  occurrences: GBIFOccurrence[];
  onHandled?: () => void;
}) {
  const cesium = useCesium();
  const viewer = cesium?.viewer;
  useEffect(() => {
    if (occurrenceKey == null) return;
    if (viewer == null || !viewer.entities || !viewer.camera) return;
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
  }, [viewer, occurrenceKey, requestId, occurrences, onHandled]);
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
  const appliedBaseMapRef = useRef<BaseMapType | null>(null);

  useEffect(() => {
    const viewer = cesium?.viewer;
    if (viewer?.scene?.imageryLayers == null) return;

    const layers = viewer.scene.imageryLayers;
    const base = layers.get(0);
    if (!base) return;

    const ionStyle = getIonImageryStyle(baseMap);

    // Viewer already boots with DEFAULT_BASE_MAP; skip the first-mount same-map reload.
    if (
      ionStyle == null &&
      appliedBaseMapRef.current === null &&
      baseMap === DEFAULT_BASE_MAP
    ) {
      appliedBaseMapRef.current = baseMap;
      return;
    }

    if (ionStyle == null && appliedBaseMapRef.current === baseMap) {
      return;
    }

    appliedBaseMapRef.current = baseMap;

    if (ionStyle != null) {
      if (!ionEnabled) {
        // Bing via ion requires a valid token; keep the app usable by falling back to a free basemap.
        try {
          const fallback = createImageryProvider(DEFAULT_BASE_MAP);
          layers.addImageryProvider(fallback, 0);
          layers.remove(base, true);
          appliedBaseMapRef.current = DEFAULT_BASE_MAP;
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
            const ionLayer = layers.addImageryProvider(provider, 0);
            layers.remove(base, true);
            // If the provider later fails (e.g. bad token / rate limit), swap in the default free basemap.
            const errorEvent = provider.errorEvent;
            if (errorEvent) {
              const remove = errorEvent.addEventListener(() => {
                try {
                  remove();
                } catch {
                  // ignore
                }
                try {
                  layers.addImageryProvider(createImageryProvider(DEFAULT_BASE_MAP), 0);
                  if (layers.contains(ionLayer)) layers.remove(ionLayer, true);
                  appliedBaseMapRef.current = DEFAULT_BASE_MAP;
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
            const fallback = createImageryProvider(DEFAULT_BASE_MAP);
            layers.addImageryProvider(fallback, 0);
            layers.remove(base, true);
            appliedBaseMapRef.current = DEFAULT_BASE_MAP;
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

/** Renders the drawn region as a polygon or rectangle entity. */
export function DrawnRegionOverlay({
  bounds,
  polygon,
}: {
  bounds: Bounds;
  polygon?: LonLat[];
}) {
  const cesium = useCesium();
  const viewer = cesium?.viewer;
  const { west, south, east, north } = bounds;
  useEffect(() => {
    if (viewer == null || !viewer.entities) return;
    const outlineColor = Cesium.Color.fromCssColorString('#78b578');
    const fillColor = Cesium.Color.fromCssColorString('#78b578').withAlpha(0.12);

    let entity: Cesium.Entity;
    if (polygon && polygon.length >= 3) {
      const positions = polygon.map(([lon, lat]) =>
        Cesium.Cartesian3.fromDegrees(lon, lat)
      );
      entity = viewer.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(positions),
          material: fillColor,
          outline: true,
          outlineColor,
          outlineWidth: 2,
          height: 0,
        },
      });
    } else {
      entity = viewer.entities.add({
        rectangle: {
          coordinates: Cesium.Rectangle.fromDegrees(west, south, east, north),
          fill: false,
          outline: true,
          outlineColor,
          outlineWidth: 32,
        },
      });
    }
    return () => {
      viewer.entities.remove(entity);
    };
  }, [viewer, west, south, east, north, polygon]);
  return null;
}

