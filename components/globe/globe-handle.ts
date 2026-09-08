import type { ExportRegionDetail } from './constants';

/** Imperative API for map export and draw-finish, exposed via onGlobeHandle. */
export interface GlobeSceneHandle {
  exportImage(detail?: ExportRegionDetail): void;
  capturePdfSnapshot(detail?: ExportRegionDetail): Promise<string | null>;
  finishDrawing(): void;
}
