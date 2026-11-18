import * as Cesium from 'cesium';
import type { AntennaConfig } from '../types/engine';
import { antennaCartesian, computeFootprintRadiusMeters } from '../lib/orbit';
import {
  ANT_COLORS,
  CUSTOM_ANT_COLOR,
  SENTINEL2_NOMINAL_ALT_KM,
  STAGED_ANT_COLOR,
  getAntCallsign,
} from './constants';
import { getStationReticleIcon } from './billboardBadges';
import { StationHorizonRadarMaterialProperty } from './shaders';
import { getGroundDishGlbUrl } from './proceduralModels';

export interface ActiveAntennaLinkTarget {
  satelliteId: string;
  satPosition: Cesium.Cartesian3;
}

export interface GroundStationLayerAccessor {
  getActiveTargetForAntenna: (
    antennaId: string,
    time: Cesium.JulianDate
  ) => ActiveAntennaLinkTarget | null;
}

export interface GroundStationLayerHandle {
  positions: Record<string, Cesium.Cartesian3>;
  dispose: () => void;
}

interface SlewingDishEntry {
  antennaId: string;
  model: Cesium.Model;
  invEnu: Cesium.Matrix4;
  currentAzRad: number;
  currentElRad: number;
  yokeNode: Cesium.ModelNode | null;
  dishNode: Cesium.ModelNode | null;
}

// Scratch math objects for zero-GC 60fps dish slewing
const scratchLocalVec = new Cesium.Cartesian3();
const scratchYokeTrs = new Cesium.TranslationRotationScale(
  new Cesium.Cartesian3(0, 3.8, 0),
  new Cesium.Quaternion(),
  new Cesium.Cartesian3(1, 1, 1)
);
const scratchDishTrs = new Cesium.TranslationRotationScale(
  new Cesium.Cartesian3(0, 2.0, 0),
  new Cesium.Quaternion(),
  new Cesium.Cartesian3(1, 1, 1)
);
const scratchAxisY = new Cesium.Cartesian3(0, 1, 0);
const scratchAxisZ = new Cesium.Cartesian3(0, 0, 1);
const scratchMat4 = new Cesium.Matrix4();

