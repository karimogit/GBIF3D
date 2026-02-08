'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Viewer, Entity, PointGraphics, useCesium } from 'resium';
import * as Cesium from 'cesium';
import type { GBIFOccurrence } from '@/types/gbif';
import type { Bounds } from '@/lib/geometry';
import { rectangleToBounds } from '@/lib/geometry';

/** Base map imagery (no Cesium Ion token required).
 *  IMPORTANT: We lazily construct this on the client to avoid running Cesium
 *  constructors during Next.js server-side prerender (which can fail in Node).
 */
let defaultImageryProvider: Cesium.ImageryProvider | undefined;

function getDefaultImageryProvider(): Cesium.ImageryProvider | undefined {
  if (typeof window === 'undefined') return undefined;
  if (!defaultImageryProvider) {
    defaultImageryProvider = new Cesium.OpenStreetMapImageryProvider({
      url: 'https://tile.openstreetmap.org/',
    });
  }
  return defaultImageryProvider;
}

/** Base map types for View menu (Cesium Ion/Bing, OSM, CartoDB, OpenTopoMap) */
export type BaseMapType =
  | 'bing-aerial'
  | 'bing-aerial-labels'
  | 'bing-road'
  | 'osm'
  | 'positron'
  | 'dark-matter'
  | 'opentopomap';

function createImageryProvider(type: BaseMapType): Cesium.ImageryProvider {
  switch (type) {
    case 'positron':
      return new Cesium.UrlTemplateImageryProvider({
        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        subdomains: ['a', 'b', 'c', 'd'],
        credit: 'Map tiles by CartoDB, under CC BY 3.0. Data by OpenStreetMap, under ODbL.',
      });
    case 'dark-matter':
      return new Cesium.UrlTemplateImageryProvider({
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        subdomains: ['a', 'b', 'c', 'd'],
        credit: 'Map tiles by CartoDB, under CC BY 3.0. Data by OpenStreetMap, under ODbL.',
      });
    case 'opentopomap':
      return new Cesium.UrlTemplateImageryProvider({
        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        subdomains: ['a', 'b', 'c'],
        credit: 'Map tiles: © OpenTopoMap (CC-BY-SA)',
      });
    case 'bing-aerial':
    case 'bing-aerial-labels':
    case 'bing-road':
    case 'osm':
    default:
      return new Cesium.OpenStreetMapImageryProvider({
        url: 'https://tile.openstreetmap.org/',
      });
  }
}

function getIonImageryStyle(type: BaseMapType): Cesium.IonWorldImageryStyle | null {
  switch (type) {
    case 'bing-aerial':
      return Cesium.IonWorldImageryStyle.AERIAL;
    case 'bing-aerial-labels':
      return Cesium.IonWorldImageryStyle.AERIAL_WITH_LABELS;
    case 'bing-road':
      return Cesium.IonWorldImageryStyle.ROAD;
    default:
      return null;
  }
}

/** Stable context options so Resium does not recreate the Viewer on every render */
const VIEWER_CONTEXT_OPTIONS: { preserveDrawingBuffer: boolean } = {
  preserveDrawingBuffer: true,
};

/** Scale dots by camera distance: larger when close, smaller when far (min 0.5 so they stay visible). */
let occurrencePointScaleByDistance: Cesium.NearFarScalar | undefined;
function getOccurrencePointScaleByDistance(): Cesium.NearFarScalar {
  if (!occurrencePointScaleByDistance) {
    occurrencePointScaleByDistance = new Cesium.NearFarScalar(2e2, 1.6, 1e7, 0.5);
  }
  return occurrencePointScaleByDistance;
}

/** IUCN category → CSS color (no Cesium usage at module load, to stay SSR-safe). */
const IUCN_COLORS: Record<string, string> = {
  EX: '#000000',
  EW: '#8B0000',
  CR: '#FF0000',
  EN: '#FF9800',
  VU: '#F9A825',
  NT: '#FBC02D',
  LC: '#2E7D32',
  DD: '#757575',
  NA: '#BDBDBD',
};

/** IUCN category code → full label for display in species/occurrence box. */
const IUCN_LABELS: Record<string, string> = {
  EX: 'Extinct',
  EW: 'Extinct in the Wild',
  CR: 'Critically Endangered',
  EN: 'Endangered',
  VU: 'Vulnerable',
  NT: 'Near Threatened',
  LC: 'Least Concern',
  DD: 'Data Deficient',
  NA: 'Not Assessed',
};

