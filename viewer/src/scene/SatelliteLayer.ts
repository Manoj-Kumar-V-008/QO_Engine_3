import * as Cesium from 'cesium';
import type { ScenarioData, TlesMap } from '../types/engine';
import { buildSatellitePositionProperty } from '../lib/orbit';
import {
  SAT_COLORS,
  SENTINEL2_NOMINAL_ALT_KM,
  SENTINEL2_SWATH_WIDTH_M,
  getSatShortName,
} from './constants';
import { getSatelliteReticleIcon } from './billboardBadges';
import {
  NadirSwathMaterialProperty,
  createSpacecraftCustomShader,
} from './shaders';
import { getSentinel2GlbUrl } from './proceduralModels';

export interface LiveSatelliteStateAccessor {
  isSatelliteDownlinking: (satId: string, timeMs: number) => boolean;
  isSwathVisible: () => boolean;
  getTrackedTarget: () => string | null;
}

export interface SatelliteLayerHandle {
  entities: Record<string, Cesium.Entity>;
  positionProps: Record<string, Cesium.SampledPositionProperty>;
  dispose: () => void;
}

// Reusable scratch math objects for zero-GC 60fps LVLH attitude & swath updates
const scratchPrev = new Cesium.Cartesian3();
const scratchNext = new Cesium.Cartesian3();
const scratchVel = new Cesium.Cartesian3();
const scratchZ = new Cesium.Cartesian3();
const scratchY = new Cesium.Cartesian3();
const scratchX = new Cesium.Cartesian3();
const scratchRot = new Cesium.Matrix3();
const scratchQuat = new Cesium.Quaternion();
const scratchTimeA = new Cesium.JulianDate();
const scratchTimeB = new Cesium.JulianDate();
const scratchCarto = new Cesium.Cartographic();
const scratchCross = new Cesium.Cartesian3();
const scratchSubSat = new Cesium.Cartesian3();

/**
 * Computes exact Local-Vertical Local-Horizontal (LVLH) orientation quaternion:
 *  - +X = Along-track orbital velocity
 *  - +Z = Zenith (radially away from Earth; so -Z is exact Nadir!)
 *  - +Y = Cross-track orbital plane normal
 * Singularity-free over the North and South poles!
 */
function buildLvlhOrientationProperty(
  positionProp: Cesium.SampledPositionProperty
): Cesium.CallbackProperty {
  return new Cesium.CallbackProperty((time?: Cesium.JulianDate, result?: Cesium.Quaternion) => {
    const out = result ?? new Cesium.Quaternion();
    if (!time) return Cesium.Quaternion.IDENTITY;

    const pos = positionProp.getValue(time, scratchSubSat);
    if (!pos) return Cesium.Quaternion.IDENTITY;

    Cesium.JulianDate.addSeconds(time, -2.0, scratchTimeA);
    Cesium.JulianDate.addSeconds(time, 2.0, scratchTimeB);
    const pA = positionProp.getValue(scratchTimeA, scratchPrev);
    const pB = positionProp.getValue(scratchTimeB, scratchNext);
    if (!pA || !pB) return Cesium.Quaternion.IDENTITY;

    Cesium.Cartesian3.subtract(pB, pA, scratchVel);
    if (Cesium.Cartesian3.magnitudeSquared(scratchVel) < 1e-6) {
      return Cesium.Quaternion.IDENTITY;
    }

    // Z = Zenith (radial outward), Y = Cross-track (Z x V), X = Along-track (Y x Z)
    Cesium.Cartesian3.normalize(pos, scratchZ);
    Cesium.Cartesian3.cross(scratchZ, scratchVel, scratchY);
    if (Cesium.Cartesian3.magnitudeSquared(scratchY) < 1e-6) {
      return Cesium.Quaternion.IDENTITY;
    }
    Cesium.Cartesian3.normalize(scratchY, scratchY);
    Cesium.Cartesian3.cross(scratchY, scratchZ, scratchX);
    Cesium.Cartesian3.normalize(scratchX, scratchX);

    // Build column-major rotation matrix [X, Y, Z]
    Cesium.Matrix3.setColumn(scratchRot, 0, scratchX, scratchRot);
    Cesium.Matrix3.setColumn(scratchRot, 1, scratchY, scratchRot);
    Cesium.Matrix3.setColumn(scratchRot, 2, scratchZ, scratchRot);

    Cesium.Quaternion.fromRotationMatrix(scratchRot, scratchQuat);
    return Cesium.Quaternion.clone(scratchQuat, out);
  }, false);
}

/**
 * Computes the 4 ground corners of Sentinel-2's 290 km MSI optical nadir imaging swath
 * centered under the spacecraft, plus the sub-satellite center for the nadir beam rail.
 */
