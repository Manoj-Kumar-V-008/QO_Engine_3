import * as satellite from 'satellite.js';
import type {
  AssignmentRecord,
  ConflictRecord,
  PassRecord,
  PassesDocument,
  ScenarioData,
  ScheduleDocument,
  ScheduleMethod,
  ScoreboardDocument,
  TlesMap,
} from '../../types/engine';

export interface WaterfallRow {
  method: ScheduleMethod;
  label: string;
  unitLabel: string;
  passesUsed: number;
  deliveredGb: number;
  overflowGb: number;
  storedGb: number;
  capturePct: number;
  deltaVsGreedyGb: number;
  deltaVsGreedyPct: number;
  overflowEvents: number;
}

export interface ValidatorRuleCheck {
  id: string;
  rule: string;
  detail: string;
  checkedCount: string;
  violations: number;
}

export interface ElevationSample {
  timeMs: number;
  utcLabel: string;
  svalbardS2bEl: number;
  kirunaS2bEl: number;
  materaS2bEl: number;
  svalbardS2aEl: number;
  svalbardRateMbps: number;
  kirunaRateMbps: number;
}

export interface LandingDataBundle {
  scenario: ScenarioData;
  tles: TlesMap;
  passesDoc: PassesDocument;
  scoreboard: ScoreboardDocument;
  schedules: Record<ScheduleMethod, ScheduleDocument>;
  waterfallRows: WaterfallRow[];
  validatorChecks: ValidatorRuleCheck[];
  totalViolations: number;
  conflictCounts: {
    total: number;
    sameSatellite: number;
    sameAntenna: number;
  };
  conflictWindowPasses: PassRecord[];
  conflictWindowPairs: ConflictRecord[];
  handoverChain: AssignmentRecord[];
  elevationProfile: ElevationSample[];
}

const RATE_STEPS: [number, number][] = [
  [30, 1.0],
  [20, 0.75],
  [10, 0.5],
  [0, 0.25],
];

export function rateMbpsForElevation(elDeg: number, peakMbps = 560): number {
  if (elDeg < 5) return 0;
  for (const [minEl, frac] of RATE_STEPS) {
    if (elDeg >= minEl) return peakMbps * frac;
  }
  return peakMbps * 0.25;
}

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

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function formatUtcHm(ms: number): string {
  const d = new Date(ms);
  return d.toISOString().slice(11, 19);
}

/**
 * Independent 5-rule physics verification directly on the scheduled Q Slice output.
 */
