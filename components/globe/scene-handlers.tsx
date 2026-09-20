'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useCesium } from 'resium';
import * as Cesium from 'cesium';
import type { GBIFOccurrence } from '@/types/gbif';
import type { Bounds, LonLat } from '@/lib/geometry';
import { rectangleToBounds } from '@/lib/geometry';
import {
  BOUNDS_REPORT_THROTTLE_MS,
  SELECTED_INFO_ENTITY_ID,
} from './constants';
import {
  dispatchLightboxFromPhoto,
  dispatchSaveFromButton,
  eventTargetElement,
  findInfoBoxInteractiveTarget,
} from './info-box-actions';
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
/** Reports camera height above ellipsoid (meters) when it changes meaningfully. */
export function CameraHeightReporter({
  onHeightChange,
}: {
  onHeightChange: (heightMeters: number) => void;
}) {
  const cesium = useCesium();
  useEffect(() => {
    const viewer = cesium?.viewer;
    if (!viewer?.camera) return;

    let lastHeight = -1;
    const update = () => {
      try {
        const carto = viewer.camera.positionCartographic;
        const height = carto.height;
        if (!Number.isFinite(height)) return;
        const rounded = Math.round(height / 500) * 500;
        if (rounded !== lastHeight) {
          lastHeight = rounded;
          onHeightChange(height);
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
  }, [cesium?.viewer, onHeightChange]);
  return null;
}

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

/** Fetches an English/common species name from GBIF when an occurrence is selected. */
export function OccurrenceSpeciesLoader({
  occurrenceKey,
  taxonKey,
  onEnglishNameLoaded,
}: {
  occurrenceKey?: number | null;
  taxonKey?: number | null;
  onEnglishNameLoaded: (occurrenceKey: number, englishName: string | null) => void;
}) {
  const cesium = useCesium();
  const fetchedKeysRef = useRef(new Set<number>());
  const activeControllerRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);

  const load = useCallback(
    (occKey: number, speciesKey: number) => {
      if (!Number.isInteger(occKey) || occKey < 1) return;
      if (!Number.isInteger(speciesKey) || speciesKey < 1) return;
      if (fetchedKeysRef.current.has(occKey)) return;

      activeControllerRef.current?.abort();
      const controller = new AbortController();
      activeControllerRef.current = controller;
      const seq = ++requestSeqRef.current;

      fetch(`/api/species/${speciesKey}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data: { vernacularName?: string | null }) => {
          if (controller.signal.aborted || seq !== requestSeqRef.current) return;
          fetchedKeysRef.current.add(occKey);
          const name = typeof data?.vernacularName === 'string' ? data.vernacularName.trim() : '';
          onEnglishNameLoaded(occKey, name || null);
        })
        .catch(() => {
          if (!controller.signal.aborted && seq === requestSeqRef.current) {
            fetchedKeysRef.current.add(occKey);
            onEnglishNameLoaded(occKey, null);
          }
        });
    },
    [onEnglishNameLoaded]
  );

  useEffect(() => {
    if (occurrenceKey != null && taxonKey != null) load(occurrenceKey, taxonKey);
  }, [occurrenceKey, taxonKey, load]);

  useEffect(() => {
    const viewer = cesium?.viewer;
    if (viewer?.selectedEntityChanged == null) return;
    const remove = viewer.selectedEntityChanged.addEventListener((entity: Cesium.Entity | undefined) => {
      if (entity == null || entity.id === SELECTED_INFO_ENTITY_ID) return;
      load(Number(entity.id), Number(entity.id));
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

/**
 * Cesium InfoBox injects description HTML into a sandboxed iframe. Parent-page listeners on
 * the iframe document/body receive clicks (inline scripts are blocked). Cesium only rewrites
 * the description div's innerHTML after the first load — body listeners survive entity changes.
 */
export function InfoBoxLinkFix() {
  const cesium = useCesium();
  useEffect(() => {
    const viewer = cesium?.viewer;
    if (!viewer) return;

    let cancelled = false;
    let rafId = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let detachFrame: (() => void) | undefined;

    const attachToFrame = (frame: HTMLIFrameElement) => {
      let lastPhotoOpenAt = 0;
      let lastSaveAt = 0;
      let boundRoot: Document | HTMLElement | null = null;

      const openPhoto = (photo: Element): boolean => {
        const now = Date.now();
        if (now - lastPhotoOpenAt < 450) return false;
        if (!dispatchLightboxFromPhoto(photo)) return false;
        lastPhotoOpenAt = now;
        return true;
      };

      const saveOccurrence = (button: Element): boolean => {
        const now = Date.now();
        if (now - lastSaveAt < 450) return false;
        if (!dispatchSaveFromButton(button)) return false;
        lastSaveAt = now;
        return true;
      };

      const handleInteractiveEvent = (e: Event) => {
        const target = eventTargetElement(e.target);
        if (!target) return;
        const { photo, saveBtn, link } = findInfoBoxInteractiveTarget(target);
        if (photo) {
          e.preventDefault();
          e.stopPropagation();
          openPhoto(photo);
          return;
        }
        if (saveBtn) {
          e.preventDefault();
          e.stopPropagation();
          saveOccurrence(saveBtn);
          return;
        }
        // Links: only on click (touch synthesizes click; avoid double-open).
        if (e.type === 'click' && link?.href) {
          e.preventDefault();
          e.stopPropagation();
          try {
            (window.top ?? window).open(link.href, '_blank', 'noopener,noreferrer');
          } catch {
            window.open(link.href, '_blank', 'noopener,noreferrer');
          }
        }
      };

      const unbind = () => {
        if (!boundRoot) return;
        boundRoot.removeEventListener('click', handleInteractiveEvent, true);
        boundRoot.removeEventListener('touchend', handleInteractiveEvent, true);
        boundRoot = null;
      };

      const bindRoot = (root: Document | HTMLElement) => {
        if (boundRoot === root) return;
        unbind();
        boundRoot = root;
        // Capture phase so we run even if something inside the description stops bubbling.
        root.addEventListener('click', handleInteractiveEvent, true);
        // iOS / some WebViews skip a reliable click inside sandboxed iframes.
        root.addEventListener('touchend', handleInteractiveEvent, { capture: true, passive: false });
      };

      const tryBind = (): boolean => {
        let doc: Document | null = null;
        try {
          doc = frame.contentDocument;
        } catch {
          return false;
        }
        if (!doc?.body) return false;
        // Prefer body (Cesium's recommended target); fall back to document.
        bindRoot(doc.body);
        return true;
      };

      const onLoad = () => {
        tryBind();
      };

      frame.addEventListener('load', onLoad);
      // Cesium sets src=about:blank after registering its own load handler. If that load already
      // fired before we attached, bind immediately; otherwise wait for load.
      if (!tryBind()) {
        // Frame exists but document not ready yet — retry briefly.
        let attempts = 0;
        const poll = () => {
          if (cancelled) return;
          if (tryBind() || attempts++ > 60) return;
          retryTimer = setTimeout(poll, 50);
        };
        poll();
      }

      return () => {
        frame.removeEventListener('load', onLoad);
        if (retryTimer) clearTimeout(retryTimer);
        unbind();
      };
    };

    const tryAttach = () => {
      if (cancelled) return;
      const frame = viewer.infoBox?.frame;
      if (!(frame instanceof HTMLIFrameElement)) {
        rafId = requestAnimationFrame(tryAttach);
        return;
      }
      detachFrame?.();
      detachFrame = attachToFrame(frame);
    };

    tryAttach();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (retryTimer) clearTimeout(retryTimer);
      detachFrame?.();
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

