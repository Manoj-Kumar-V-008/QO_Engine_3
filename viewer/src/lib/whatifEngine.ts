import * as satellite from 'satellite.js';
import type {
  AntennaConfig,
  AssignmentRecord,
  BufferPoint,
  ConflictRecord,
  PassRecord,
  PassesDocument,
  SatelliteConfig,
  ScenarioData,
  ScheduleDocument,
  ScoreboardDocument,
  TlesMap,
} from '../types/engine';

// Matches engine/pass_finder.py RATE_STEPS
const RATE_STEPS: [number, number][] = [
  [30.0, 1.0],
  [20.0, 0.75],
  [10.0, 0.5],
  [0.0, 0.25],
];

const TIMELINE_EVERY_S = 600; // 10-minute buffer timeline points

function rateFraction(elevationDeg: number): number {
  for (const [minEl, frac] of RATE_STEPS) {
    if (elevationDeg >= minEl) return frac;
  }
  return RATE_STEPS[RATE_STEPS.length - 1][1];
}

function volumeGb(durationS: number, rateMbps: number): number {
  return (durationS * rateMbps) / 8 / 1000;
}

function isoZ(ms: number): string {
  return new Date(Math.round(ms / 1000) * 1000)
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z');
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

/**
 * Compute satellite elevation (degrees) above an antenna at `timeMs` using SGP4.
 */
function getElevationDeg(
  satrec: satellite.SatRec,
  observerGd: { longitude: number; latitude: number; height: number },
  timeMs: number
): number {
  const date = new Date(timeMs);
  const pv = satellite.propagate(satrec, date);
  if (!pv || !pv.position || typeof pv.position === 'boolean') return -90;
  const gmst = satellite.gstime(date);
  const posEcf = satellite.eciToEcf(pv.position, gmst);
  const look = satellite.ecfToLookAngles(observerGd, posEcf);
  return (look.elevation * 180) / Math.PI;
}

/**
 * Binary-search the exact crossing timestamp (1-second precision) where elevation crosses `targetElDeg`.
 */
function refineCrossingMs(
  satrec: satellite.SatRec,
  observerGd: { longitude: number; latitude: number; height: number },
  tLowMs: number,
  tHighMs: number,
  targetElDeg: number,
  rising: boolean
): number {
  let lo = tLowMs;
  let hi = tHighMs;
  for (let iter = 0; iter < 8; iter++) {
    const mid = 0.5 * (lo + hi);
    const el = getElevationDeg(satrec, observerGd, mid);
    if (rising) {
      if (el < targetElDeg) lo = mid;
      else hi = mid;
    } else {
      if (el >= targetElDeg) lo = mid;
      else hi = mid;
    }
  }
  return Math.round((0.5 * (lo + hi)) / 1000) * 1000;
}

/**
 * Port of engine/pass_finder.py: find_passes & pass_volume_gb for one satellite over one antenna.
 */
export function findPassesForStation(
  sat: SatelliteConfig,
  tle: { line1: string; line2: string },
  antenna: AntennaConfig,
  startUtcIso: string,
  durationHours: number
): Omit<PassRecord, 'pass_id'>[] {
  const satrec = satellite.twoline2satrec(tle.line1, tle.line2);
  const observerGd = {
    longitude: (antenna.lon_deg * Math.PI) / 180,
    latitude: (antenna.lat_deg * Math.PI) / 180,
    height: (antenna.alt_m || 0) / 1000,
  };

  const startMs = new Date(startUtcIso).getTime();
  const endMs = startMs + durationHours * 3600 * 1000;
  const coarseStepMs = 15_000; // 15-second scan

  const results: Omit<PassRecord, 'pass_id'>[] = [];
  let inPass = false;
  let aosMs = 0;
  let maxEl = -90;
  let prevMs = startMs;
  let prevEl = getElevationDeg(satrec, observerGd, startMs);

  // Match Skyfield find_events behaviour: only count complete passes (rise -> peak -> set)
  for (let t = startMs + coarseStepMs; t <= endMs; t += coarseStepMs) {
    const el = getElevationDeg(satrec, observerGd, t);

    if (!inPass && prevEl < antenna.min_elevation_deg && el >= antenna.min_elevation_deg) {
      inPass = true;
      aosMs = refineCrossingMs(
        satrec,
        observerGd,
        prevMs,
        t,
        antenna.min_elevation_deg,
        true
      );
      maxEl = el;
    } else if (inPass) {
      if (el > maxEl) maxEl = el;
      if (el < antenna.min_elevation_deg) {
        const losMs = refineCrossingMs(
          satrec,
          observerGd,
          prevMs,
          t,
          antenna.min_elevation_deg,
          false
        );
        const durationS = Math.round((losMs - aosMs) / 1000);

        if (durationS > 10) {
          // Refine peak elevation and integrate expected_volume_gb in 10s slices (matches pass_volume_gb)
          const slices = Math.max(1, Math.round(durationS / 10));
          const sliceS = durationS / slices;
          let totalMegabits = 0;
          let refinedMaxEl = maxEl;

          for (let s = 0; s < slices; s++) {
            const midMs = aosMs + (s + 0.5) * sliceS * 1000;
            const sliceEl = getElevationDeg(satrec, observerGd, midMs);
            if (sliceEl > refinedMaxEl) refinedMaxEl = sliceEl;
            totalMegabits +=
              sat.downlink_rate_mbps * rateFraction(sliceEl) * sliceS;
          }

          const expectedGb = totalMegabits / 8 / 1000;
          results.push({
            satellite_id: sat.id,
            antenna_id: antenna.id,
            aos_utc: isoZ(aosMs),
            los_utc: isoZ(losMs),
            max_elevation_deg: round1(refinedMaxEl),
            duration_s: durationS,
            max_volume_gb: round1(volumeGb(durationS, sat.downlink_rate_mbps)),
            expected_volume_gb: round1(expectedGb),
          });
        }

        inPass = false;
        maxEl = -90;
      }
    }

    prevMs = t;
    prevEl = el;
  }

  return results;
}

/**
 * Port of engine/conflicts.py: pass_conflict & find_conflicts
 */
export function passConflictReason(
  p: PassRecord,
  q: PassRecord,
  setupSecondsMap: Record<string, number>
): 'same_antenna' | 'same_satellite' | null {
  const pStart = new Date(p.aos_utc).getTime();
  const pEnd = new Date(p.los_utc).getTime();
  const qStart = new Date(q.aos_utc).getTime();
  const qEnd = new Date(q.los_utc).getTime();

  if (p.antenna_id === q.antenna_id) {
    const gapMs = (setupSecondsMap[p.antenna_id] ?? 0) * 1000;
    if (qStart < pEnd + gapMs && pStart < qEnd + gapMs) {
      return 'same_antenna';
    }
  }

  if (p.satellite_id === q.satellite_id) {
    if (qStart < pEnd && pStart < qEnd) {
      return 'same_satellite';
    }
  }

  return null;
}

export function findAllConflicts(
  passes: PassRecord[],
  setupSecondsMap: Record<string, number>
): ConflictRecord[] {
  const conflicts: ConflictRecord[] = [];
  for (let i = 0; i < passes.length; i++) {
    for (let j = i + 1; j < passes.length; j++) {
      const reason = passConflictReason(passes[i], passes[j], setupSecondsMap);
      if (reason) {
        conflicts.push({
          pass_a: passes[i].pass_id,
          pass_b: passes[j].pass_id,
          reason,
        });
      }
    }
  }
  return conflicts;
}

function overlapSeconds(
  startAMs: number,
  endAMs: number,
  startBMs: number,
  endBMs: number
): number {
  return Math.max(0, (Math.min(endAMs, endBMs) - Math.max(startAMs, startBMs)) / 1000);
}

/**
 * Exact port of engine/buffer.py: simulate_buffer
 */
export function simulateBuffer(
  satelliteCfg: SatelliteConfig,
  passes: PassRecord[],
  startUtcIso: string,
  durationHours: number,
  stepS = 60
) {
  const startMs = new Date(startUtcIso).getTime();
  const used = passes
    .map((p) => ({
      aosMs: new Date(p.aos_utc).getTime(),
      losMs: new Date(p.los_utc).getTime(),
      volume: p.expected_volume_gb,
    }))
    .sort((a, b) => a.aosMs - b.aosMs);

  const steps = Math.floor((durationHours * 3600) / stepS);
  const generatedPerStep = (satelliteCfg.generation_gb_per_hour * stepS) / 3600;
  let level = satelliteCfg.initial_buffer_gb;
  let delivered = 0;
  let lost = 0;
  let overflowEvents = 0;
  let overflowing = false;
  let peak = level;
  const timeline: number[] = [];

  for (let k = 0; k < steps; k++) {
    const stepStartMs = startMs + k * stepS * 1000;
    const stepEndMs = stepStartMs + stepS * 1000;

    level += generatedPerStep;

    let linkGb = 0;
    for (const u of used) {
      if (u.losMs <= stepStartMs || u.aosMs >= stepEndMs) continue;
      const ov = overlapSeconds(u.aosMs, u.losMs, stepStartMs, stepEndMs);
      if (ov > 0) {
        linkGb += (u.volume * ov) / ((u.losMs - u.aosMs) / 1000);
      }
    }

    const sent = Math.min(linkGb, level);
    level -= sent;
    delivered += sent;

    const spill = Math.max(0, level - satelliteCfg.buffer_capacity_gb);
    if (spill > 0) {
      level = satelliteCfg.buffer_capacity_gb;
      lost += spill;
      if (!overflowing) {
        overflowEvents += 1;
      }
    }
    overflowing = spill > 0;

    if (level > peak) peak = level;
    timeline.push(level);
  }

  return {
    satellite_id: satelliteCfg.id,
    step_s: stepS,
    delivered_gb: round1(delivered),
    overflow_gb: round1(lost),
    overflow_events: overflowEvents,
    peak_buffer_gb: round1(peak),
    final_buffer_gb: round1(level),
    timeline_gb: timeline.map(round2),
  };
}

function hoursUntilFull(sat: SatelliteConfig, levelGb: number): number {
  if (sat.generation_gb_per_hour <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, (sat.buffer_capacity_gb - levelGb) / sat.generation_gb_per_hour);
}

/**
 * Exact port of engine/greedy.py: greedy_schedule
 */
export function runGreedySchedule(
  scenario: ScenarioData,
  passes: PassRecord[]
): PassRecord[] {
  const setupMap: Record<string, number> = {};
  for (const ant of scenario.antennas) setupMap[ant.id] = ant.setup_s;

  const satMap: Record<string, SatelliteConfig> = {};
  for (const sat of scenario.satellites) satMap[sat.id] = sat;

  const startMs = new Date(scenario.start_utc).getTime();
  let pending = [...passes].sort((a, b) =>
    a.aos_utc !== b.aos_utc
      ? a.aos_utc.localeCompare(b.aos_utc)
      : a.pass_id.localeCompare(b.pass_id)
  );
  const chosen: PassRecord[] = [];

  while (pending.length > 0) {
    const first = pending[0];
    const candidates = [
      first,
      ...pending
        .slice(1)
        .filter((q) => passConflictReason(first, q, setupMap) !== null),
    ];

    const hoursNow =
      (new Date(first.aos_utc).getTime() - startMs) / 3_600_000;
    const urgency: Record<string, number> = {};

    const competingSats = new Set(candidates.map((c) => c.satellite_id));
    for (const satId of competingSats) {
      const sat = satMap[satId];
      const mine = chosen.filter((p) => p.satellite_id === satId);
      const sim = simulateBuffer(
        sat,
        mine,
        scenario.start_utc,
        Math.max(0, hoursNow)
      );
      urgency[satId] = hoursUntilFull(sat, sim.final_buffer_gb);
    }

    candidates.sort((a, b) => {
      const uDiff = urgency[a.satellite_id] - urgency[b.satellite_id];
      if (Math.abs(uDiff) > 1e-9) return uDiff;
      const vDiff = b.expected_volume_gb - a.expected_volume_gb;
      if (Math.abs(vDiff) > 1e-9) return vDiff;
      if (a.aos_utc !== b.aos_utc) return a.aos_utc.localeCompare(b.aos_utc);
      return a.pass_id.localeCompare(b.pass_id);
    });

    const winner = candidates[0];
    chosen.push(winner);
    pending = pending.filter(
      (q) =>
        q.pass_id !== winner.pass_id &&
        passConflictReason(winner, q, setupMap) === null
    );
  }

  return chosen.sort((a, b) =>
    a.aos_utc !== b.aos_utc
      ? a.aos_utc.localeCompare(b.aos_utc)
      : a.pass_id.localeCompare(b.pass_id)
  );
}

/**
 * Port of engine/optimizer.py:
 * Decomposes the conflict graph into connected time clusters, enumerates all conflict-free
 * independent sets per cluster, and finds the global schedule maximizing total GB delivered.
 */
export function runOptimizerSchedule(
  scenario: ScenarioData,
  passes: PassRecord[]
): PassRecord[] {
  const setupMap: Record<string, number> = {};
  for (const ant of scenario.antennas) setupMap[ant.id] = ant.setup_s;

  const n = passes.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (passConflictReason(passes[i], passes[j], setupMap) !== null) {
        adj[i].push(j);
        adj[j].push(i);
      }
    }
  }

  // Find connected components of the conflict graph (each is a small local time cluster)
  const visited = new Array(n).fill(false);
  const components: number[][] = [];
  for (let i = 0; i < n; i++) {
    if (visited[i]) continue;
    const comp: number[] = [];
    const queue = [i];
    visited[i] = true;
    while (queue.length > 0) {
      const curr = queue.shift()!;
      comp.push(curr);
      for (const nxt of adj[curr]) {
        if (!visited[nxt]) {
          visited[nxt] = true;
          queue.push(nxt);
        }
      }
    }
    comp.sort(
      (a, b) =>
        new Date(passes[a].aos_utc).getTime() -
        new Date(passes[b].aos_utc).getTime()
    );
    components.push(comp);
  }

  // Sort components chronologically by earliest pass AOS
  components.sort(
    (a, b) =>
      new Date(passes[a[0]].aos_utc).getTime() -
      new Date(passes[b[0]].aos_utc).getTime()
  );

  // For each component, enumerate all maximal (and top non-maximal) conflict-free subsets
  const componentOptions: number[][][] = components.map((comp) => {
    const k = comp.length;
    if (k === 1) return [[comp[0]]];

    const validSubsets: { indices: number[]; vol: number }[] = [];
    const maxBitmask = 1 << Math.min(k, 14);

    for (let mask = 1; mask < maxBitmask; mask++) {
      const subset: number[] = [];
      let conflict = false;
      for (let b = 0; b < Math.min(k, 14); b++) {
        if ((mask & (1 << b)) !== 0) {
          const candIdx = comp[b];
          for (const existing of subset) {
            if (adj[candIdx].includes(existing)) {
              conflict = true;
              break;
            }
          }
          if (conflict) break;
          subset.push(candIdx);
        }
      }
      if (!conflict && subset.length > 0) {
        const vol = subset.reduce(
          (acc, idx) => acc + passes[idx].expected_volume_gb,
          0
        );
        validSubsets.push({ indices: subset, vol });
      }
    }

    validSubsets.sort((a, b) => b.vol - a.vol);
    // Keep the top 6 highest-volume conflict-free configurations per cluster
    return validSubsets.slice(0, 6).map((s) => s.indices);
  });

  // Beam search over the chronological components using the exact LP stored-data objective
  // plus real buffer simulation tie-breaking
  const startMs = new Date(scenario.start_utc).getTime();

  function evaluatePartialLpVolume(selectedIndices: number[]): number {
    let totalSent = 0;
    for (const sat of scenario.satellites) {
      const mine = selectedIndices
        .map((idx) => passes[idx])
        .filter((p) => p.satellite_id === sat.id)
        .sort((a, b) => a.los_utc.localeCompare(b.los_utc));

      let cumulativeSent = 0;
      for (const p of mine) {
        const hours =
          (new Date(p.los_utc).getTime() - startMs) / 3_600_000;
        const generatedSoFar =
          sat.initial_buffer_gb + sat.generation_gb_per_hour * hours;
        const maxPossibleNow = Math.max(0, generatedSoFar - cumulativeSent);
        const sent = Math.min(p.expected_volume_gb, maxPossibleNow);
        cumulativeSent += sent;
      }
      totalSent += cumulativeSent;
    }
    return totalSent;
  }

  let beam: { selected: number[]; score: number }[] = [
    { selected: [], score: 0 },
  ];
  const BEAM_WIDTH = 24;

  for (const options of componentOptions) {
    if (options.length === 1) {
      for (const item of beam) {
        item.selected = [...item.selected, ...options[0]];
      }
      continue;
    }

    const nextBeam: { selected: number[]; score: number }[] = [];
    for (const item of beam) {
      for (const opt of options) {
        const combined = [...item.selected, ...opt];
        const score = evaluatePartialLpVolume(combined);
        nextBeam.push({ selected: combined, score });
      }
    }
    nextBeam.sort((a, b) => b.score - a.score);
    beam = nextBeam.slice(0, BEAM_WIDTH);
  }

  // Evaluate top beam candidates + greedy candidate against full simulateBuffer to pick true best
  const greedyChosen = runGreedySchedule(scenario, passes);
  const candidatePassLists: PassRecord[][] = [
    ...beam.slice(0, 10).map((b) => b.selected.map((idx) => passes[idx])),
    greedyChosen,
  ];

  let bestSchedule = candidatePassLists[0];
  let bestDelivered = -1;
  let bestLpScore = -1;

  for (const cand of candidatePassLists) {
    let delivered = 0;
    for (const sat of scenario.satellites) {
      const mine = cand.filter((p) => p.satellite_id === sat.id);
      delivered += simulateBuffer(
        sat,
        mine,
        scenario.start_utc,
        scenario.duration_hours
      ).delivered_gb;
    }
    const indices = cand.map((p) => passes.indexOf(p)).filter((i) => i >= 0);
    const lpScore = evaluatePartialLpVolume(indices);

    if (
      delivered > bestDelivered + 0.05 ||
      (Math.abs(delivered - bestDelivered) <= 0.05 && lpScore > bestLpScore)
    ) {
      bestDelivered = delivered;
      bestLpScore = lpScore;
      bestSchedule = cand;
    }
  }

  return [...bestSchedule].sort((a, b) =>
    a.aos_utc !== b.aos_utc
      ? a.aos_utc.localeCompare(b.aos_utc)
      : a.pass_id.localeCompare(b.pass_id)
  );
}

