import * as Cesium from 'cesium';
import type { Bounds, LonLat } from '@/lib/geometry';
import {
  EXPORT_IMAGE_EVENT,
  EXPORT_PDF_CANVAS_READY_EVENT,
  EXPORT_PDF_EVENT,
  type ExportRegionDetail,
} from './constants';

export function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string) {
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

export function captureCanvasAsDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/jpeg', 0.85);
}

function geoToScreen(
  viewer: Cesium.Viewer,
  lon: number,
  lat: number
): Cesium.Cartesian2 | undefined {
  const cart = Cesium.Cartesian3.fromDegrees(lon, lat);
  return Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, cart) ?? undefined;
}

/** Crop the globe canvas to a drawn region (bounding box, optionally clipped to polygon). */
export function cropCanvasToRegion(
  canvas: HTMLCanvasElement,
  viewer: Cesium.Viewer,
  bounds: Bounds,
  polygon?: LonLat[]
): HTMLCanvasElement {
  const ring: LonLat[] =
    polygon && polygon.length >= 3
      ? polygon
      : [
          [bounds.west, bounds.south],
          [bounds.west, bounds.north],
          [bounds.east, bounds.north],
          [bounds.east, bounds.south],
        ];

  const screenPts = ring
    .map(([lon, lat]) => geoToScreen(viewer, lon, lat))
    .filter((p): p is Cesium.Cartesian2 => p != null);

  if (screenPts.length === 0) return canvas;

  const xs = screenPts.map((p) => p.x);
  const ys = screenPts.map((p) => p.y);
  const minX = Math.max(0, Math.floor(Math.min(...xs)));
  const minY = Math.max(0, Math.floor(Math.min(...ys)));
  const maxX = Math.min(canvas.width, Math.ceil(Math.max(...xs)));
  const maxY = Math.min(canvas.height, Math.ceil(Math.max(...ys)));
  const w = maxX - minX;
  const h = maxY - minY;
  if (w <= 0 || h <= 0) return canvas;

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  if (!ctx) return canvas;

  if (polygon && polygon.length >= 3) {
    const polyScreen = polygon
      .map(([lon, lat]) => geoToScreen(viewer, lon, lat))
      .filter((p): p is Cesium.Cartesian2 => p != null)
      .map((p) => ({ x: p.x - minX, y: p.y - minY }));
    if (polyScreen.length >= 3) {
      ctx.beginPath();
      ctx.moveTo(polyScreen[0].x, polyScreen[0].y);
      polyScreen.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.clip();
    }
  }

  ctx.drawImage(canvas, minX, minY, w, h, 0, 0, w, h);
  return out;
}

export function prepareCanvasForExport(
  canvas: HTMLCanvasElement,
  viewer: Cesium.Viewer,
  detail?: ExportRegionDetail
): HTMLCanvasElement {
  if (detail?.scope === 'region' && detail.bounds) {
    return cropCanvasToRegion(canvas, viewer, detail.bounds, detail.polygon);
  }
  return canvas;
}

export { EXPORT_IMAGE_EVENT, EXPORT_PDF_EVENT, EXPORT_PDF_CANVAS_READY_EVENT };
