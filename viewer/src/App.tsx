import { useEffect, useMemo, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import {
  Play,
  Pause,
  RotateCcw,
  Satellite,
  Compass,
  Radio,
  Zap,
  Eye,
  EyeOff,
  SkipForward,
  Sparkles,
  AlertTriangle,
  Database,
  Activity,
  ShieldAlert,
  HelpCircle,
} from 'lucide-react';
import type {
  ConflictRecord,
  PassRecord,
  PassesDocument,
  ScenarioData,
  ScheduleDocument,
  ScoreboardDocument,
  TlesMap,
} from './types/engine';
import {
  antennaCartesian,
  buildSatellitePositionProperty,
  computeFootprintRadiusMeters,
} from './lib/orbit';
import {
  buildConflictIndex,
  computeFleetTelemetry,
  ensureConflicts,
  getLoserConflictInfo,
} from './lib/telemetry';
import ScoreboardPanel from './components/ScoreboardPanel';
import AnalyticsDrawer from './components/AnalyticsDrawer';
import HowToReadModal from './components/HowToReadModal';

const SAT_COLORS: Record<string, string> = {
  'sentinel-2a': '#38bdf8', // Sky cyan
  'sentinel-2b': '#c084fc', // Neon purple
};

const ANT_COLORS: Record<string, string> = {
  'svalbard-1': '#34d399', // Emerald
  'kiruna-1': '#fbbf24',   // Amber
  'matera-1': '#f472b6',   // Pink
};

const SPEED_OPTIONS = [1, 10, 60, 180, 300, 600];

export default function App() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const satEntitiesRef = useRef<Record<string, Cesium.Entity>>({});
  const antEntitiesRef = useRef<Record<string, Cesium.Entity>>({});
  const ghostEntitiesRef = useRef<Cesium.Entity[]>([]);

  const [scenario, setScenario] = useState<ScenarioData | null>(null);
  const [tles, setTles] = useState<TlesMap | null>(null);
  const [passesDoc, setPassesDoc] = useState<PassesDocument | null>(null);
  const [schedules, setSchedules] = useState<{
    greedy: ScheduleDocument;
    optimizer: ScheduleDocument;
  } | null>(null);
  const [scoreboard, setScoreboard] = useState<ScoreboardDocument | null>(null);

  const [method, setMethod] = useState<'greedy' | 'optimizer'>('optimizer');
  const [showGhostWeb, setShowGhostWeb] = useState<boolean>(true);
  const [showFootprints, setShowFootprints] = useState<boolean>(true);
  const [showConflicts3D, setShowConflicts3D] = useState<boolean>(true);
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);

  const [currentTimeMs, setCurrentTimeMs] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [speed, setSpeed] = useState<number>(60);
  const [trackedTarget, setTrackedTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs used inside high-frequency Cesium CallbackProperties
  const methodRef = useRef<'greedy' | 'optimizer'>(method);
  const chosenSetsRef = useRef<{ greedy: Set<string>; optimizer: Set<string> }>({
    greedy: new Set(),
    optimizer: new Set(),
  });
  const showGhostWebRef = useRef<boolean>(showGhostWeb);
  const showConflicts3DRef = useRef<boolean>(showConflicts3D);

  useEffect(() => {
    methodRef.current = method;
  }, [method]);

  useEffect(() => {
    showGhostWebRef.current = showGhostWeb;
    for (const entity of ghostEntitiesRef.current) {
      entity.show = showGhostWeb;
    }
  }, [showGhostWeb]);

  useEffect(() => {
    showConflicts3DRef.current = showConflicts3D;
  }, [showConflicts3D]);

  useEffect(() => {
    if (!viewerRef.current || !scenario) return;
    for (const ant of scenario.antennas) {
      const footprintEntity = viewerRef.current.entities.getById(`footprint-${ant.id}`);
      const highElEntity = viewerRef.current.entities.getById(`footprint-high-${ant.id}`);
      if (footprintEntity) footprintEntity.show = showFootprints;
      if (highElEntity) highElEntity.show = showFootprints;
    }
  }, [showFootprints, scenario]);

  // 1. Load all 6 static JSON files
  useEffect(() => {
    Promise.all([
      fetch('/data/scenario.json').then((r) => {
        if (!r.ok) throw new Error('Missing /data/scenario.json');
        return r.json();
      }),
      fetch('/data/tles.json').then((r) => {
        if (!r.ok) throw new Error('Missing /data/tles.json');
        return r.json();
      }),
      fetch('/data/passes.json').then((r) => {
        if (!r.ok) throw new Error('Missing /data/passes.json');
        return r.json();
      }),
      fetch('/data/schedule_greedy.json').then((r) => {
        if (!r.ok) throw new Error('Missing /data/schedule_greedy.json');
        return r.json();
      }),
      fetch('/data/schedule_optimizer.json').then((r) => {
        if (!r.ok) throw new Error('Missing /data/schedule_optimizer.json');
        return r.json();
      }),
      fetch('/data/scoreboard.json').then((r) => {
        if (!r.ok) throw new Error('Missing /data/scoreboard.json');
        return r.json();
      }),
    ])
      .then(
        ([
          scenarioData,
          tlesData,
          passesData,
          greedyData,
          optimizerData,
          scoreboardData,
        ]: [
          ScenarioData,
          TlesMap,
          PassesDocument,
          ScheduleDocument,
          ScheduleDocument,
          ScoreboardDocument,
        ]) => {
          setScenario(scenarioData);
          setTles(tlesData);
          setPassesDoc(passesData);
          setSchedules({ greedy: greedyData, optimizer: optimizerData });
          setScoreboard(scoreboardData);
          chosenSetsRef.current = {
            greedy: new Set(greedyData.assignments.map((a) => a.pass_id)),
            optimizer: new Set(optimizerData.assignments.map((a) => a.pass_id)),
          };
          setCurrentTimeMs(new Date(scenarioData.start_utc).getTime());
        }
      )
      .catch((err) => setError(err.message));
  }, []);

  // Build conflict structures (63 conflict pairs)
  const conflictsList = useMemo<ConflictRecord[]>(() => {
    if (!passesDoc || !scenario) return [];
    return ensureConflicts(passesDoc.passes, passesDoc.conflicts, scenario);
  }, [passesDoc, scenario]);

  const conflictIndex = useMemo(() => buildConflictIndex(conflictsList), [conflictsList]);

  const passMap = useMemo(() => {
    const map: Record<string, PassRecord> = {};
    if (!passesDoc) return map;
    for (const p of passesDoc.passes) {
      map[p.pass_id] = p;
    }
    return map;
  }, [passesDoc]);

  // 2. Initialize Cesium Globe + Satellites + Antennas + Ghost Web + Chosen Beams + Red Conflict Beams
  useEffect(() => {
    if (!containerRef.current || !scenario || !tles || !passesDoc || !schedules) return;

    const startJd = Cesium.JulianDate.fromIso8601(scenario.start_utc);
    const stopJd = Cesium.JulianDate.addHours(
      startJd,
      scenario.duration_hours,
      new Cesium.JulianDate()
    );

    const clock = new Cesium.Clock({
      startTime: startJd,
      currentTime: startJd.clone(),
      stopTime: stopJd,
      clockRange: Cesium.ClockRange.LOOP_STOP,
      clockStep: Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER,
      multiplier: 60,
      shouldAnimate: true,
    });

    const viewer = new Cesium.Viewer(containerRef.current, {
      clockViewModel: new Cesium.ClockViewModel(clock),
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      baseLayer: new Cesium.ImageryLayer(
        new Cesium.UrlTemplateImageryProvider({
          url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          credit: 'Esri World Imagery',
        })
      ),
    });

    viewer.scene.globe.enableLighting = true;
    if (viewer.scene.skyAtmosphere) {
      viewer.scene.skyAtmosphere.hueShift = -0.05;
      viewer.scene.skyAtmosphere.brightnessShift = -0.15;
    }
    viewerRef.current = viewer;

    // A. Satellites
    const satPositions: Record<string, Cesium.SampledPositionProperty> = {};
    satEntitiesRef.current = {};

    for (const sat of scenario.satellites) {
      const tle = tles[sat.id];
      if (!tle) continue;

      const positionProp = buildSatellitePositionProperty(
        tle,
        scenario.start_utc,
        scenario.duration_hours
      );
      satPositions[sat.id] = positionProp;

      const cssColor = SAT_COLORS[sat.id] ?? '#38bdf8';
      const color = Cesium.Color.fromCssColorString(cssColor);

      const entity = viewer.entities.add({
        id: `sat-${sat.id}`,
        name: sat.id.toUpperCase(),
        availability: new Cesium.TimeIntervalCollection([
          new Cesium.TimeInterval({ start: startJd, stop: stopJd }),
        ]),
        position: positionProp,
        point: {
          pixelSize: 12,
          color,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
        },
        label: {
          text: sat.id.toUpperCase(),
          font: '700 12px ui-monospace, SFMono-Regular, monospace',
          fillColor: color,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -18),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 4.5e7),
        },
        path: {
          resolution: 30,
          leadTime: 2800,
          trailTime: 2800,
          width: 1.6,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.18,
            color: color.withAlpha(0.65),
          }),
        },
      });

      satEntitiesRef.current[sat.id] = entity;
    }

    // B. Ground Stations + Visibility Rings
    const antPositions: Record<string, Cesium.Cartesian3> = {};
    antEntitiesRef.current = {};

    for (const ant of scenario.antennas) {
      const pos = antennaCartesian(ant);
      antPositions[ant.id] = pos;

      const cssColor = ANT_COLORS[ant.id] ?? '#34d399';
      const color = Cesium.Color.fromCssColorString(cssColor);
      const outerRadius = computeFootprintRadiusMeters(ant.min_elevation_deg, 786);
      const innerFullRateRadius = computeFootprintRadiusMeters(30.0, 786);

      const dishEntity = viewer.entities.add({
        id: `ant-${ant.id}`,
        name: `${ant.name} (${ant.id})`,
        position: pos,
        point: {
          pixelSize: 10,
          color,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
        },
        label: {
          text: `📡 ${ant.name.toUpperCase()}`,
          font: '700 11px ui-monospace, SFMono-Regular, monospace',
          fillColor: color,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, 16),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3.5e7),
        },
      });
      antEntitiesRef.current[ant.id] = dishEntity;

      viewer.entities.add({
        id: `footprint-${ant.id}`,
        position: Cesium.Cartesian3.fromDegrees(ant.lon_deg, ant.lat_deg, 0),
        show: showFootprints,
        ellipse: {
          semiMajorAxis: outerRadius,
          semiMinorAxis: outerRadius,
          height: 0,
          material: color.withAlpha(0.07),
          outline: true,
          outlineColor: color.withAlpha(0.55),
          outlineWidth: 1.5,
        },
      });

      viewer.entities.add({
        id: `footprint-high-${ant.id}`,
        position: Cesium.Cartesian3.fromDegrees(ant.lon_deg, ant.lat_deg, 0),
        show: showFootprints,
        ellipse: {
          semiMajorAxis: innerFullRateRadius,
          semiMinorAxis: innerFullRateRadius,
          height: 0,
          fill: false,
          outline: true,
          outlineColor: color.withAlpha(0.25),
          outlineWidth: 1,
        },
      });
    }

    // C. Passes: Ghost Web + Chosen Laser Beams + Red Conflict Loser Beams & 3D Midpoint Tags
    ghostEntitiesRef.current = [];
    const crimsonRed = Cesium.Color.fromCssColorString('#ef4444');

    for (const p of passesDoc.passes) {
      const antPos = antPositions[p.antenna_id];
      const satProp = satPositions[p.satellite_id];
      if (!antPos || !satProp) continue;

      const aosJd = Cesium.JulianDate.fromIso8601(p.aos_utc);
      const losJd = Cesium.JulianDate.fromIso8601(p.los_utc);
      const midSeconds = Cesium.JulianDate.secondsDifference(losJd, aosJd) / 2;
      const midJd = Cesium.JulianDate.addSeconds(aosJd, midSeconds, new Cesium.JulianDate());

      const peakSatPos = satProp.getValue(midJd);
      const satColor = Cesium.Color.fromCssColorString(SAT_COLORS[p.satellite_id] ?? '#38bdf8');

      if (peakSatPos) {
        const ghostEntity = viewer.entities.add({
          id: `ghost-${p.pass_id}`,
          show: showGhostWebRef.current,
          polyline: {
            positions: [antPos, peakSatPos],
            width: 1.1,
            arcType: Cesium.ArcType.NONE,
            material: new Cesium.ColorMaterialProperty(
              new Cesium.CallbackProperty(() => {
                const isChosen = chosenSetsRef.current[methodRef.current].has(p.pass_id);
                return isChosen
                  ? satColor.withAlpha(0.22)
                  : Cesium.Color.SLATEGRAY.withAlpha(0.11);
              }, false)
            ),
          },
        });
        ghostEntitiesRef.current.push(ghostEntity);
      }

      viewer.entities.add({
        id: `beam-chosen-${p.pass_id}`,
        availability: new Cesium.TimeIntervalCollection([
          new Cesium.TimeInterval({ start: aosJd, stop: losJd }),
        ]),
        polyline: {
          positions: new Cesium.CallbackProperty((time?: Cesium.JulianDate) => {
            if (!time) return [];
            const isChosen = chosenSetsRef.current[methodRef.current].has(p.pass_id);
            if (!isChosen) return [];
            const currentSatPos = satProp.getValue(time);
            return currentSatPos ? [antPos, currentSatPos] : [];
          }, false),
          width: 7,
          arcType: Cesium.ArcType.NONE,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.35,
            taperPower: 0.8,
            color: satColor,
          }),
        },
      });

      const findConflictWinner = () => {
        const activeChosen = chosenSetsRef.current[methodRef.current];
        if (activeChosen.has(p.pass_id)) return null;
        const neighbors = conflictIndex[p.pass_id] ?? [];
        for (const n of neighbors) {
          if (activeChosen.has(n.otherPassId)) {
            return n;
          }
        }
        return null;
      };

      viewer.entities.add({
        id: `beam-conflict-${p.pass_id}`,
        availability: new Cesium.TimeIntervalCollection([
          new Cesium.TimeInterval({ start: aosJd, stop: losJd }),
        ]),
        polyline: {
          positions: new Cesium.CallbackProperty((time?: Cesium.JulianDate) => {
            if (!time || !showConflicts3DRef.current) return [];
            const conflictWin = findConflictWinner();
            if (!conflictWin) return [];
            const currentSatPos = satProp.getValue(time);
            return currentSatPos ? [antPos, currentSatPos] : [];
          }, false),
          width: 3.5,
          arcType: Cesium.ArcType.NONE,
          material: new Cesium.PolylineDashMaterialProperty({
            color: crimsonRed.withAlpha(0.92),
            dashLength: 16,
          }),
        },
      });

      viewer.entities.add({
        id: `label-conflict-${p.pass_id}`,
        availability: new Cesium.TimeIntervalCollection([
          new Cesium.TimeInterval({ start: aosJd, stop: losJd }),
        ]),
        position: new Cesium.CallbackProperty((time?: Cesium.JulianDate) => {
          if (!time) return Cesium.Cartesian3.ZERO;
          const currentSatPos = satProp.getValue(time);
          if (!currentSatPos) return antPos;
          return Cesium.Cartesian3.midpoint(antPos, currentSatPos, new Cesium.Cartesian3());
        }, false) as unknown as Cesium.PositionProperty,
        label: {
          show: new Cesium.CallbackProperty(() => {
            if (!showConflicts3DRef.current) return false;
            return findConflictWinner() !== null;
          }, false),
          text: new Cesium.CallbackProperty(() => {
            const win = findConflictWinner();
            if (!win) return '';
            const tag =
              win.reason === 'same_antenna' ? 'SAME_ANTENNA (dish busy)' : 'SAME_SATELLITE (tx busy)';
            return `⚠ DROPPED ${p.pass_id.toUpperCase()}: ${tag} → ${win.otherPassId.toUpperCase()}`;
          }, false),
          font: '700 11px ui-monospace, SFMono-Regular, monospace',
          fillColor: Cesium.Color.fromCssColorString('#fca5a5'),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('#450a0a').withAlpha(0.85),
          backgroundPadding: new Cesium.Cartesian2(7, 4),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2.8e7),
        },
      });
    }

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(18.0, 58.0, 1.65e7),
      duration: 0,
    });

    let lastReactSync = 0;
    const removeTickListener = viewer.clock.onTick.addEventListener((c) => {
      const now = performance.now();
      if (now - lastReactSync > 100) {
        lastReactSync = now;
        setCurrentTimeMs(Cesium.JulianDate.toDate(c.currentTime).getTime());
        setIsPlaying(c.shouldAnimate);
      }
    });

    return () => {
      removeTickListener();
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [scenario, tles, passesDoc, schedules, conflictIndex]);

  // Derived schedules & telemetry
  const chosenSet = useMemo(() => {
    if (!schedules) return new Set<string>();
    return new Set(schedules[method].assignments.map((a) => a.pass_id));
  }, [schedules, method]);

  const diffPasses = useMemo(() => {
    if (!schedules || !passesDoc) return [];
    const gSet = new Set(schedules.greedy.assignments.map((a) => a.pass_id));
    const oSet = new Set(schedules.optimizer.assignments.map((a) => a.pass_id));
    return passesDoc.passes.filter((p) => gSet.has(p.pass_id) !== oSet.has(p.pass_id));
  }, [schedules, passesDoc]);

  const activePassesNow = useMemo(() => {
    if (!passesDoc || !currentTimeMs) return [];
    return passesDoc.passes.filter((p) => {
      const aos = new Date(p.aos_utc).getTime();
      const los = new Date(p.los_utc).getTime();
      return currentTimeMs >= aos && currentTimeMs <= los;
    });
  }, [passesDoc, currentTimeMs]);

  const fleetTelemetry = useMemo(() => {
    if (!scenario || !schedules || !currentTimeMs) return null;
    return computeFleetTelemetry(scenario, schedules[method], currentTimeMs);
  }, [scenario, schedules, method, currentTimeMs]);

  const otherFleetTelemetry = useMemo(() => {
    if (!scenario || !schedules || !currentTimeMs) return null;
    const other = method === 'optimizer' ? 'greedy' : 'optimizer';
    return computeFleetTelemetry(scenario, schedules[other], currentTimeMs);
  }, [scenario, schedules, method, currentTimeMs]);

  const conflictLoserPasses = useMemo(() => {
    if (!passesDoc) return [];
    return passesDoc.passes.filter((p) => {
      if (chosenSet.has(p.pass_id)) return false;
      const neighbors = conflictIndex[p.pass_id] ?? [];
      return neighbors.some((n) => chosenSet.has(n.otherPassId));
    });
  }, [passesDoc, chosenSet, conflictIndex]);

  const conflictCountsByReason = useMemo(() => {
    let sameAntenna = 0;
    let sameSatellite = 0;
    for (const c of conflictsList) {
      if (c.reason === 'same_antenna') sameAntenna++;
      else sameSatellite++;
    }
    return { total: conflictsList.length, sameAntenna, sameSatellite };
  }, [conflictsList]);

  // Controls
  const togglePlay = () => {
    if (!viewerRef.current) return;
    viewerRef.current.clock.shouldAnimate = !viewerRef.current.clock.shouldAnimate;
    setIsPlaying(viewerRef.current.clock.shouldAnimate);
  };

  const changeSpeed = (newSpeed: number) => {
    if (!viewerRef.current) return;
    viewerRef.current.clock.multiplier = newSpeed;
    setSpeed(newSpeed);
  };

  const handleScrub = (ms: number) => {
    if (!viewerRef.current) return;
    viewerRef.current.clock.currentTime = Cesium.JulianDate.fromDate(new Date(ms));
    setCurrentTimeMs(ms);
  };

  const jumpToNextPass = (mode: 'beam' | 'diff' | 'conflict') => {
    if (!passesDoc) return;
    let pool: PassRecord[] = [];
    if (mode === 'diff') pool = diffPasses;
    else if (mode === 'conflict') pool = conflictLoserPasses;
    else pool = passesDoc.passes.filter((p) => chosenSet.has(p.pass_id));

    if (pool.length === 0) return;
    const next =
      pool.find((p) => new Date(p.aos_utc).getTime() > currentTimeMs + 5000) ?? pool[0];
    const targetMs = new Date(next.aos_utc).getTime() + 20000;
    handleScrub(targetMs);
  };

  const handleTrackEntity = (targetId: string | null) => {
    if (!viewerRef.current) return;
    if (!targetId) {
      viewerRef.current.trackedEntity = undefined;
      setTrackedTarget(null);
      viewerRef.current.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(18.0, 58.0, 1.65e7),
        duration: 1.2,
      });
      return;
    }

    if (targetId.startsWith('sat-')) {
      const satId = targetId.replace('sat-', '');
      const entity = satEntitiesRef.current[satId];
      if (entity) {
        viewerRef.current.trackedEntity = entity;
        setTrackedTarget(targetId);
      }
    } else if (targetId.startsWith('ant-')) {
      const antId = targetId.replace('ant-', '');
      const ant = scenario?.antennas.find((a) => a.id === antId);
      if (ant) {
        viewerRef.current.trackedEntity = undefined;
        setTrackedTarget(targetId);
        viewerRef.current.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(ant.lon_deg, ant.lat_deg - 12.0, 4.2e6),
          orientation: {
            heading: 0,
            pitch: Cesium.Math.toRadians(-62),
            roll: 0,
          },
          duration: 1.2,
        });
      }
    }
  };

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-red-400 p-6">
        <div className="max-w-lg rounded-xl border border-red-500/30 bg-slate-900/90 p-6">
          <h2 className="text-lg font-bold text-white mb-2">Data Contract Missing</h2>
          <p className="text-sm font-mono mb-4">{error}</p>
          <p className="text-xs text-slate-400">
            Run from project root:{' '}
            <code className="text-sky-400">python -m engine.run data/scenario.json</code>
          </p>
        </div>
      </div>
    );
  }

  const isLoading = !scenario || !tles || !passesDoc || !schedules;
  const startMs = scenario ? new Date(scenario.start_utc).getTime() : 0;
  const endMs = scenario ? startMs + scenario.duration_hours * 3600 * 1000 : 100;
  const isoClock = currentTimeMs
    ? new Date(currentTimeMs).toISOString().replace(/\.\d{3}Z$/, ' UTC')
    : '';
  const activeSchedule = schedules ? schedules[method] : null;
  const liveDeltaGb =
    fleetTelemetry && otherFleetTelemetry
      ? fleetTelemetry.totalDeliveredSoFarGb - otherFleetTelemetry.totalDeliveredSoFarGb
      : 0;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 select-none">
      {/* Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 text-slate-100">
          <div className="h-10 w-10 rounded-full border-2 border-sky-400 border-t-transparent animate-spin mb-4" />
          <div className="font-mono text-sm font-bold uppercase tracking-widest text-sky-400">
            Initializing QO Engine 3 Ephemeris...
          </div>
        </div>
      )}

      {/* 3D Cesium Canvas */}
      <div ref={containerRef} className="w-full h-full" />

      {/* LEFT HUD COLUMN: Mission Clock + Ground Stations + Data Trail + Live Buffers */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 w-[420px] max-w-[92vw]">
        {/* 1. Mission Header & Camera Lock */}
        <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-800/90 bg-slate-950/85 px-3.5 py-2.5 backdrop-blur-md shadow-xl">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-sky-400">
                QO Engine 3 • Mission Control
              </span>
            </div>
            <div className="mt-0.5 font-mono text-base font-bold tracking-tight text-white">
              {isoClock || 'Loading ephemeris...'}
            </div>
          </div>

          {scenario && (
            <div className="flex items-center gap-1 border-l border-slate-800 pl-2.5">
              {scenario.satellites.map((sat) => {
                const targetKey = `sat-${sat.id}`;
                const active = trackedTarget === targetKey;
                return (
                  <button
                    key={sat.id}
                    onClick={() => handleTrackEntity(active ? null : targetKey)}
                    className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-mono font-medium transition cursor-pointer ${
                      active
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-400/50'
                        : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                    }`}
                  >
                    <Satellite className="w-3.5 h-3.5" style={{ color: SAT_COLORS[sat.id] }} />
                    {sat.id.replace('sentinel-', 'S')}
                  </button>
                );
              })}
              <button
                onClick={() => handleTrackEntity(null)}
                title="Reset Globe View"
                className="rounded-lg bg-slate-900 p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-800 cursor-pointer"
              >
                <Compass className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsHelpOpen(true)}
                title="How to read this scene"
                className="rounded-lg bg-sky-500/15 p-1.5 text-sky-300 hover:bg-sky-500/25 border border-sky-500/40 cursor-pointer"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* 2. Ground Stations & 3D Layer Toggles */}
        {scenario && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-800/80 bg-slate-950/80 px-3 py-2 backdrop-blur-md">
            {scenario.antennas.map((ant) => {
              const targetKey = `ant-${ant.id}`;
              const active = trackedTarget === targetKey;
              return (
                <button
                  key={ant.id}
                  onClick={() => handleTrackEntity(active ? null : targetKey)}
                  className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-mono transition cursor-pointer ${
                    active
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/50'
                      : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  <Radio className="w-3 h-3" style={{ color: ANT_COLORS[ant.id] }} />
                  {ant.name}
                </button>
              );
            })}

            <div className="h-4 w-px bg-slate-800 mx-0.5" />

            <button
              onClick={() => setShowGhostWeb((v) => !v)}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-mono transition cursor-pointer border ${
                showGhostWeb
                  ? 'bg-slate-800 text-sky-300 border-sky-500/40'
                  : 'bg-slate-900 text-slate-500 border-slate-800'
              }`}
            >
              {showGhostWeb ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              61 Ghosts
            </button>

            <button
              onClick={() => setShowConflicts3D((v) => !v)}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-mono transition cursor-pointer border ${
                showConflicts3D
                  ? 'bg-red-950/70 text-red-300 border-red-500/50'
                  : 'bg-slate-900 text-slate-500 border-slate-800'
              }`}
            >
              <ShieldAlert className="w-3 h-3" />
              Conflicts ({conflictCountsByReason.total})
            </button>
          </div>
        )}

        {/* 3. Live Ticking Data Trail (GB Delivered So Far Counter) */}
        {fleetTelemetry && activeSchedule && (
          <div className="rounded-xl border border-slate-800/90 bg-slate-950/85 p-3 backdrop-blur-md shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-slate-400">
                <Database className="w-3.5 h-3.5 text-emerald-400" />
                Data Trail • Downlinked So Far
              </div>
              {fleetTelemetry.activeBeamCount > 0 ? (
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-300 border border-emerald-500/40 animate-pulse">
                  <Activity className="w-3 h-3" />
                  LIVE +{fleetTelemetry.activeDownlinkMbps.toFixed(0)} Mbps
                </span>
              ) : (
                <span className="text-[11px] font-mono text-slate-500">Idle (Collecting)</span>
              )}
            </div>

            <div className="mt-1.5 flex items-baseline justify-between">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-2xl font-extrabold tracking-tight text-white">
                  {fleetTelemetry.totalDeliveredSoFarGb.toFixed(1)}
                </span>
                <span className="font-mono text-xs font-semibold text-emerald-400">
                  / {fleetTelemetry.totalPlannedGb.toFixed(0)} GB
                </span>
              </div>

              <div className="text-right font-mono text-[11px]">
                <span
                  className={
                    liveDeltaGb > 0.05
                      ? 'text-emerald-400 font-semibold'
                      : liveDeltaGb < -0.05
                      ? 'text-amber-400'
                      : 'text-slate-400'
                  }
                >
                  {liveDeltaGb >= 0 ? `+${liveDeltaGb.toFixed(1)}` : liveDeltaGb.toFixed(1)} GB vs{' '}
                  {method === 'optimizer' ? 'greedy' : 'optimizer'}
                </span>
                <div className="text-[10px] text-red-400/90">
                  Spilled: {fleetTelemetry.totalOverflowSoFarGb.toFixed(0)} GB
                </div>
              </div>
            </div>

            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-900 border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-all duration-150"
                style={{
                  width: `${Math.min(
                    100,
                    (fleetTelemetry.totalDeliveredSoFarGb /
                      Math.max(1, fleetTelemetry.totalPlannedGb)) *
                      100
                  )}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* 4. Live Onboard Buffer Gauges per Satellite */}
        {scenario && fleetTelemetry && (
          <div className="rounded-xl border border-slate-800/90 bg-slate-950/85 p-3 backdrop-blur-md shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                Onboard Storage Buffers (300 GB Cap)
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                +62.5 GB/h per sat
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {scenario.satellites.map((sat) => {
                const t = fleetTelemetry.satellites[sat.id];
                if (!t) return null;
                const satColor = SAT_COLORS[sat.id] ?? '#38bdf8';

                return (
                  <div
                    key={sat.id}
                    className={`rounded-lg border p-2 transition ${
                      t.isOverflowing
                        ? 'border-red-500 bg-red-950/45 shadow-[0_0_15px_rgba(239,68,68,0.25)]'
                        : t.isDraining
                        ? 'border-emerald-500/50 bg-emerald-950/20'
                        : 'border-slate-800 bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: satColor }}
                        />
                        <span className="font-bold uppercase text-white">{sat.id}</span>
                        {t.isOverflowing && (
                          <span className="flex items-center gap-1 rounded bg-red-500 px-1.5 py-0.5 text-[9px] font-extrabold text-slate-950 animate-pulse">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            OVERFLOWING
                          </span>
                        )}
                        {!t.isOverflowing && t.isDraining && (
                          <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300 border border-emerald-500/40">
                            DOWNLINKING
                          </span>
                        )}
                      </div>

                      <div className="font-bold text-white">
                        {t.levelGb.toFixed(1)}{' '}
                        <span className="text-slate-400 font-normal">/ {t.capacityGb} GB</span>
                      </div>
                    </div>

                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-950 border border-slate-800">
                      <div
                        className={`h-full transition-all duration-150 ${
                          t.isOverflowing
                            ? 'bg-red-500 animate-pulse'
                            : t.fillPct > 85
                            ? 'bg-amber-400'
                            : t.isDraining
                            ? 'bg-emerald-400'
                            : 'bg-sky-400'
                        }`}
                        style={{ width: `${t.fillPct}%` }}
                      />
                    </div>

                    <div className="mt-1 flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span>
                        Sent: <strong className="text-slate-200">{t.deliveredSoFarGb.toFixed(1)} GB</strong>
                      </span>
                      <span className={t.overflowSoFarGb > 0 ? 'text-red-400' : 'text-slate-500'}>
                        Lost: {t.overflowSoFarGb.toFixed(1)} GB
                      </span>
                      <span>
                        Net: {t.netRateGbPerHour >= 0 ? '+' : ''}
                        {t.netRateGbPerHour.toFixed(0)} GB/h
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* RIGHT HUD COLUMN: Scoreboard Panel + Scheduler Switcher + Live Conflict Monitor */}
      {schedules && activeSchedule && (
        <div className="absolute top-4 right-4 z-10 flex w-96 max-w-[92vw] flex-col gap-2">
          {/* 1. Scoreboard Benchmark Table (with +4 GB gain & required model note) */}
          {scoreboard && (
            <ScoreboardPanel
              scoreboard={scoreboard}
              activeMethod={method}
              onSelectMethod={setMethod}
            />
          )}

          {/* 2. Quick-Jump Navigation Bar */}
          <div className="rounded-xl border border-slate-800/90 bg-slate-950/85 p-2.5 backdrop-blur-md shadow-xl">
            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={() => jumpToNextPass('beam')}
                className="flex items-center justify-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1.5 text-[11px] font-mono text-sky-300 hover:bg-slate-800 transition cursor-pointer"
              >
                <SkipForward className="w-3.5 h-3.5" />
                Next Beam
              </button>
              <button
                onClick={() => jumpToNextPass('conflict')}
                className="flex items-center justify-center gap-1 rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-[11px] font-mono text-red-300 hover:bg-red-500/20 transition cursor-pointer"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                Next Clash
              </button>
              <button
                onClick={() => jumpToNextPass('diff')}
                className="flex items-center justify-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] font-mono text-amber-300 hover:bg-amber-500/20 transition cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5" />
                Diff ({diffPasses.length})
              </button>
            </div>
          </div>

          {/* 3. Live Visibility & Conflict Monitor */}
          <div className="rounded-xl border border-slate-800/90 bg-slate-950/85 p-3 backdrop-blur-md shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                Live Visibility & Conflict Monitor
              </span>
              <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-mono text-slate-300 border border-slate-800">
                {conflictCountsByReason.sameSatellite} sat • {conflictCountsByReason.sameAntenna} dish
              </span>
            </div>

            {activePassesNow.length === 0 ? (
              <div className="rounded-lg border border-slate-800/60 bg-slate-900/50 px-3 py-2.5 text-xs font-mono text-slate-500 text-center">
                No passes in visibility window right now. Click &ldquo;Next Clash&rdquo; or &ldquo;Next Beam&rdquo;.
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-[210px] overflow-y-auto pr-0.5">
                {activePassesNow.map((p) => {
                  const isChosen = chosenSet.has(p.pass_id);
                  const otherMethod = method === 'optimizer' ? 'greedy' : 'optimizer';
                  const chosenByOther = schedules[otherMethod].assignments.some(
                    (a) => a.pass_id === p.pass_id
                  );
                  const conflictInfo = getLoserConflictInfo(
                    p,
                    chosenSet,
                    passMap,
                    conflictIndex,
                    currentTimeMs
                  );

                  return (
                    <div
                      key={p.pass_id}
                      className={`rounded-lg border px-2.5 py-2 text-xs font-mono transition ${
                        isChosen
                          ? 'border-sky-500/60 bg-sky-500/10 text-white'
                          : conflictInfo
                          ? 'border-red-500/60 bg-red-950/35 text-red-200'
                          : 'border-slate-800 bg-slate-900/60 text-slate-400'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold">
                          {p.pass_id.toUpperCase()} • {p.satellite_id} → {p.antenna_id}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                            isChosen
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : conflictInfo
                              ? 'bg-red-500/25 text-red-300 border border-red-500/50'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {isChosen
                            ? 'WINNER (BEAM ON)'
                            : conflictInfo
                            ? 'CONFLICT LOSER'
                            : 'SKIPPED'}
                        </span>
                      </div>

                      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-300">
                        <span>Max El: {p.max_elevation_deg}°</span>
                        <span>Expected: {p.expected_volume_gb} GB</span>
                      </div>

                      {conflictInfo && (
                        <div className="mt-1 rounded border border-red-500/40 bg-red-950/60 px-2 py-1 text-[10px] text-red-200">
                          <div className="font-bold text-red-300">
                            ✗ Blocked by {conflictInfo.winnerPass.pass_id.toUpperCase()} (
                            {conflictInfo.winnerPass.satellite_id} →{' '}
                            {conflictInfo.winnerPass.antenna_id})
                          </div>
                          <div className="text-red-300/90">
                            Reason: <code className="font-bold underline">{conflictInfo.reason}</code>
                          </div>
                        </div>
                      )}

                      {isChosen !== chosenByOther && (
                        <div className="mt-1 text-[10px] text-amber-300">
                          ⚡ {isChosen ? `Chosen ONLY by ${method}` : `Chosen by ${otherMethod}`}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Synchronized 24h Buffer Curves & 61-Pass Gantt Drawer */}
      {scenario && passesDoc && schedules && (
        <AnalyticsDrawer
          scenario={scenario}
          passes={passesDoc.passes}
          schedules={schedules}
          activeMethod={method}
          currentTimeMs={currentTimeMs}
          onScrub={handleScrub}
        />
      )}

      {/* Bottom Timeline & Speed Bar */}
      {scenario && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex w-[92%] max-w-4xl items-center gap-4 rounded-2xl border border-slate-800/90 bg-slate-950/90 px-5 py-3 backdrop-blur-md shadow-2xl">
          <button
            onClick={togglePlay}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500 text-slate-950 hover:bg-sky-400 transition cursor-pointer"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current" />
            )}
          </button>

          <button
            onClick={() => handleScrub(startMs)}
            title="Restart 24h Window"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <div className="flex flex-1 flex-col gap-1">
            <input
              type="range"
              min={startMs}
              max={endMs}
              step={5000}
              value={currentTimeMs}
              onChange={(e) => handleScrub(Number(e.target.value))}
              className="w-full accent-sky-400 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] font-mono text-slate-400">
              <span>{scenario.start_utc}</span>
              <span>
                +{((currentTimeMs - startMs) / 3600000).toFixed(1)}h / {scenario.duration_hours}h
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/90 p-1">
            {SPEED_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => changeSpeed(s)}
                className={`rounded-lg px-2 py-1 text-xs font-mono font-semibold transition cursor-pointer ${
                  speed === s
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
      )}

      {/* How To Read This Scene Modal */}
      <HowToReadModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </div>
  );
}