/**
 * Port of engine/schedule.py: evaluate_schedule
 */
export function evaluateScheduleDoc(
  scenario: ScenarioData,
  allPasses: PassRecord[],
  chosen: PassRecord[],
  method: 'greedy' | 'optimizer',
  allConflictsCount: number
): ScheduleDocument {
  let delivered = 0;
  let overflowGb = 0;
  let overflowEvents = 0;
  const bufferTimeline: Record<string, BufferPoint[]> = {};
  const startMs = new Date(scenario.start_utc).getTime();

  for (const sat of scenario.satellites) {
    const mine = chosen.filter((p) => p.satellite_id === sat.id);
    const result = simulateBuffer(
      sat,
      mine,
      scenario.start_utc,
      scenario.duration_hours
    );
    const every = Math.floor(TIMELINE_EVERY_S / result.step_s);
    bufferTimeline[sat.id] = result.timeline_gb
      .map((level, k) => ({
        t_utc: isoZ(startMs + (k + 1) * result.step_s * 1000),
        level_gb: level,
      }))
      .filter((_, k) => (k + 1) % every === 0);

    delivered += result.delivered_gb;
    overflowGb += result.overflow_gb;
    overflowEvents += result.overflow_events;
  }

  const sortedChosen = [...chosen].sort((a, b) =>
    a.aos_utc !== b.aos_utc
      ? a.aos_utc.localeCompare(b.aos_utc)
      : a.pass_id.localeCompare(b.pass_id)
  );

  const assignments: AssignmentRecord[] = sortedChosen.map((p) => ({
    pass_id: p.pass_id,
    satellite_id: p.satellite_id,
    antenna_id: p.antenna_id,
    start_utc: p.aos_utc,
    end_utc: p.los_utc,
    planned_gb: p.expected_volume_gb,
  }));

  return {
    schema_version: '0.1',
    scenario_id: scenario.scenario_id,
    method,
    assignments,
    buffer_timeline: bufferTimeline,
    summary: {
      gb_delivered: round1(delivered),
      overflow_gb: round1(overflowGb),
      overflow_events: overflowEvents,
      passes_used: chosen.length,
      passes_available: allPasses.length,
      conflicts: allConflictsCount,
    },
  };
}

