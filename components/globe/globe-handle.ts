import type { ExportRegionDetail } from './constants';

/** Imperative API for map export, draw-finish, and view reset, exposed via onGlobeHandle. */
export interface GlobeSceneHandle {
  exportImage(detail?: ExportRegionDetail): void;
  capturePdfSnapshot(detail?: ExportRegionDetail): Promise<string | null>;
  finishDrawing(): void;
  /** Animate heading/roll to north-up while keeping position and pitch. */
  resetNorth(): void;
  /** Fly back to Cesium's default whole-Earth home view. */
  resetHome(): void;
}
