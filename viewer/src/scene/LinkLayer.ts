import * as Cesium from 'cesium';
import type { AssignmentRecord, PassRecord, ScenarioData } from '../types/engine';
import { CONFLICT_COLOR, SAT_COLORS } from './constants';
import {
  ConflictClashMaterialProperty,
  RfDownlinkPulseMaterialProperty,
} from './shaders';

export interface LiveLinkLookupState {
  passes: PassRecord[];
  activeAssignments: AssignmentRecord[];
  chosenSet: Set<string>;
  conflictIndex: Record<
    string,
    { otherPassId: string; reason: 'same_antenna' | 'same_satellite' }[]
  >;
  showConflicts3D: boolean;
}

export interface LinkLayerHandle {
  dispose: () => void;
}

const scratchMidpoint = new Cesium.Cartesian3();
const scratchDir = new Cesium.Cartesian3();
const scratchQuat = new Cesium.Quaternion();
const scratchUp = new Cesium.Cartesian3(0, 0, 1);

function computeAOSLOSRamp(ms: number, aosMs: number, losMs: number): number {
  const rampMs = 15_000;
  const fromStart = Math.min(1, Math.max(0, (ms - aosMs) / rampMs));
  const fromEnd = Math.min(1, Math.max(0, (losMs - ms) / rampMs));
  return Math.min(fromStart, fromEnd);
}

/**
 * Builds the active RF downlink beams (animated packet-pulse carrier + volumetric RF cone),
 * conflict clash contention arcs with zero-emoji tags, and the reusable entity pool.
 */