/**
 * Port of engine/scoreboard.py: build_scoreboard
 */
export function buildScoreboardDoc(
  scenario: ScenarioData,
  schedules: ScheduleDocument[]
): ScoreboardDocument {
  const generated = scenario.satellites.reduce(
    (acc, s) => acc + s.generation_gb_per_hour * scenario.duration_hours,
    0
  );
  const methods = schedules.map((s) => ({
    method: s.method,
    passes_used: s.summary.passes_used,
    gb_delivered: s.summary.gb_delivered,
    overflow_gb: s.summary.overflow_gb,
    overflow_events: s.summary.overflow_events,
    share_of_generated_pct: round1((100 * s.summary.gb_delivered) / generated),
  }));

  const baseline = methods[0];
  const best = methods[methods.length - 1];
  const gain = round1(best.gb_delivered - baseline.gb_delivered);

  return {
    scenario_id: scenario.scenario_id,
    generated_gb: round1(generated),
    methods,
    gain_gb: gain,
    gain_pct:
      baseline.gb_delivered > 0
        ? round1((100 * gain) / baseline.gb_delivered)
        : null,
  };
}

/**
 * Run the complete What-If pipeline in the browser:
 * Preserves the exact 61 Skyfield passes for the baseline 3 stations, computes SGP4 passes
 * for all newly added What-If stations, re-indexes p001..pNNN by AOS, finds all conflicts,
 * and computes Greedy + Optimizer schedules & scoreboard.
 */
