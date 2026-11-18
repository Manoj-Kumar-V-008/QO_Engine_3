import * as Cesium from 'cesium';
import type { AntennaConfig } from '../types/engine';

/**
 * Centers the 3D Earth squarely in the open mission viewport so the entire globe,
 * polar orbits, European ground network, and atmospheric limb sit unobstructed.
 */
export function flyToHeroGlobe(viewer: Cesium.Viewer, duration = 1.4): void {
  viewer.trackedEntity = undefined;
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(12.0, 42.0, 1.55e7),
    orientation: {
      heading: Cesium.Math.toRadians(6),
      pitch: Cesium.Math.toRadians(-76),
      roll: 0,
    },
    easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
    duration,
  });
}

/**
 * Smooth programmatic zoom helper for UI zoom controls (+ / -) and trackpad convenience.
 */
export function zoomGlobeCamera(viewer: Cesium.Viewer, direction: 'in' | 'out'): void {
  const height = viewer.camera.positionCartographic.height;
  const amount = Math.max(80_000, height * 0.28);
  if (direction === 'in') {
    if (height > 60_000) {
      viewer.camera.zoomIn(Math.min(amount, height - 30_000));
    }
  } else {
    if (height < 38_000_000) {
      viewer.camera.zoomOut(amount);
    }
  }
}

/**
 * Locks the chase camera onto a Sentinel-2 spacecraft with an off-axis trailing vantage
 * showing the 3D spacecraft bus, asymmetric solar wing, nadir swath, and curved Earth horizon.
 */
export function trackSatelliteEntity(
  viewer: Cesium.Viewer,
  satEntity: Cesium.Entity
): void {
  satEntity.viewFrom = new Cesium.ConstantProperty(
    new Cesium.Cartesian3(-290_000, -560_000, 260_000)
  );
  viewer.trackedEntity = satEntity;
}

/**
 * Dramatic low-angle oblique framing looking across a ground station's parabolic dish
 * and concentric elevation horizon rings toward the orbital sky.
 */
export function flyToGroundStation(
  viewer: Cesium.Viewer,
  antenna: AntennaConfig,
  duration = 1.4
): void {
  viewer.trackedEntity = undefined;
  const latOffset = antenna.lat_deg > 70 ? -8.0 : -10.0;
  const lonOffset = -4.5;
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      antenna.lon_deg + lonOffset,
      Math.max(-84, antenna.lat_deg + latOffset),
      2.55e6
    ),
    orientation: {
      heading: Cesium.Math.toRadians(14),
      pitch: Cesium.Math.toRadians(-48),
      roll: 0,
    },
    easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
    duration,
  });
}

/**
 * Smooth globe slew to preview a newly staged What-If ground station region.
 */
export function flyToWhatIfRegion(
  viewer: Cesium.Viewer,
  latDeg: number,
  lonDeg: number,
  duration = 1.3
): void {
  viewer.trackedEntity = undefined;
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      lonDeg,
      Math.max(-82, Math.min(82, latDeg - 4)),
      1.25e7
    ),
    orientation: {
      heading: 0,
      pitch: Cesium.Math.toRadians(-86),
      roll: 0,
    },
    easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
    duration,
  });
}