function computeSwathFootprintPositions(
  positionProp: Cesium.SampledPositionProperty,
  time: Cesium.JulianDate
): Cesium.Cartesian3[] {
  const pos = positionProp.getValue(time, scratchSubSat);
  if (!pos) return [];

  Cesium.JulianDate.addSeconds(time, -4.0, scratchTimeA);
  Cesium.JulianDate.addSeconds(time, 4.0, scratchTimeB);
  const pA = positionProp.getValue(scratchTimeA, scratchPrev);
  const pB = positionProp.getValue(scratchTimeB, scratchNext);
  if (!pA || !pB) return [];

  Cesium.Cartesian3.subtract(pB, pA, scratchVel);
  if (Cesium.Cartesian3.magnitudeSquared(scratchVel) < 1e-6) return [];

  Cesium.Cartesian3.normalize(pos, scratchZ);
  Cesium.Cartesian3.cross(scratchZ, scratchVel, scratchCross);
  if (Cesium.Cartesian3.magnitudeSquared(scratchCross) < 1e-6) return [];
  Cesium.Cartesian3.normalize(scratchCross, scratchCross);
  Cesium.Cartesian3.cross(scratchCross, scratchZ, scratchX);
  Cesium.Cartesian3.normalize(scratchX, scratchX);

  // Project spacecraft nadir point onto WGS84 ellipsoid
  const carto = Cesium.Cartographic.fromCartesian(pos, Cesium.Ellipsoid.WGS84, scratchCarto);
  const groundCenter = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, 1500);

  const halfCross = SENTINEL2_SWATH_WIDTH_M * 0.5; // 145 km each side (290 km total!)
  const halfAlong = 135_000; // 270 km instantaneous imaging frame footprint

  const makeCorner = (alongSign: number, crossSign: number) => {
    const pt = new Cesium.Cartesian3();
    Cesium.Cartesian3.add(
      groundCenter,
      Cesium.Cartesian3.multiplyByScalar(scratchX, alongSign * halfAlong, new Cesium.Cartesian3()),
      pt
    );
    Cesium.Cartesian3.add(
      pt,
      Cesium.Cartesian3.multiplyByScalar(scratchCross, crossSign * halfCross, new Cesium.Cartesian3()),
      pt
    );
    // Clamp gently back onto Earth's surface
    const c = Cesium.Cartographic.fromCartesian(pt);
    return Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, 2000);
  };

  return [
    makeCorner(1, -1),
    makeCorner(1, 1),
    makeCorner(-1, 1),
    makeCorner(-1, -1),
  ];
}

/**
 * Populates 3D Sentinel-2 spacecraft models (with true LVLH attitude, Earthshine Fresnel shader,
 * tapered orbital ribbon, zero-emoji telemetry callout, and 290 km MSI nadir imaging swath).
 */