export function runIndependentValidator(
  scenario: ScenarioData,
  tles: TlesMap,
  schedule: ScheduleDocument,
  generatedGb: number
): ValidatorRuleCheck[] {
  const assignments = schedule.assignments;
  const antMap = Object.fromEntries(scenario.antennas.map((a) => [a.id, a]));
  const satMap = Object.fromEntries(scenario.satellites.map((s) => [s.id, s]));

  // Rule 1: One satellite per antenna + 120 s slew gap when switching spacecraft
  let antennaViolations = 0;
  let minSlewObservedS = Infinity;
  const byAnt: Record<string, AssignmentRecord[]> = {};
  for (const a of assignments) {
    (byAnt[a.antenna_id] ??= []).push(a);
  }
  for (const [antId, list] of Object.entries(byAnt)) {
    const setupS = antMap[antId]?.setup_s ?? 120;
    const sorted = [...list].sort(
      (x, y) => new Date(x.start_utc).getTime() - new Date(y.start_utc).getTime()
    );
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const gapS =
        (new Date(curr.start_utc).getTime() - new Date(prev.end_utc).getTime()) / 1000;
      if (gapS < 0) antennaViolations++;
      if (prev.satellite_id !== curr.satellite_id) {
        minSlewObservedS = Math.min(minSlewObservedS, gapS);
        if (gapS < setupS) antennaViolations++;
      }
    }
  }

  // Rule 2: One antenna per satellite at a time (no simultaneous dual-downlink)
  let satOverlapViolations = 0;
  let minHandoverGapS = Infinity;
  const bySat: Record<string, AssignmentRecord[]> = {};
  for (const a of assignments) {
    (bySat[a.satellite_id] ??= []).push(a);
  }
  for (const list of Object.values(bySat)) {
    const sorted = [...list].sort(
      (x, y) => new Date(x.start_utc).getTime() - new Date(y.start_utc).getTime()
    );
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const gapS =
        (new Date(curr.start_utc).getTime() - new Date(prev.end_utc).getTime()) / 1000;
      if (gapS < 0) satOverlapViolations++;
      if (prev.antenna_id !== curr.antenna_id && gapS >= 0) {
        minHandoverGapS = Math.min(minHandoverGapS, gapS);
      }
    }
  }

  // Rule 3: SGP4 elevation mask check (>= 5 deg midpoint visibility for every scheduled slot)
  let maskViolations = 0;
  let minMidElDeg = 90;
  const satrecs: Record<string, satellite.SatRec> = {};
  for (const sat of scenario.satellites) {
    const tle = tles[sat.id];
    if (tle) satrecs[sat.id] = satellite.twoline2satrec(tle.line1, tle.line2);
  }
  for (const a of assignments) {
    const ant = antMap[a.antenna_id];
    const satrec = satrecs[a.satellite_id];
    if (!ant || !satrec) continue;
    const obs = {
      longitude: (ant.lon_deg * Math.PI) / 180,
      latitude: (ant.lat_deg * Math.PI) / 180,
      height: (ant.alt_m || 0) / 1000,
    };
    const midMs =
      0.5 * (new Date(a.start_utc).getTime() + new Date(a.end_utc).getTime());
    const el = getElevationDeg(satrec, obs, midMs);
    minMidElDeg = Math.min(minMidElDeg, el);
    if (el < ant.min_elevation_deg - 0.5) maskViolations++;
  }

  // Rule 4: Onboard buffer bounds (0 <= buffer <= 300 GB at all 10-minute timeline points)
  let bufferViolations = 0;
  let timelinePoints = 0;
  for (const sat of scenario.satellites) {
    const cap = satMap[sat.id]?.buffer_capacity_gb ?? 300;
    const pts = schedule.buffer_timeline[sat.id] ?? [];
    for (const pt of pts) {
      timelinePoints++;
      if (pt.level_gb < -0.05 || pt.level_gb > cap + 0.05) {
        bufferViolations++;
      }
    }
  }

  // Rule 5: Mass conservation (delivered + overflow + final_stored === generated_gb)
  let finalStoredGb = 0;
  for (const sat of scenario.satellites) {
    const pts = schedule.buffer_timeline[sat.id] ?? [];
    finalStoredGb += pts.length > 0 ? pts[pts.length - 1].level_gb : 0;
  }
  const sumGb = round1(
    schedule.summary.gb_delivered + schedule.summary.overflow_gb + finalStoredGb
  );
  const conservationViolations = Math.abs(sumGb - generatedGb) > 0.5 ? 1 : 0;

  return [
    {
      id: 'dish-slew',
      rule: 'Single dish tracking & 120 s slew gap',
      detail: 'No antenna tracks two satellites simultaneously; cross-satellite retargeting preserves 120 s setup.',
      checkedCount: `${assignments.length} slots · min slew ${
        Number.isFinite(minSlewObservedS) ? `${Math.round(minSlewObservedS)} s` : '—'
      }`,
      violations: antennaViolations,
    },
    {
      id: 'sat-exclusivity',
      rule: 'Single X-band downlink per satellite',
      detail: 'Sentinel-2A and Sentinel-2B transmit to at most one ground station per 15-second slice.',
      checkedCount: `${assignments.length} slots · min handover ${
        Number.isFinite(minHandoverGapS) ? `${Math.round(minHandoverGapS)} s` : '—'
      }`,
      violations: satOverlapViolations,
    },
    {
      id: 'elevation-mask',
      rule: '5° minimum horizon mask (SGP4 verified)',
      detail: 'Every scheduled contact slice lies inside real CelesTrak SGP4 visibility above station terrain mask.',
      checkedCount: `${assignments.length} midpoints · min ${minMidElDeg.toFixed(1)}°`,
      violations: maskViolations,
    },
    {
      id: 'buffer-bounds',
      rule: 'Onboard solid-state buffer bounds (0–300 GB)',
      detail: 'Simulated 62.5 GB/h inflow and X-band drain never exceed 300 GB capacity or drop below zero.',
      checkedCount: `${timelinePoints} timeline samples`,
      violations: bufferViolations,
    },
    {
      id: 'mass-balance',
      rule: '24-hour data conservation check',
      detail: 'Delivered imagery + buffer overflow + end-of-horizon stored volume equals 3,000.0 GB generated.',
      checkedCount: `${schedule.summary.gb_delivered.toFixed(1)} + ${schedule.summary.overflow_gb.toFixed(
        1
      )} + ${round1(finalStoredGb).toFixed(1)} = ${sumGb.toFixed(1)} GB`,
      violations: conservationViolations,
    },
  ];
}

function buildElevationProfile(
  scenario: ScenarioData,
  tles: TlesMap
): ElevationSample[] {
  const s2bTle = tles['sentinel-2b'];
  const s2aTle = tles['sentinel-2a'];
  if (!s2bTle || !s2aTle) return [];

  const s2bRec = satellite.twoline2satrec(s2bTle.line1, s2bTle.line2);
  const s2aRec = satellite.twoline2satrec(s2aTle.line1, s2aTle.line2);

  const obsFor = (id: string) => {
    const a = scenario.antennas.find((x) => x.id === id)!;
    return {
      longitude: (a.lon_deg * Math.PI) / 180,
      latitude: (a.lat_deg * Math.PI) / 180,
      height: (a.alt_m || 0) / 1000,
    };
  };

  const obsSval = obsFor('svalbard-1');
  const obsKir = obsFor('kiruna-1');
  const obsMat = obsFor('matera-1');

  const startMs = Date.parse('2026-11-09T07:51:00Z');
  const endMs = Date.parse('2026-11-09T08:15:00Z');
  const samples: ElevationSample[] = [];

  for (let t = startMs; t <= endMs; t += 15_000) {
    const svalB = getElevationDeg(s2bRec, obsSval, t);
    const kirB = getElevationDeg(s2bRec, obsKir, t);
    const matB = getElevationDeg(s2bRec, obsMat, t);
    const svalA = getElevationDeg(s2aRec, obsSval, t);
    samples.push({
      timeMs: t,
      utcLabel: formatUtcHm(t),
      svalbardS2bEl: Math.max(0, round1(svalB)),
      kirunaS2bEl: Math.max(0, round1(kirB)),
      materaS2bEl: Math.max(0, round1(matB)),
      svalbardS2aEl: Math.max(0, round1(svalA)),
      svalbardRateMbps: rateMbpsForElevation(svalB),
      kirunaRateMbps: rateMbpsForElevation(kirB),
    });
  }
  return samples;
}

