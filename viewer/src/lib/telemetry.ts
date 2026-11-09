import type {
  ConflictRecord,
  PassRecord,
  ScenarioData,
  ScheduleDocument,
} from '../types/engine';

export interface ActiveConflictInfo {
  loserPass: PassRecord;
  winnerPass: PassRecord;
  reason: 'same_antenna' | 'same_satellite';
  isSetupGapOnly: boolean; // True when pass is in the 120s dish re-point window
}

export interface SatLiveTelemetry {
  satelliteId: string;
  capacityGb: number;
  levelGb: number;
  fillPct: number;
  isOverflowing: boolean;
  isDraining: boolean;
  netRateGbPerHour: number;
  deliveredSoFarGb: number;
  overflowSoFarGb: number;
}

export interface FleetLiveTelemetry {
  totalDeliveredSoFarGb: number;
  totalPlannedGb: number;
  totalOverflowSoFarGb: number;
  activeBeamCount: number;
  activeDownlinkMbps: number;
  satellites: Record<string, SatLiveTelemetry>;
}

/**
 * Fallback/exact conflict detector matching engine/conflicts.py (63 pairs: 40 same_satellite, 23 same_antenna)
 */
export function ensureConflicts(
  passes: PassRecord[],
  existingConflicts: ConflictRecord[] | undefined,
  scenario: ScenarioData
): ConflictRecord[] {
  if (existingConflicts && existingConflicts.length > 0) {
    return existingConflicts;
  }
  const setupMap: Record<string, number> = {};
  for (const ant of scenario.antennas) {
    setupMap[ant.id] = ant.setup_s * 1000;
  }

  const results: ConflictRecord[] = [];
  for (let i = 0; i < passes.length; i++) {
    const p = passes[i];
    const pStart = new Date(p.aos_utc).getTime();
    const pEnd = new Date(p.los_utc).getTime();

    for (let j = i + 1; j < passes.length; j++) {
      const q = passes[j];
      const qStart = new Date(q.aos_utc).getTime();
      const qEnd = new Date(q.los_utc).getTime();

      let reason: 'same_antenna' | 'same_satellite' | null = null;
      if (p.antenna_id === q.antenna_id) {
        const gap = setupMap[p.antenna_id] ?? 0;
        if (qStart < pEnd + gap && pStart < qEnd + gap) {
          reason = 'same_antenna';
        }
      }
      if (!reason && p.satellite_id === q.satellite_id) {
        if (qStart < pEnd && pStart < qEnd) {
          reason = 'same_satellite';
        }
      }
      if (reason) {
        results.push({ pass_a: p.pass_id, pass_b: q.pass_id, reason });
      }
    }
  }
  return results;
}

/**
 * Build a lookup map: pass_id -> list of { otherPassId, reason }
 */
export function buildConflictIndex(
  conflicts: ConflictRecord[]
): Record<string, { otherPassId: string; reason: 'same_antenna' | 'same_satellite' }[]> {
  const index: Record<
    string,
    { otherPassId: string; reason: 'same_antenna' | 'same_satellite' }[]
  > = {};
  for (const c of conflicts) {
    if (!index[c.pass_a]) index[c.pass_a] = [];
    if (!index[c.pass_b]) index[c.pass_b] = [];
    index[c.pass_a].push({ otherPassId: c.pass_b, reason: c.reason });
    index[c.pass_b].push({ otherPassId: c.pass_a, reason: c.reason });
  }
  return index;
}

/**
 * Given an unchosen pass that is currently in its visibility window, check if it lost
 * to a chosen pass and return the conflict details.
 */
export function getLoserConflictInfo(
  pass: PassRecord,
  chosenSet: Set<string>,
  passMap: Record<string, PassRecord>,
  conflictIndex: Record<
    string,
    { otherPassId: string; reason: 'same_antenna' | 'same_satellite' }[]
  >,
  currentTimeMs: number
): ActiveConflictInfo | null {
  if (chosenSet.has(pass.pass_id)) return null;
  const neighbors = conflictIndex[pass.pass_id] ?? [];
  for (const n of neighbors) {
    if (chosenSet.has(n.otherPassId)) {
      const winner = passMap[n.otherPassId];
      if (!winner) continue;
      const wStart = new Date(winner.aos_utc).getTime();
      const wEnd = new Date(winner.los_utc).getTime();
      const winnerActiveNow = currentTimeMs >= wStart && currentTimeMs <= wEnd;
      return {
        loserPass: pass,
        winnerPass: winner,
        reason: n.reason,
        isSetupGapOnly: !winnerActiveNow,
      };
    }
  }
  return null;
}

