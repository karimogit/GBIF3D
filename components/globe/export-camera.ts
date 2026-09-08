import * as Cesium from 'cesium';
import type { Bounds } from '@/lib/geometry';

export interface SavedCameraState {
  position: Cesium.Cartesian3;
  direction: Cesium.Cartesian3;
  up: Cesium.Cartesian3;
}

export function saveCameraState(viewer: Cesium.Viewer): SavedCameraState {
  const cam = viewer.camera;
  return {
    position: cam.position.clone(),
    direction: cam.direction.clone(),
    up: cam.up.clone(),
  };
}

export function restoreCameraState(viewer: Cesium.Viewer, state: SavedCameraState): void {
  viewer.camera.setView({
    destination: state.position,
    orientation: {
      direction: state.direction,
      up: state.up,
    },
  });
}

/** Animate camera heading/roll to north-up; keep position and pitch. */
export function resetCameraNorth(viewer: Cesium.Viewer, duration = 0.6): void {
  const camera = viewer.camera;
  camera.flyTo({
    destination: camera.positionWC.clone(),
    orientation: {
      heading: 0,
      pitch: camera.pitch,
      roll: 0,
    },
    duration,
  });
}

/** Fly to Cesium's default whole-Earth home view. */
export function resetCameraHome(viewer: Cesium.Viewer, duration = 1.2): void {
  viewer.camera.flyHome(duration);
}

/** Frame the map with a straight top-down view over the given bounds (for export snapshots). */
export function setTopDownExportView(viewer: Cesium.Viewer, bounds: Bounds): void {
  const rectangle = Cesium.Rectangle.fromDegrees(bounds.west, bounds.south, bounds.east, bounds.north);
  const is2D = viewer.scene.mode === Cesium.SceneMode.SCENE2D;
  if (is2D) {
    viewer.camera.setView({ destination: rectangle });
  } else {
    viewer.camera.setView({
      destination: rectangle,
      orientation: {
        heading: 0,
        pitch: -Cesium.Math.PI_OVER_TWO,
        roll: 0,
      },
    });
  }
  viewer.scene.requestRender();
}

/** Wait until the scene has rendered after a camera move. */
export function waitForSceneRender(viewer: Cesium.Viewer, frameCount = 2): Promise<void> {
  return new Promise((resolve) => {
    let frames = 0;
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      try {
        viewer.scene.postRender.removeEventListener(onPostRender);
      } catch {
        // viewer may be destroyed
      }
    };
    const onPostRender = () => {
      frames += 1;
      if (frames >= frameCount) {
        cleanup();
        resolve();
      }
    };
    try {
      viewer.scene.postRender.addEventListener(onPostRender);
      viewer.scene.requestRender();
    } catch {
      cleanup();
      resolve();
    }
  });
}

/**
 * Wait until globe tiles have finished loading (or timeout), then wait for a couple of
 * postRender frames so the scene is ready for capture.
 */
export function waitForTilesLoaded(viewer: Cesium.Viewer, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      try {
        viewer.scene.globe.tileLoadProgressEvent.removeEventListener(onProgress);
      } catch {
        // viewer may be destroyed
      }
      void waitForSceneRender(viewer).then(resolve);
    };

    const onProgress = (remaining: number) => {
      if (remaining === 0) finish();
    };

    const timeoutId = setTimeout(finish, timeoutMs);

    try {
      viewer.scene.globe.tileLoadProgressEvent.addEventListener(onProgress);
      // Already idle (no outstanding tile requests).
      if (viewer.scene.globe.tilesLoaded) {
        finish();
      } else {
        viewer.scene.requestRender();
      }
    } catch {
      finish();
    }
  });
}