let cachedPromise: Promise<LandingDataBundle> | null = null;

export function loadLandingData(): Promise<LandingDataBundle> {
  if (cachedPromise) return cachedPromise;

  cachedPromise = Promise.all([
    fetch('/data/scenario.json').then((r) => r.json()),
    fetch('/data/tles.json').then((r) => r.json()),
    fetch('/data/passes.json').then((r) => r.json()),
    fetch('/data/scoreboard.json').then((r) => r.json()),
    fetch('/data/schedule_greedy.json').then((r) => r.json()),
    fetch('/data/schedule_optimizer.json').then((r) => r.json()),
    fetch('/data/schedule_qslice.json').then((r) => r.json()),
  ]).then(
    ([
      scenario,
      tles,
      passesDoc,
      scoreboard,
      greedy,
      optimizer,
      qslice,
    ]: [
      ScenarioData,
      TlesMap,
      PassesDocument,
      ScoreboardDocument,
      ScheduleDocument,
      ScheduleDocument,
      ScheduleDocument,
    ]) => {
      const schedules: Record<ScheduleMethod, ScheduleDocument> = {
        greedy,
        optimizer,
        qslice,
      };

      const generatedGb = scoreboard.generated_gb || 3000;
      const greedyMethod = scoreboard.methods.find((m) => m.method === 'greedy')!;

      const labels: Record<ScheduleMethod, { label: string; unit: string }> = {
        greedy: { label: 'Greedy', unit: 'Whole pass (earliest first)' },
        optimizer: { label: 'Whole-pass MILP', unit: 'Whole pass (global ILP)' },
        qslice: { label: 'Q Slice', unit: '15-second handover slices' },
      };

      const order: ScheduleMethod[] = ['greedy', 'optimizer', 'qslice'];
      const waterfallRows: WaterfallRow[] = order.map((m) => {
        const rec = scoreboard.methods.find((x) => x.method === m)!;
        const storedGb = round1(generatedGb - rec.gb_delivered - rec.overflow_gb);
        const deltaGb = round1(rec.gb_delivered - greedyMethod.gb_delivered);
        const deltaPct =
          greedyMethod.gb_delivered > 0
            ? round1((deltaGb / greedyMethod.gb_delivered) * 100)
            : 0;
        return {
          method: m,
          label: labels[m].label,
          unitLabel: labels[m].unit,
          passesUsed: rec.passes_used,
          deliveredGb: rec.gb_delivered,
          overflowGb: rec.overflow_gb,
          storedGb,
          capturePct: rec.share_of_generated_pct,
          deltaVsGreedyGb: deltaGb,
          deltaVsGreedyPct: deltaPct,
          overflowEvents: rec.overflow_events,
        };
      });

      const validatorChecks = runIndependentValidator(
        scenario,
        tles,
        qslice,
        generatedGb
      );
      const totalViolations = validatorChecks.reduce((s, c) => s + c.violations, 0);

      const conflicts = passesDoc.conflicts ?? [];
      const sameSatellite = conflicts.filter((c) => c.reason === 'same_satellite').length;
      const sameAntenna = conflicts.filter((c) => c.reason === 'same_antenna').length;

      const focusPassIds = new Set(['p011', 'p012', 'p013', 'p014', 'p015']);
      const conflictWindowPasses = passesDoc.passes.filter((p) =>
        focusPassIds.has(p.pass_id)
      );
      const conflictWindowPairs = conflicts.filter(
        (c) => focusPassIds.has(c.pass_a) && focusPassIds.has(c.pass_b)
      );

      const chainIds = new Set(['qs009', 'qs010', 'qs011', 'qs012', 'qs013', 'qs014']);
      const handoverChain = qslice.assignments.filter((a) => chainIds.has(a.pass_id));

      const elevationProfile = buildElevationProfile(scenario, tles);

      return {
        scenario,
        tles,
        passesDoc,
        scoreboard,
        schedules,
        waterfallRows,
        validatorChecks,
        totalViolations,
        conflictCounts: {
          total: conflicts.length,
          sameSatellite,
          sameAntenna,
        },
        conflictWindowPasses,
        conflictWindowPairs,
        handoverChain,
        elevationProfile,
      };
    }
  );

  return cachedPromise;
}
