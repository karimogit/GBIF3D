/** Shared Cesium globe event names and rendering thresholds. */

export const SAVE_OCCURRENCE_EVENT = 'gbif-globe-save-occurrence';
export const EXPORT_IMAGE_EVENT = 'gbif-globe-export-image';
export const EXPORT_PDF_EVENT = 'gbif-globe-export-pdf';
export const EXPORT_PDF_CANVAS_READY_EVENT = 'gbif-globe-export-pdf-canvas-ready';
export const FINISH_DRAW_EVENT = 'gbif-globe-finish-draw';

export type ExportScope = 'full' | 'region';

export interface ExportRegionDetail {
  scope: ExportScope;
  bounds?: { west: number; south: number; east: number; north: number };
  polygon?: [number, number][];
  /** When set, reframes the camera top-down over these bounds before capture. */
  frameBounds?: { west: number; south: number; east: number; north: number };
}
export const LIGHTBOX_EVENT = 'gbif-globe-lightbox';

export const LIGHTBOX_PHOTO_CLASS = 'gbif-globe-infobox-photo';
export const SAVE_BUTTON_CLASS = 'gbif-infobox-save-button';

export const SELECTED_INFO_ENTITY_ID = 'selected-occurrence-info';

/** Above this count we use PointPrimitiveCollection instead of one Entity per occurrence. */
export const MAX_OCCURRENCES_FOR_ENTITIES = 6000;

/** How often we report camera bounds while the user is interacting (ms). */
export const BOUNDS_REPORT_THROTTLE_MS = 400;

/** Stable context options so Resium does not recreate the Viewer on every render. */
export const VIEWER_CONTEXT_OPTIONS: { preserveDrawingBuffer: boolean } = {
  preserveDrawingBuffer: true,
};