function shortestAngleDelta(fromRad: number, toRad: number): number {
  let diff = (toRad - fromRad) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

/**
 * Populates 3D articulated parabolic ground-station dishes that actively slew in Azimuth
 * and Elevation to track the linked Sentinel-2 satellite during every downlink pass,
 * plus GLSL concentric elevation contour rings (5 deg / 15 deg / 30 deg) with radar pulse lock.
 */
export function buildGroundStationLayer(
  viewer: Cesium.Viewer,
  appliedAntennas: AntennaConfig[],
  stagedAntennas: AntennaConfig[],
  accessor: GroundStationLayerAccessor
): GroundStationLayerHandle {
  const positions: Record<string, Cesium.Cartesian3> = {};
  const createdEntityIds: string[] = [];
  const dishEntries: SlewingDishEntry[] = [];
  const addedPrimitives: Cesium.Model[] = [];
  let disposed = false;

  const allDisplayAntennas: AntennaConfig[] = [
    ...appliedAntennas,
    ...stagedAntennas.filter(
      (st) => !appliedAntennas.some((existing) => existing.id === st.id)
    ),
  ];

  for (const ant of allDisplayAntennas) {
    const pos = antennaCartesian(ant);
    positions[ant.id] = pos;

    const isApplied = appliedAntennas.some((a) => a.id === ant.id);
    const cssColor = ANT_COLORS[ant.id] ?? (isApplied ? CUSTOM_ANT_COLOR : STAGED_ANT_COLOR);
    const color = Cesium.Color.fromCssColorString(cssColor);
    const callsign = getAntCallsign(ant.id, ant.name);

    const radius5 = computeFootprintRadiusMeters(ant.min_elevation_deg, SENTINEL2_NOMINAL_ALT_KM);
    const radius15 = computeFootprintRadiusMeters(15, SENTINEL2_NOMINAL_ALT_KM);
    const radius30 = computeFootprintRadiusMeters(30, SENTINEL2_NOMINAL_ALT_KM);
    const innerRatio30 = Math.min(0.8, Math.max(0.15, radius30 / radius5));
    const midRatio15 = Math.min(0.92, Math.max(innerRatio30 + 0.08, radius15 / radius5));

    // 1. Zero-emoji precision station marker & callout label
    const markerId = `ant-${ant.id}`;
    viewer.entities.add({
      id: markerId,
      name: `${callsign} // ${ant.name}`,
      position: pos,
      billboard: {
        image: getStationReticleIcon(cssColor, !isApplied),
        width: 24,
        height: 24,
        scaleByDistance: new Cesium.NearFarScalar(8.0e5, 0.0, 4.5e6, 1.0),
        translucencyByDistance: new Cesium.NearFarScalar(8.0e5, 0.0, 4.0e6, 0.92),
      },
      label: {
        text: isApplied
          ? `${callsign} // ${ant.name.toUpperCase()}`
          : `${callsign} // ${ant.name.toUpperCase()} [STAGED]`,
        font: '600 10px "JetBrains Mono", ui-monospace, monospace',
        fillColor: color,
        outlineColor: Cesium.Color.fromCssColorString('#020617'),
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('#050a14').withAlpha(0.76),
        backgroundPadding: new Cesium.Cartesian2(6, 3),
        pixelOffset: new Cesium.Cartesian2(0, 20),
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.TOP,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3.6e7),
        scaleByDistance: new Cesium.NearFarScalar(1.5e6, 1.0, 2.5e7, 0.8),
      },
    });
    createdEntityIds.push(markerId);

    // 2. Multi-Ring Concentric Elevation Contour & Acquisition Radar Pulse Ellipse
    const footprintId = `footprint-${ant.id}`;
    const radarMat = new StationHorizonRadarMaterialProperty({
      color: color.withAlpha(isApplied ? 0.68 : 0.55),
      innerRatio30,
      midRatio15,
      isLocked: (time) => accessor.getActiveTargetForAntenna(ant.id, time) !== null,
    });

    viewer.entities.add({
      id: footprintId,
      position: Cesium.Cartesian3.fromDegrees(ant.lon_deg, ant.lat_deg, 0),
      ellipse: {
        semiMajorAxis: radius5,
        semiMinorAxis: radius5,
        height: 2500,
        material: radarMat as unknown as Cesium.MaterialProperty,
      },
    });
    createdEntityIds.push(footprintId);

    // 3. Articulated 3D Parabolic Dish Model in local ENU frame
    const enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(pos);
    const invEnu = Cesium.Matrix4.inverseTransformation(enuMatrix, new Cesium.Matrix4());

    getGroundDishGlbUrl(cssColor)
      .then(async (glbUrl) => {
        if (disposed || viewer.isDestroyed()) return;
        const model = await Cesium.Model.fromGltfAsync({
          url: glbUrl,
          modelMatrix: enuMatrix,
          scale: 7500,
          minimumPixelSize: 44,
          maximumScale: 120000,
          allowPicking: false,
          shadows: Cesium.ShadowMode.DISABLED,
        });
        if (disposed || viewer.isDestroyed()) {
          model.destroy();
          return;
        }
        viewer.scene.primitives.add(model);
        addedPrimitives.push(model);

        const entry: SlewingDishEntry = {
          antennaId: ant.id,
          model,
          invEnu,
          currentAzRad: 0.35,
          currentElRad: Cesium.Math.toRadians(68), // Park facing slightly skyward when idle
          yokeNode: null,
          dishNode: null,
        };
        dishEntries.push(entry);

        model.readyEvent.addEventListener(() => {
          if (disposed || model.isDestroyed()) return;
          try {
            entry.yokeNode = model.getNode('azimuth_yoke') ?? null;
            entry.dishNode = model.getNode('elevation_dish') ?? null;
          } catch {
            entry.yokeNode = null;
            entry.dishNode = null;
          }
        });
      })
      .catch(() => {
        // Fallback cleanly to reticle billboard
      });
  }

  // Real-time 60fps dish slewing toward active satellite target in local ENU frame
  const removePreUpdate = viewer.scene.preUpdate.addEventListener((_scene, time) => {
    for (const entry of dishEntries) {
      if (!entry.yokeNode || !entry.dishNode || entry.model.isDestroyed()) continue;

      const target = accessor.getActiveTargetForAntenna(entry.antennaId, time);
      let desiredAz = 0.35;
      let desiredEl = Cesium.Math.toRadians(68);

      if (target) {
        // Convert ECEF satellite position into ground station's local ENU (x=East, y=North, z=Up)
        Cesium.Matrix4.multiplyByPoint(entry.invEnu, target.satPosition, scratchLocalVec);
        const horizDist = Math.hypot(scratchLocalVec.x, scratchLocalVec.y);
        // In glTF space: +X = East, -Z = North, +Y = Up.
        // Rotating azimuth_yoke around +Y turns local +X toward -Z (North) for positive angle!
        desiredAz = Math.atan2(scratchLocalVec.y, scratchLocalVec.x);
        desiredEl = Math.max(
          Cesium.Math.toRadians(5),
          Math.min(Math.PI * 0.5, Math.atan2(scratchLocalVec.z, Math.max(1, horizDist)))
        );
      }

      // Smooth damped slew (feels like a real heavy motorized parabolic dish!)
      entry.currentAzRad += shortestAngleDelta(entry.currentAzRad, desiredAz) * 0.14;
      entry.currentElRad += (desiredEl - entry.currentElRad) * 0.14;

      // Apply Azimuth yaw around glTF +Y
      Cesium.Quaternion.fromAxisAngle(scratchAxisY, entry.currentAzRad, scratchYokeTrs.rotation);
      Cesium.Matrix4.fromTranslationRotationScale(scratchYokeTrs, scratchMat4);
      entry.yokeNode.matrix = Cesium.Matrix4.clone(scratchMat4, entry.yokeNode.matrix);

      // Apply Elevation tilt around glTF +Z:
      // At el = 90 deg (zenith), tilt = 0 (dish boresight already points +Y).
      // At el = 0 deg (horizon along +X), tilt = -PI/2 around +Z!
      const tiltFromZenith = -(Math.PI * 0.5 - entry.currentElRad);
      Cesium.Quaternion.fromAxisAngle(scratchAxisZ, tiltFromZenith, scratchDishTrs.rotation);
      Cesium.Matrix4.fromTranslationRotationScale(scratchDishTrs, scratchMat4);
      entry.dishNode.matrix = Cesium.Matrix4.clone(scratchMat4, entry.dishNode.matrix);
    }
  });

  return {
    positions,
    dispose: () => {
      disposed = true;
      removePreUpdate();
      if (!viewer.isDestroyed()) {
        for (const id of createdEntityIds) {
          viewer.entities.removeById(id);
        }
        for (const model of addedPrimitives) {
          if (!model.isDestroyed()) {
            viewer.scene.primitives.remove(model);
          }
        }
      }
    },
  };
}
