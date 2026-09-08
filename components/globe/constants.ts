/** Shared Cesium globe event names and rendering thresholds. */
import type { ContextOptions } from 'cesium';
import type { Bounds } from '@/lib/geometry';

/** InfoBox iframe → React: save/unsave occurrence. */
export const SAVE_OCCURRENCE_EVENT = 'gbif-globe-save-occurrence';
/** InfoBox iframe → React: open photo lightbox. */
export const LIGHTBOX_EVENT = 'gbif-globe-lightbox';

export type ExportScope = 'full' | 'region';

export interface ExportRegionDetail {
  scope: ExportScope;
  bounds?: Bounds;
  polygon?: [number, number][];
  /** When set, reframes the camera top-down over these bounds before capture. */
  frameBounds?: Bounds;
}

export const LIGHTBOX_PHOTO_CLASS = 'gbif-globe-infobox-photo';
export const SAVE_BUTTON_CLASS = 'gbif-infobox-save-button';

export const SELECTED_INFO_ENTITY_ID = 'selected-occurrence-info';

/** How often we report camera bounds while the user is interacting (ms). */
export const BOUNDS_REPORT_THROTTLE_MS = 400;

/**
 * Stable context options so Resium does not recreate the Viewer on every render.
 * Capture runs inside `postRender` instead of relying on `preserveDrawingBuffer`.
 */
export const VIEWER_CONTEXT_OPTIONS: ContextOptions = {
  webgl: {},
};