/**
 * Compute live buffer gauge state and ticking GB delivered counter at `currentTimeMs`.
 * Uses `buffer_timeline` from the schedule document for reference and runs continuous
 * sub-minute interpolation matching `engine/buffer.py` so gauges and counters tick smoothly.
 */
export function computeFleetTelemetry(
  scenario: ScenarioData,
  schedule: ScheduleDocument,
  currentTimeMs: number
): FleetLiveTelemetry {
  const startMs = new Date(scenario.start_utc).getTime();
  const elapsedHours = Math.max(0, (currentTimeMs - startMs) / 3_600_000);

  const satTelemetry: Record<string, SatLiveTelemetry> = {};
  let totalDeliveredSoFarGb = 0;
  let totalOverflowSoFarGb = 0;
  let activeBeamCount = 0;
  let activeDownlinkMbps = 0;

  for (const sat of scenario.satellites) {
    const timeline = schedule.buffer_timeline[sat.id] ?? [];
    const myAssignments = schedule.assignments.filter((a) => a.satellite_id === sat.id);

    // 1. Interpolate buffer level from 10-minute buffer_timeline points
    let levelGb = sat.initial_buffer_gb;
    if (timeline.length > 0) {
      let prevMs = startMs;
      let prevLevel = sat.initial_buffer_gb;
      let found = false;

      for (const pt of timeline) {
        const ptMs = new Date(pt.t_utc).getTime();
        if (currentTimeMs <= ptMs) {
          const span = Math.max(1, ptMs - prevMs);
          const frac = Math.min(1, Math.max(0, (currentTimeMs - prevMs) / span));
          levelGb = prevLevel + frac * (pt.level_gb - prevLevel);
          found = true;
          break;
        }
        prevMs = ptMs;
        prevLevel = pt.level_gb;
      }
      if (!found) {
        levelGb = timeline[timeline.length - 1].level_gb;
      }
    }

    // 2. Compute GB delivered so far by summing completed + partially active assignments
    let deliveredSoFar = 0;
    let isDraining = false;
    let currentDrainGbPerHour = 0;

    for (const a of myAssignments) {
      const aStart = new Date(a.start_utc).getTime();
      const aEnd = new Date(a.end_utc).getTime();
      const durSeconds = Math.max(1, (aEnd - aStart) / 1000);

      if (currentTimeMs >= aEnd) {
        deliveredSoFar += a.planned_gb;
      } else if (currentTimeMs > aStart) {
        const frac = (currentTimeMs - aStart) / (aEnd - aStart);
        deliveredSoFar += a.planned_gb * frac;
        isDraining = true;
        const passGbPerHour = (a.planned_gb / durSeconds) * 3600;
        currentDrainGbPerHour += passGbPerHour;
        activeBeamCount += 1;
        // Convert GB/s to Mbps: (GB / s) * 8000
        activeDownlinkMbps += (a.planned_gb / durSeconds) * 8000;
      }
    }

    // Conservation of data: generated = level + delivered + overflow
    const generatedSoFar = sat.initial_buffer_gb + sat.generation_gb_per_hour * elapsedHours;
    const overflowSoFar = Math.max(0, generatedSoFar - levelGb - deliveredSoFar);

    const netRateGbPerHour = sat.generation_gb_per_hour - currentDrainGbPerHour;
    const isOverflowing = levelGb >= sat.buffer_capacity_gb - 1.5 && netRateGbPerHour > 0;
    const fillPct = Math.min(100, Math.max(0, (levelGb / sat.buffer_capacity_gb) * 100));

    satTelemetry[sat.id] = {
      satelliteId: sat.id,
      capacityGb: sat.buffer_capacity_gb,
      levelGb,
      fillPct,
      isOverflowing,
      isDraining,
      netRateGbPerHour,
      deliveredSoFarGb: deliveredSoFar,
      overflowSoFarGb: overflowSoFar,
    };

    totalDeliveredSoFarGb += deliveredSoFar;
    totalOverflowSoFarGb += overflowSoFar;
  }

  return {
    totalDeliveredSoFarGb,
    totalPlannedGb: schedule.summary.gb_delivered,
    totalOverflowSoFarGb,
    activeBeamCount,
    activeDownlinkMbps,
    satellites: satTelemetry,
  };
}