export function buildActiveLinkLayer(
  viewer: Cesium.Viewer,
  scenario: ScenarioData,
  satProps: Record<string, Cesium.SampledPositionProperty>,
  antPositions: Record<string, Cesium.Cartesian3>,
  getLiveState: () => LiveLinkLookupState
): LinkLayerHandle {
  const createdIds: string[] = [];
  const crimson = Cesium.Color.fromCssColorString(CONFLICT_COLOR);

  for (const sat of scenario.satellites) {
    const positionProp = satProps[sat.id];
    if (!positionProp) continue;

    const cssColor = SAT_COLORS[sat.id] ?? '#38bdf8';
    const color = Cesium.Color.fromCssColorString(cssColor);

    const findActiveWinner = (
      ms: number
    ): { assignment: AssignmentRecord; aosMs: number; losMs: number } | null => {
      const state = getLiveState();
      for (const a of state.activeAssignments) {
        if (a.satellite_id !== sat.id) continue;
        const aosMs = new Date(a.start_utc).getTime();
        const losMs = new Date(a.end_utc).getTime();
        if (ms >= aosMs && ms <= losMs) {
          return { assignment: a, aosMs, losMs };
        }
      }
      return null;
    };

    const findActiveLoser = (ms: number) => {
      const state = getLiveState();
      if (!state.showConflicts3D) return null;
      for (const p of state.passes) {
        if (p.satellite_id !== sat.id || state.chosenSet.has(p.pass_id)) continue;
        const aos = new Date(p.aos_utc).getTime();
        const los = new Date(p.los_utc).getTime();
        if (ms < aos || ms > los) continue;
        const neighbors = state.conflictIndex[p.pass_id] ?? [];
        const win = neighbors.find((n) => state.chosenSet.has(n.otherPassId));
        if (win) return { loser: p, win };
      }
      return null;
    };

    // 1A. Primary RF Downlink Carrier Beam (GLSL animated packet stream from sat -> antenna)
    const beamId = `active-beam-${sat.id}`;
    const rfMaterial = new RfDownlinkPulseMaterialProperty({
      color,
      pulseColor: Cesium.Color.fromCssColorString('#f0f9ff'),
      speed: 2.0,
      repeat: 7.0,
      getIntensity: (time) => {
        const ms = Cesium.JulianDate.toDate(time).getTime();
        const match = findActiveWinner(ms);
        if (!match) return 0.0;
        return 0.35 + 0.65 * computeAOSLOSRamp(ms, match.aosMs, match.losMs);
      },
    });

    viewer.entities.add({
      id: beamId,
      polyline: {
        positions: new Cesium.CallbackProperty((time?: Cesium.JulianDate) => {
          if (!time) return [];
          const ms = Cesium.JulianDate.toDate(time).getTime();
          const match = findActiveWinner(ms);
          if (!match) return [];
          const antPos = antPositions[match.assignment.antenna_id];
          const satPos = positionProp.getValue(time);
          return antPos && satPos ? [antPos, satPos] : [];
        }, false),
        width: 8,
        arcType: Cesium.ArcType.NONE,
        material: rfMaterial as unknown as Cesium.MaterialProperty,
      },
    });
    createdIds.push(beamId);

    // 1B. Translucent Volumetric RF Downlink Envelope Cone (connects spacecraft -> dish)
    const coneId = `active-beam-cone-${sat.id}`;
    viewer.entities.add({
      id: coneId,
      show: new Cesium.CallbackProperty((time?: Cesium.JulianDate) => {
        if (!time) return false;
        const ms = Cesium.JulianDate.toDate(time).getTime();
        return findActiveWinner(ms) !== null;
      }, false) as unknown as boolean,
      position: new Cesium.CallbackProperty((time?: Cesium.JulianDate) => {
        if (!time) return Cesium.Cartesian3.ZERO;
        const ms = Cesium.JulianDate.toDate(time).getTime();
        const match = findActiveWinner(ms);
        if (!match) return Cesium.Cartesian3.ZERO;
        const antPos = antPositions[match.assignment.antenna_id];
        const satPos = positionProp.getValue(time);
        if (!antPos || !satPos) return Cesium.Cartesian3.ZERO;
        return Cesium.Cartesian3.midpoint(antPos, satPos, new Cesium.Cartesian3());
      }, false) as unknown as Cesium.PositionProperty,
      orientation: new Cesium.CallbackProperty((time?: Cesium.JulianDate) => {
        if (!time) return Cesium.Quaternion.IDENTITY;
        const ms = Cesium.JulianDate.toDate(time).getTime();
        const match = findActiveWinner(ms);
        if (!match) return Cesium.Quaternion.IDENTITY;
        const antPos = antPositions[match.assignment.antenna_id];
        const satPos = positionProp.getValue(time);
        if (!antPos || !satPos) return Cesium.Quaternion.IDENTITY;
        // Cylinder local +Z points from antenna toward satellite
        Cesium.Cartesian3.subtract(satPos, antPos, scratchDir);
        const len = Cesium.Cartesian3.magnitude(scratchDir);
        if (len < 1) return Cesium.Quaternion.IDENTITY;
        Cesium.Cartesian3.divideByScalar(scratchDir, len, scratchDir);
        const dot = Cesium.Cartesian3.dot(scratchUp, scratchDir);
        if (dot > 0.99999) return Cesium.Quaternion.IDENTITY;
        if (dot < -0.99999) {
          return Cesium.Quaternion.fromAxisAngle(Cesium.Cartesian3.UNIT_X, Math.PI, new Cesium.Quaternion());
        }
        const axis = Cesium.Cartesian3.cross(scratchUp, scratchDir, new Cesium.Cartesian3());
        Cesium.Cartesian3.normalize(axis, axis);
        const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
        return Cesium.Quaternion.fromAxisAngle(axis, angle, scratchQuat).clone();
      }, false) as unknown as Cesium.Property,
      cylinder: {
        length: new Cesium.CallbackProperty((time?: Cesium.JulianDate) => {
          if (!time) return 1;
          const ms = Cesium.JulianDate.toDate(time).getTime();
          const match = findActiveWinner(ms);
          if (!match) return 1;
          const antPos = antPositions[match.assignment.antenna_id];
          const satPos = positionProp.getValue(time);
          if (!antPos || !satPos) return 1;
          return Math.max(100, Cesium.Cartesian3.distance(antPos, satPos));
        }, false),
        topRadius: 16_000,
        bottomRadius: 42_000,
        slices: 20,
        material: color.withAlpha(0.085),
        outline: false,
      },
    });
    createdIds.push(coneId);

    // 2A. Contested / Dropped Conflict Link (Pulsing Crimson Interruption Shader)
    const conflictBeamId = `active-conflict-beam-${sat.id}`;
    const conflictMat = new ConflictClashMaterialProperty(crimson.withAlpha(0.9));
    viewer.entities.add({
      id: conflictBeamId,
      polyline: {
        positions: new Cesium.CallbackProperty((time?: Cesium.JulianDate) => {
          if (!time) return [];
          const ms = Cesium.JulianDate.toDate(time).getTime();
          const match = findActiveLoser(ms);
          if (!match) return [];
          const antPos = antPositions[match.loser.antenna_id];
          const satPos = positionProp.getValue(time);
          return antPos && satPos ? [antPos, satPos] : [];
        }, false),
        width: 3.5,
        arcType: Cesium.ArcType.NONE,
        material: conflictMat as unknown as Cesium.MaterialProperty,
      },
    });
    createdIds.push(conflictBeamId);

    // 2B. Clean Zero-Emoji Conflict Telemetry Tag
    const conflictLabelId = `active-conflict-label-${sat.id}`;
    viewer.entities.add({
      id: conflictLabelId,
      position: new Cesium.CallbackProperty((time?: Cesium.JulianDate) => {
        if (!time) return Cesium.Cartesian3.ZERO;
        const ms = Cesium.JulianDate.toDate(time).getTime();
        const match = findActiveLoser(ms);
        if (!match) return Cesium.Cartesian3.ZERO;
        const antPos = antPositions[match.loser.antenna_id];
        const satPos = positionProp.getValue(time);
        if (!antPos || !satPos) return Cesium.Cartesian3.ZERO;
        // Place tag 62% along the link (away from station and satellite)
        Cesium.Cartesian3.lerp(antPos, satPos, 0.62, scratchMidpoint);
        return scratchMidpoint.clone();
      }, false) as unknown as Cesium.PositionProperty,
      label: {
        show: new Cesium.CallbackProperty((time?: Cesium.JulianDate) => {
          if (!time) return false;
          const ms = Cesium.JulianDate.toDate(time).getTime();
          return findActiveLoser(ms) !== null;
        }, false),
        text: new Cesium.CallbackProperty((time?: Cesium.JulianDate) => {
          if (!time) return '';
          const ms = Cesium.JulianDate.toDate(time).getTime();
          const match = findActiveLoser(ms);
          if (!match) return '';
          const reason =
            match.win.reason === 'same_antenna' ? 'SAME_ANTENNA' : 'SAME_SAT';
          return `CLASH // ${match.loser.pass_id.toUpperCase()} • ${reason}`;
        }, false),
        font: '600 10px "JetBrains Mono", ui-monospace, monospace',
        fillColor: Cesium.Color.fromCssColorString('#fecdd3'),
        outlineColor: Cesium.Color.fromCssColorString('#020617'),
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -8),
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('#3b0714').withAlpha(0.88),
        backgroundPadding: new Cesium.Cartesian2(7, 3),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(2.0e6, 1.0, 2.2e7, 0.78),
      },
    });
    createdIds.push(conflictLabelId);
  }

  return {
    dispose: () => {
      if (!viewer.isDestroyed()) {
        for (const id of createdIds) {
          viewer.entities.removeById(id);
        }
      }
    },
  };
}