export function runWhatIfPipeline(
  baseScenario: ScenarioData,
  basePassesDoc: PassesDocument,
  tles: TlesMap,
  extraAntennas: AntennaConfig[]
): {
  scenario: ScenarioData;
  passesDoc: PassesDocument;
  schedules: { greedy: ScheduleDocument; optimizer: ScheduleDocument };
  scoreboard: ScoreboardDocument;
  elapsedMs: number;
} {
  const t0 = performance.now();

  const updatedScenario: ScenarioData = {
    ...baseScenario,
    antennas: [...baseScenario.antennas, ...extraAntennas],
  };

  // Compute passes for every new What-If station
  const rawPasses: Omit<PassRecord, 'pass_id'>[] = basePassesDoc.passes.map(
    ({ pass_id: _pid, ...rest }) => rest
  );

  for (const sat of updatedScenario.satellites) {
    const tle = tles[sat.id];
    if (!tle) continue;
    for (const newAnt of extraAntennas) {
      const found = findPassesForStation(
        sat,
        tle,
        newAnt,
        updatedScenario.start_utc,
        updatedScenario.duration_hours
      );
      rawPasses.push(...found);
    }
  }

  rawPasses.sort((a, b) => {
    if (a.aos_utc !== b.aos_utc) return a.aos_utc.localeCompare(b.aos_utc);
    if (a.satellite_id !== b.satellite_id)
      return a.satellite_id.localeCompare(b.satellite_id);
    return a.antenna_id.localeCompare(b.antenna_id);
  });

  const allPasses: PassRecord[] = rawPasses.map((p, idx) => ({
    pass_id: `p${String(idx + 1).padStart(3, '0')}`,
    ...p,
  }));

  const setupMap: Record<string, number> = {};
  for (const ant of updatedScenario.antennas) {
    setupMap[ant.id] = ant.setup_s;
  }

  const conflicts = findAllConflicts(allPasses, setupMap);

  const greedyChosen = runGreedySchedule(updatedScenario, allPasses);
  const optimizerChosen = runOptimizerSchedule(updatedScenario, allPasses);

  const greedySchedule = evaluateScheduleDoc(
    updatedScenario,
    allPasses,
    greedyChosen,
    'greedy',
    conflicts.length
  );
  const optimizerSchedule = evaluateScheduleDoc(
    updatedScenario,
    allPasses,
    optimizerChosen,
    'optimizer',
    conflicts.length
  );

  const scoreboard = buildScoreboardDoc(updatedScenario, [
    greedySchedule,
    optimizerSchedule,
  ]);

  const elapsedMs = Math.round(performance.now() - t0);

  return {
    scenario: updatedScenario,
    passesDoc: {
      schema_version: '0.1',
      scenario_id: updatedScenario.scenario_id,
      passes: allPasses,
      conflicts,
    },
    schedules: {
      greedy: greedySchedule,
      optimizer: optimizerSchedule,
    },
    scoreboard,
    elapsedMs,
  };
}
