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
    viewer.scene.requestRender();
    let frames = 0;
    const onPostRender = () => {
      frames += 1;
      if (frames >= frameCount) {
        viewer.scene.postRender.removeEventListener(onPostRender);
        resolve();
      }
    };
    viewer.scene.postRender.addEventListener(onPostRender);
  });
}
