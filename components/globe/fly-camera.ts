import * as Cesium from 'cesium';

export interface GlobeFlyAxes {
  forward: Cesium.Cartesian3;
  right: Cesium.Cartesian3;
  up: Cesium.Cartesian3;
}

/**
 * Local tangent-plane axes for globe fly mode.
 * Forward/right stay horizontal (parallel to the ground) so W/A/S/D don't feel like zoom.
 */
export function computeGlobeFlyAxes(
  camera: Cesium.Camera,
  ellipsoid: Cesium.Ellipsoid = Cesium.Ellipsoid.WGS84
): GlobeFlyAxes {
  const scratchForward = new Cesium.Cartesian3();
  const scratchUp = new Cesium.Cartesian3();
  const scratchRight = new Cesium.Cartesian3();
  const scratchScaled = new Cesium.Cartesian3();
  const scratchEast = new Cesium.Cartesian3();
  const scratchNorth = new Cesium.Cartesian3();

  const up = ellipsoid.geodeticSurfaceNormal(camera.position, scratchUp);

  const dot = Cesium.Cartesian3.dot(camera.direction, up);
  Cesium.Cartesian3.multiplyByScalar(up, dot, scratchScaled);
  let forward = Cesium.Cartesian3.subtract(camera.direction, scratchScaled, scratchForward);

  if (Cesium.Cartesian3.magnitudeSquared(forward) < Cesium.Math.EPSILON10) {
    const transform = Cesium.Transforms.eastNorthUpToFixedFrame(
      camera.position,
      ellipsoid,
      new Cesium.Matrix4()
    );
    const rotation = Cesium.Matrix4.getMatrix3(transform, new Cesium.Matrix3());
    const east = Cesium.Matrix3.getColumn(rotation, 0, scratchEast);
    const north = Cesium.Matrix3.getColumn(rotation, 1, scratchNorth);
    const heading = camera.heading;
    forward = Cesium.Cartesian3.add(
      Cesium.Cartesian3.multiplyByScalar(east, Math.sin(heading), new Cesium.Cartesian3()),
      Cesium.Cartesian3.multiplyByScalar(north, Math.cos(heading), scratchForward),
      scratchForward
    );
  } else {
    Cesium.Cartesian3.normalize(forward, forward);
  }

  const right = Cesium.Cartesian3.cross(forward, up, scratchRight);
  Cesium.Cartesian3.normalize(right, right);
  Cesium.Cartesian3.cross(up, right, forward);
  Cesium.Cartesian3.normalize(forward, forward);

  return { forward, right, up };
}