function formatIucnStatus(code: string): string {
  if (!code) return '';
  const upper = code.toUpperCase();
  const label = IUCN_LABELS[upper];
  return label ? `${upper} (${label})` : code;
}

const LIGHTBOX_PHOTO_CLASS = 'gbif-globe-infobox-photo';

function toFullSizeUrl(thumbUrl: string): string {
  return thumbUrl.replace('/200x/', '/800x/');
}

function formatCoord(value: number, type: 'lat' | 'lon'): string {
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const min = (abs - deg) * 60;
  const dir = type === 'lat' ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  return `${deg}°${min.toFixed(2)}′${dir}`;
}

export const SAVE_OCCURRENCE_EVENT = 'gbif-globe-save-occurrence';
const SAVE_BUTTON_CLASS = 'gbif-infobox-save-button';

function occurrenceToDescription(
  occ: GBIFOccurrence,
  imageUrls?: string[] | null,
  savedKeys?: Set<number>
): string {
  const sci = occ.scientificName?.trim() || '';
  const vern = occ.vernacularName?.trim() || '';
  const name =
    vern && sci
      ? `${vern} (${sci})`
      : sci || vern || 'Unknown species';
  const date = occ.eventDate || (occ.year ? String(occ.year) : '—');
  const loc = occ.locality || occ.countryCode || '—';
  const url = `https://www.gbif.org/occurrence/${occ.key}`;
  const validUrls = (imageUrls ?? []).filter((u) => typeof u === 'string' && /^https:\/\//.test(u)).slice(0, 4);
  const fullUrls = validUrls.map(toFullSizeUrl);
  const photoBox =
    validUrls.length > 0
      ? `<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 10px; width: 100%; max-width: 228px;">
${validUrls
  .map(
    (u, i) =>
      `<img class="${LIGHTBOX_PHOTO_CLASS}" src="${escapeHtml(u)}" data-fullurl="${escapeHtml(toFullSizeUrl(u))}" data-allurls="${escapeHtml(JSON.stringify(fullUrls))}" data-index="${i}" alt="" style="width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 8px; cursor: pointer;" loading="lazy" />`
  )
  .join('\n')}
</div>`
      : '';

  const lat = occ.decimalLatitude;
  const lon = occ.decimalLongitude;
  const coords =
    lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)
      ? `${formatCoord(lat, 'lat')}, ${formatCoord(lon, 'lon')} (${lat.toFixed(5)}, ${lon.toFixed(5)})`
      : '—';

  const taxonomy: string[] = [];
  if (occ.kingdom) taxonomy.push(occ.kingdom);
  if (occ.phylum) taxonomy.push(occ.phylum);
  if (occ.class) taxonomy.push(occ.class);
  if (occ.order) taxonomy.push(occ.order);
  if (occ.family) taxonomy.push(occ.family);
  if (occ.genus) taxonomy.push(occ.genus);
  if (occ.species) taxonomy.push(occ.species);
  if (occ.infraspecificEpithet) taxonomy.push(occ.infraspecificEpithet);
  const taxonomyLine = taxonomy.length ? taxonomy.join(' › ') : '';

  const line = (label: string, value: string) =>
    value ? `<strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}<br/>` : '';
  const basis = occ.basisOfRecord
    ? occ.basisOfRecord.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : '';
  const country = occ.countryCode || '';
  const recordedBy = occ.recordedBy?.trim() || '';
  const institution = occ.institutionCode?.trim() || '';
  const dataset = occ.datasetName?.trim() || '';
  const iucnRaw = occ.iucnRedListCategory?.trim() || '';
  const iucn = formatIucnStatus(iucnRaw);
  const rank = occ.taxonRank?.trim() || '';

  return `
    <div style="font-family: system-ui; max-width: 400px; min-width: 280px; font-size: 13px; line-height: 1.45;">
      ${photoBox}
      <strong style="display: block; word-break: break-word;">${escapeHtml(name)}</strong>
      ${rank ? ` <span style="color: #666; font-weight: normal;">(${escapeHtml(rank)})</span>` : ''}<br/>
      ${line('Date', date)}
      ${line('Location', loc)}
      ${line('Coordinates', coords)}
      ${taxonomyLine ? `<div style="margin-top: 4px;"><strong>Taxonomy:</strong> <span style="display: block; word-break: break-word; overflow-wrap: break-word;">${escapeHtml(taxonomyLine)}</span></div>` : ''}
      ${line('Basis of record', basis)}
      ${country && !loc.includes(country) ? line('Country', country) : ''}
      ${line('Recorded by', recordedBy)}
      ${line('Institution', institution)}
      ${line('Dataset', dataset)}
      ${line('IUCN status', iucn)}
      <div style="margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="gbif-infobox-view-button" style="display: inline-block; padding: 8px 14px; background: #4caf50; color: #fff; border-radius: 6px; text-decoration: none; font-weight: 500; font-size: 14px;">View on GBIF →</a>
        <a href="#" class="${SAVE_BUTTON_CLASS}" data-key="${occ.key}" data-action="${savedKeys?.has(occ.key) ? 'remove' : 'add'}" style="display: inline-block; padding: 8px 14px; background: ${savedKeys?.has(occ.key) ? 'rgba(76, 175, 80, 0.3)' : 'rgba(255,255,255,0.15)'}; color: ${savedKeys?.has(occ.key) ? '#2e7d32' : 'rgba(255,255,255,0.9)'}; border: 1px solid rgba(255,255,255,0.3); border-radius: 6px; text-decoration: none; font-weight: 500; font-size: 14px;">${savedKeys?.has(occ.key) ? 'Saved ✓' : 'Save'}</a>
      </div>
    </div>
  `;
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function colorForOccurrence(occ: GBIFOccurrence): Cesium.Color {
  const cat = occ.iucnRedListCategory?.toUpperCase();
  if (cat && IUCN_COLORS[cat]) {
    return Cesium.Color.fromCssColorString(IUCN_COLORS[cat]);
  }
  return Cesium.Color.fromCssColorString('#4caf50');
}

const EXPORT_IMAGE_EVENT = 'gbif-globe-export-image';
export const EXPORT_PDF_EVENT = 'gbif-globe-export-pdf';
export const EXPORT_PDF_CANVAS_READY_EVENT = 'gbif-globe-export-pdf-canvas-ready';

function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob(
    (blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);
    },
    'image/png'
  );
}