/**
 * Builds a single batched Cesium.PolylineCollection primitive (1 draw call!) for all 24h
 * candidate ghost pass chords, kept whisper-subtle so active RF beams dominate the hierarchy.
 */
export function buildGhostLinksPrimitive(
  passes: PassRecord[],
  chosenSet: Set<string>,
  ghostFilter: 'all' | 'sentinel-2a' | 'sentinel-2b' | 'off',
  satProps: Record<string, Cesium.SampledPositionProperty>,
  antPositions: Record<string, Cesium.Cartesian3>
): Cesium.PolylineCollection | null {
  if (ghostFilter === 'off') return null;

  const collection = new Cesium.PolylineCollection();
  for (const p of passes) {
    if (ghostFilter !== 'all' && p.satellite_id !== ghostFilter) continue;

    const antPos = antPositions[p.antenna_id];
    const satProp = satProps[p.satellite_id];
    if (!antPos || !satProp) continue;

    const aosJd = Cesium.JulianDate.fromIso8601(p.aos_utc);
    const losJd = Cesium.JulianDate.fromIso8601(p.los_utc);
    const midSeconds = Cesium.JulianDate.secondsDifference(losJd, aosJd) / 2;
    const midJd = Cesium.JulianDate.addSeconds(aosJd, midSeconds, new Cesium.JulianDate());
    const peakSatPos = satProp.getValue(midJd);
    if (!peakSatPos) continue;

    const isChosen = chosenSet.has(p.pass_id);
    const satColor = Cesium.Color.fromCssColorString(SAT_COLORS[p.satellite_id] ?? '#38bdf8');
    const lineColor = isChosen
      ? satColor.withAlpha(0.20)
      : Cesium.Color.fromCssColorString('#64748b').withAlpha(0.08);

    collection.add({
      positions: [antPos, peakSatPos],
      width: isChosen ? 1.25 : 0.75,
      material: Cesium.Material.fromType('Color', { color: lineColor }),
    });
  }

  return collection;
}