export function buildSatelliteLayer(
  viewer: Cesium.Viewer,
  scenario: ScenarioData,
  tles: TlesMap,
  accessor: LiveSatelliteStateAccessor
): SatelliteLayerHandle {
  const entities: Record<string, Cesium.Entity> = {};
  const positionProps: Record<string, Cesium.SampledPositionProperty> = {};
  const createdIds: string[] = [];
  const customShaders: { satId: string; shader: Cesium.CustomShader }[] = [];
  let disposed = false;

  const startJd = Cesium.JulianDate.fromIso8601(scenario.start_utc);
  const stopJd = Cesium.JulianDate.addHours(
    startJd,
    scenario.duration_hours,
    new Cesium.JulianDate()
  );

  for (const sat of scenario.satellites) {
    const tle = tles[sat.id];
    if (!tle) continue;

    const positionProp = buildSatellitePositionProperty(
      tle,
      scenario.start_utc,
      scenario.duration_hours,
      30
    );
    positionProps[sat.id] = positionProp;

    const cssColor = SAT_COLORS[sat.id] ?? '#38bdf8';
    const color = Cesium.Color.fromCssColorString(cssColor);
    const shortName = getSatShortName(sat.id);
    const orientationProp = buildLvlhOrientationProperty(positionProp);
    const customShader = createSpacecraftCustomShader(cssColor);
    customShaders.push({ satId: sat.id, shader: customShader });

    const satEntityId = `sat-${sat.id}`;
    const entity = viewer.entities.add({
      id: satEntityId,
      name: `${shortName} (${sat.id.toUpperCase()})`,
      availability: new Cesium.TimeIntervalCollection([
        new Cesium.TimeInterval({ start: startJd, stop: stopJd }),
      ]),
      position: positionProp,
      orientation: orientationProp as unknown as Cesium.Property,
      // Subtle wide-range acquisition reticle (fades out when zoomed close to 3D model)
      billboard: {
        image: getSatelliteReticleIcon(cssColor),
        width: 24,
        height: 24,
        scaleByDistance: new Cesium.NearFarScalar(1.2e6, 0.0, 6.0e6, 1.0),
        translucencyByDistance: new Cesium.NearFarScalar(1.5e6, 0.0, 5.5e6, 0.9),
      },
      label: {
        text: `${shortName} // ${SENTINEL2_NOMINAL_ALT_KM} KM`,
        font: '600 10px "JetBrains Mono", ui-monospace, monospace',
        fillColor: Cesium.Color.fromCssColorString('#f8fafc'),
        outlineColor: Cesium.Color.fromCssColorString('#020617'),
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('#050a14').withAlpha(0.76),
        backgroundPadding: new Cesium.Cartesian2(6, 3),
        pixelOffset: new Cesium.Cartesian2(0, -34),
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 4.5e7),
        scaleByDistance: new Cesium.NearFarScalar(1.8e6, 1.0, 2.6e7, 0.82),
      },
      path: {
        resolution: 30,
        leadTime: 1800, // 30 min ahead
        trailTime: 3600, // 60 min luminous fading wake behind
        width: 2.2,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.16,
          taperPower: 0.65,
          color: color.withAlpha(0.72),
        }),
      },
    });

    entities[sat.id] = entity;
    createdIds.push(satEntityId);

    // Attach procedural 3D Sentinel-2 GLB asynchronously once exported
    getSentinel2GlbUrl(cssColor)
      .then((glbUrl) => {
        if (disposed || viewer.isDestroyed()) return;
        entity.model = new Cesium.ModelGraphics({
          uri: glbUrl,
          scale: 12000,
          minimumPixelSize: 64,
          maximumScale: 165000,
          customShader,
          silhouetteColor: color,
          silhouetteSize: new Cesium.CallbackProperty(() => {
            return accessor.getTrackedTarget() === satEntityId ? 1.4 : 0.0;
          }, false),
          shadows: Cesium.ShadowMode.DISABLED,
        });
      })
      .catch(() => {
        // Fallback: keep crisp reticle billboard visible
      });

    // Sentinel-2 290 km MSI Nadir Optical Imaging Swath Footprint
    const swathId = `swath-footprint-${sat.id}`;
    const swathMaterial = new NadirSwathMaterialProperty(color.withAlpha(0.24));
    viewer.entities.add({
      id: swathId,
      show: new Cesium.CallbackProperty(() => accessor.isSwathVisible(), false) as unknown as boolean,
      polygon: {
        hierarchy: new Cesium.CallbackProperty((time?: Cesium.JulianDate) => {
          if (!time || !accessor.isSwathVisible()) {
            return new Cesium.PolygonHierarchy([]);
          }
          return new Cesium.PolygonHierarchy(computeSwathFootprintPositions(positionProp, time));
        }, false),
        material: swathMaterial as unknown as Cesium.MaterialProperty,
        outline: true,
        outlineColor: color.withAlpha(0.45),
        outlineWidth: 1,
        height: 2000,
      },
    });
    createdIds.push(swathId);

    // Translucent Nadir Imaging Frustum Edge Rails (Spacecraft -> Swath Cross-Track Edges)
    const frustumId = `swath-frustum-${sat.id}`;
    viewer.entities.add({
      id: frustumId,
      show: new Cesium.CallbackProperty(() => accessor.isSwathVisible(), false) as unknown as boolean,
      polyline: {
        positions: new Cesium.CallbackProperty((time?: Cesium.JulianDate) => {
          if (!time || !accessor.isSwathVisible()) return [];
          const satPos = positionProp.getValue(time);
          if (!satPos) return [];
          const corners = computeSwathFootprintPositions(positionProp, time);
          if (corners.length < 4) return [];
          // Draw crisp optical cone edge rails: Corner0 -> Sat -> Corner1 -> Corner2 -> Sat -> Corner3
          return [corners[0], satPos, corners[1], corners[2], satPos, corners[3]];
        }, false),
        width: 1.1,
        arcType: Cesium.ArcType.NONE,
        material: color.withAlpha(0.24),
      },
    });
    createdIds.push(frustumId);
  }

  // Update CustomShader downlink glow uniform cleanly on preUpdate (zero allocations)
  const removePreUpdate = viewer.scene.preUpdate.addEventListener((_scene, time) => {
    const ms = Cesium.JulianDate.toDate(time).getTime();
    for (const entry of customShaders) {
      const active = accessor.isSatelliteDownlinking(entry.satId, ms) ? 1.0 : 0.0;
      entry.shader.setUniform('u_downlinkActive', active);
    }
  });

  return {
    entities,
    positionProps,
    dispose: () => {
      disposed = true;
      removePreUpdate();
      if (!viewer.isDestroyed()) {
        for (const id of createdIds) {
          viewer.entities.removeById(id);
        }
      }
    },
  };
}