/** Capture canvas as JPEG data URL for PDF embed. */
function captureCanvasAsDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/jpeg', 0.85);
}

/** Small UI button (top-right) to reset camera to the default Cesium home view. */
function ResetViewButton() {
  const cesium = useCesium();
  return (
    <div
      style={{
        position: 'absolute',
        top: 10,
        right: 56, // just to the left of the fullscreen button
        zIndex: 1001,
        pointerEvents: 'auto',
      }}
    >
      <button
        type="button"
        aria-label="Reset view"
        title="Reset view"
        onClick={() => {
          try {
            const v = cesium?.viewer;
            if (!v || !v.scene?.canvas || !v.camera) return;
            v.camera.flyHome(1.2);
          } catch {
            // ignore if viewer is not ready
          }
        }}
        style={{
          width: 32,
          height: 32,
          borderRadius: 4,
          border: 'none',
          background: 'rgba(0,0,0,0.55)',
          color: '#fff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          lineHeight: 1,
        }}
      >
        ⟳
      </button>
    </div>
  );
}

/** Constrains how far the camera can tilt in 3D so angles stay readable. */
function CameraTiltConstraints({ sceneMode }: { sceneMode: SceneModeType }) {
  const cesium = useCesium();
  useEffect(() => {
    const viewer = cesium?.viewer;
    const controller = viewer?.scene?.screenSpaceCameraController;
    if (!controller) return;
    // In 3D, limit extreme grazing angles; in 2D/Columbus, use Cesium default.
    if (sceneMode === '3D') {
      controller.maximumTiltAngle = Cesium.Math.toRadians(70); // a bit shallower than horizon
    } else {
      controller.maximumTiltAngle = Cesium.Math.PI_OVER_TWO;
    }
  }, [cesium?.viewer, sceneMode]);
  return null;
}

/** Reports the camera tilt angle (pitch) so we can hide dots when viewing from an angle. */
function CameraTiltReporter({ onTiltChange }: { onTiltChange: (tiltRadians: number) => void }) {
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
function OccurrenceImageLoader({
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
    const remove = viewer.selectedEntityChanged.addEventListener((entity: Cesium.Entity | undefined) => {
      if (cancelled) return;
      const key = entity?.id != null ? Number(entity.id) : NaN;
      if (!Number.isInteger(key) || key < 1) {
        return;
      }
      fetch(`/api/occurrence/${key}/image`)
        .then((res) => res.json())
        .then((data: { urls?: string[] }) => {
          if (!cancelled && Array.isArray(data?.urls)) onImageLoaded(key, data.urls);
        })
        .catch(() => {
          if (!cancelled) onImageLoaded(key, []);
        });
    });
    return () => {
      cancelled = true;
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
function ExportImageHandler() {
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
function ExportPdfCanvasHandler() {
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

const LIGHTBOX_EVENT = 'gbif-globe-lightbox';

/** Ensures links in the InfoBox popup open correctly (sandboxed iframe can block them). Handles photo click for lightbox. */
function InfoBoxLinkFix() {
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

// How often we report camera bounds while the user is interacting (ms).
// Lower = more responsive \"Current view\" updates; balanced against API debounce.
const BOUNDS_REPORT_THROTTLE_MS = 400;

function CameraBoundsReporter({ onBoundsChange }: { onBoundsChange: (b: Bounds) => void }) {
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

function FlyToBounds({ bounds }: { bounds: Bounds }) {
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
function SelectOccurrence({
  occurrenceKey,
  occurrences,
  usePrimitiveMode,
}: {
  occurrenceKey: number | null;
  occurrences: GBIFOccurrence[];
  usePrimitiveMode: boolean;
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
    if (!occ || occ.decimalLatitude == null || occ.decimalLongitude == null) return;

    const position = Cesium.Cartesian3.fromDegrees(
      occ.decimalLongitude,
      occ.decimalLatitude,
      0
    );

    if (usePrimitiveMode) {
      const infoEntity = viewer.entities.getById(SELECTED_INFO_ENTITY_ID);
      try {
        viewer.camera.flyTo({
          destination: position,
          duration: 1.2,
          complete: () => {
            try {
              if (infoEntity) viewer.selectedEntity = infoEntity;
            } catch {
              // viewer may be destroyed
            }
          },
        });
      } catch {
        // viewer may be destroyed
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
        }
        return;
      }
      try {
        viewer.camera.flyTo({
          destination: position,
          duration: 1.2,
          complete: () => {
            if (cancelled) return;
            try {
              viewer.selectedEntity = entity;
            } catch {
              // viewer may be destroyed
            }
          },
        });
      } catch {
        // viewer may be destroyed
      }
    };

    findAndSelectEntity();

    return () => {
      cancelled = true;
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, [cesium?.viewer, occurrenceKey, occurrences, usePrimitiveMode]);
  return null;
}

/** Applies scene mode from top bar (3D / 2D / Columbus) to the Cesium viewer. */
function SceneModeSync({ sceneMode }: { sceneMode: SceneModeType }) {
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
        case 'Columbus':
          mode = Cesium.SceneMode.COLUMBUS_VIEW;
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
function BaseMapSync({ baseMap }: { baseMap: BaseMapType }) {
  const cesium = useCesium();
  useEffect(() => {
    const viewer = cesium?.viewer;
    if (viewer?.scene?.imageryLayers == null) return;

    const layers = viewer.scene.imageryLayers;
    const base = layers.get(0);
    if (!base) return;

    const ionStyle = getIonImageryStyle(baseMap);
    if (ionStyle != null) {
      let cancelled = false;
      layers.remove(base, true);
      Cesium.createWorldImageryAsync({ style: ionStyle })
        .then((provider) => {
          if (!cancelled) layers.addImageryProvider(provider, 0);
        })
        .catch(() => {
          if (!cancelled) {
            layers.addImageryProvider(createImageryProvider('osm'), 0);
          }
        });
      return () => {
        cancelled = true;
      };
    }

    try {
      layers.remove(base, true);
      layers.addImageryProvider(createImageryProvider(baseMap), 0);
    } catch {
      // viewer may be destroyed
    }
  }, [cesium?.viewer, baseMap]);
  return null;
}

/** Optional Google Photorealistic 3D Tiles overlay (Cesium Ion). */
function Photorealistic3DSync({ enabled }: { enabled: boolean }) {
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
    createGooglePhotorealistic3DTileset()
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
function EnvironmentalOverlaySync({ layer }: { layer: 'none' | 'landcover' }) {
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
function DrawnRegionOverlay({ bounds }: { bounds: Bounds }) {
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
function DrawRegionHandler({
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

export type SceneModeType = '3D' | '2D' | 'Columbus';

/** Above this count we use PointPrimitiveCollection instead of one Entity per occurrence to avoid browser freeze. */
const MAX_OCCURRENCES_FOR_ENTITIES = 6000;

/** Renders many occurrences as a single Cesium PointPrimitiveCollection (efficient for 10k–100k+ points). */
function OccurrencePointsPrimitive({
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

/** When using primitive rendering, we use one Entity for the info box; this syncs its position/description and selection. */
const SELECTED_INFO_ENTITY_ID = 'selected-occurrence-info';

function SelectedOccurrenceInfoSync({
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

interface GlobeSceneProps {
  occurrences: GBIFOccurrence[];
  onBoundsChange: (bounds: Bounds) => void;
  /** When set, fly camera to this region */
  flyToBounds?: Bounds | null;
  /** When true, two clicks on the globe define a rectangle and call onDrawnBounds */
  drawRegionMode?: boolean;
  onDrawnBounds?: (bounds: Bounds) => void;
  /** When set, show this rectangle on the globe */
  drawnBounds?: Bounds | null;
  /** Scene mode: 3D globe, 2D map, or Columbus view (controlled from top bar) */
  sceneMode?: SceneModeType;
  /** Base map / imagery style (controlled from View menu) */
  baseMap?: BaseMapType;
  /** Optional environmental overlay (Tools: land cover / relief) */
  environmentalLayer?: 'none' | 'landcover';
  /** When true, add Google Photorealistic 3D Tiles overlay (Cesium Ion). */
  photorealistic3D?: boolean;
  loading?: boolean;
  error?: string | null;
  /** Keys of occurrences the user has saved (for "Saved ✓" in info box). */
  savedOccurrenceKeys?: Set<number>;
  /** When set, select this occurrence (opens info box and flies to it). */
  selectedOccurrenceKey?: number | null;
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
}: GlobeSceneProps) {
  const [cameraTilt, setCameraTilt] = useState(0); // Camera pitch in radians
  const [terrain, setTerrain] = useState<Cesium.TerrainProvider | null>(null);
  const [imageUrlsByKey, setImageUrlsByKey] = useState<Record<number, string[]>>({});
  const [pickedOccurrenceKey, setPickedOccurrenceKey] = useState<number | null>(null);

  const usePrimitiveMode = occurrences.length > MAX_OCCURRENCES_FOR_ENTITIES;
  const displayedOccurrenceKey =
    selectedOccurrenceKey ?? pickedOccurrenceKey;

  const handleOccurrenceImageLoaded = useCallback((occurrenceKey: number, urls: string[]) => {
    if (urls.length > 0) setImageUrlsByKey((prev) => ({ ...prev, [occurrenceKey]: urls }));
  }, []);

  const handlePickedKey = useCallback((key: number) => {
    setPickedOccurrenceKey(key);
  }, []);

  // Set Cesium Ion token from env (e.g. Vercel: NEXT_PUBLIC_CESIUM_ION_TOKEN) before any Ion requests
  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
    if (token && typeof Cesium !== 'undefined' && Cesium.Ion) {
      Cesium.Ion.defaultAccessToken = token;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    Cesium.createWorldTerrainAsync().then((t) => {
      if (!cancelled) setTerrain(t);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Viewer
      full
      timeline={false}
      animation={false}
      baseLayerPicker
      geocoder={false}
      homeButton={false}
      sceneModePicker={false}
      navigationHelpButton={false}
      fullscreenButton
      vrButton={false}
      scene3DOnly={false}
      requestRenderMode={false}
      terrainProvider={terrain ?? undefined}
      imageryProvider={getDefaultImageryProvider()}
      contextOptions={VIEWER_CONTEXT_OPTIONS}
    >
      <ResetViewButton />
      <CameraTiltConstraints sceneMode={sceneMode} />
      <CameraTiltReporter onTiltChange={setCameraTilt} />
      <SceneModeSync sceneMode={sceneMode} />
      <BaseMapSync baseMap={baseMap} />
      <EnvironmentalOverlaySync layer={environmentalLayer} />
      <Photorealistic3DSync enabled={photorealistic3D} />
      <OccurrenceImageLoader onImageLoaded={handleOccurrenceImageLoaded} />
      <ExportImageHandler />
      <ExportPdfCanvasHandler />
      <InfoBoxLinkFix />
      <CameraBoundsReporter onBoundsChange={onBoundsChange} />
      {flyToBounds && <FlyToBounds bounds={flyToBounds} />}
      {selectedOccurrenceKey != null && (
        <SelectOccurrence
          occurrenceKey={selectedOccurrenceKey}
          occurrences={occurrences}
          usePrimitiveMode={usePrimitiveMode}
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
        occurrences
          .filter(
            (o) =>
              o.decimalLatitude != null &&
              o.decimalLongitude != null &&
              Number.isFinite(o.decimalLatitude) &&
              Number.isFinite(o.decimalLongitude)
          )
          .map((occ) => {
            const isSelected =
              selectedOccurrenceKey != null && occ.key === selectedOccurrenceKey;
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
          })
      )}
    </Viewer>
  );
}
