import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import {
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Compass,
  Database,
  Eye,
  Layers,
  Minimize2,
  Minus,
  Plus,
  Scan,
  ShieldAlert,
} from 'lucide-react';
import type {
  AntennaConfig,
  AssignmentRecord,
  ConflictRecord,
  PassRecord,
  PassesDocument,
  ScenarioData,
  ScheduleDocument,
  ScheduleMethod,
  ScoreboardDocument,
  TlesMap,
} from './types/engine';
import {
  buildConflictIndex,
  computeFleetTelemetry,
  ensureConflicts,
} from './lib/telemetry';
import { runWhatIfPipeline } from './lib/whatifEngine';
import { SAT_COLORS, getSatShortName } from './scene/constants';
import { applyQualityProfile, initCesiumScene } from './scene/initCesiumScene';
import {
  flyToGroundStation,
  flyToHeroGlobe,
  flyToWhatIfRegion,
  trackSatelliteEntity,
  zoomGlobeCamera,
} from './scene/cameraDirector';
import { buildSatelliteLayer } from './scene/SatelliteLayer';
import { buildGroundStationLayer } from './scene/GroundStationLayer';
import {
  buildActiveLinkLayer,
  buildGhostLinksPrimitive,
} from './scene/LinkLayer';
import { disposeProceduralModels } from './scene/proceduralModels';
import TopMissionBar from './components/TopMissionBar';
import TimelineScrubber from './components/TimelineScrubber';
import ScoreboardPanel from './components/ScoreboardPanel';
import AnalyticsDrawer from './components/AnalyticsDrawer';
import HowToReadModal from './components/HowToReadModal';
import WhatIfPanel, { type PresetStation } from './components/WhatIfPanel';
import LandingPage from './landing/LandingPage';
import NotFoundPage from './landing/NotFoundPage';

type SchedulesBundle = Record<ScheduleMethod, ScheduleDocument>;

function MissionConsole({ onNavigate }: { onNavigate: (path: string) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const satEntitiesRef = useRef<Record<string, Cesium.Entity>>({});
  const satPropsRef = useRef<Record<string, Cesium.SampledPositionProperty>>({});
  const antPositionsRef = useRef<Record<string, Cesium.Cartesian3>>({});
  const ghostCollectionRef = useRef<Cesium.PolylineCollection | null>(null);

  // Direct DOM refs for 60fps playheads (zero 60fps React re-renders!)
  const scrubberPlayheadRef = useRef<HTMLDivElement>(null);
  const scrubberFillRef = useRef<HTMLDivElement>(null);
  const chartPlayheadRef = useRef<HTMLDivElement>(null);

  // Baseline Data
  const [baseScenario, setBaseScenario] = useState<ScenarioData | null>(null);
  const [tles, setTles] = useState<TlesMap | null>(null);
  const [basePassesDoc, setBasePassesDoc] = useState<PassesDocument | null>(null);
  const [baseSchedules, setBaseSchedules] = useState<SchedulesBundle | null>(null);
  const [baseScoreboard, setBaseScoreboard] = useState<ScoreboardDocument | null>(null);

  // Active Scenario State
  const [scenario, setScenario] = useState<ScenarioData | null>(null);
  const [passesDoc, setPassesDoc] = useState<PassesDocument | null>(null);
  const [schedules, setSchedules] = useState<SchedulesBundle | null>(null);
  const [scoreboard, setScoreboard] = useState<ScoreboardDocument | null>(null);

  // HUD Layout & Modes (OPS cleanly holds Score | What-If only; Clash jumps live in movable 24h Control!)
  const [leftOpen, setLeftOpen] = useState<boolean>(true);
  const [rightOpen, setRightOpen] = useState<boolean>(true);
  const [leftTab, setLeftTab] = useState<'telemetry' | 'buffers'>('telemetry');
  const [rightTab, setRightTab] = useState<'scoreboard' | 'whatif'>('scoreboard');
  const [analyticsOpen, setAnalyticsOpen] = useState<boolean>(false);
  const [cinematicMode, setCinematicMode] = useState<boolean>(false);
  const [hdMode, setHdMode] = useState<boolean>(false);
  const [showSwaths, setShowSwaths] = useState<boolean>(true);
  const [showConflicts3D, setShowConflicts3D] = useState<boolean>(true);
  const [ghostFilter, setGhostFilter] = useState<'all' | 'sentinel-2a' | 'sentinel-2b' | 'off'>('all');
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);

  // What-If Lab State
  const [isPlacingStation, setIsPlacingStation] = useState<boolean>(false);
  const [stagedAntennas, setStagedAntennas] = useState<AntennaConfig[]>([]);
  const [appliedAntennas, setAppliedAntennas] = useState<AntennaConfig[]>([]);
  const [lastComputeMs, setLastComputeMs] = useState<number | null>(null);

  // Playback & Tracking State
  const [method, setMethod] = useState<ScheduleMethod>('qslice');
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [speed, setSpeed] = useState<number>(60);
  const [trackedTarget, setTrackedTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isPlacingRef = useRef(isPlacingStation);
  const showSwathsRef = useRef(showSwaths);
  const trackedTargetRef = useRef(trackedTarget);
  useEffect(() => {
    isPlacingRef.current = isPlacingStation;
  }, [isPlacingStation]);
  useEffect(() => {
    showSwathsRef.current = showSwaths;
  }, [showSwaths]);
  useEffect(() => {
    trackedTargetRef.current = trackedTarget;
  }, [trackedTarget]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'h' || e.key === 'H') {
        setCinematicMode((v) => !v);
      } else if (e.key === '?') {
        setIsHelpOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setIsPlacingStation(false);
        setIsHelpOpen(false);
      } else if (e.key === ' ') {
        e.preventDefault();
        if (viewerRef.current) {
          viewerRef.current.clock.shouldAnimate = !viewerRef.current.clock.shouldAnimate;
          setIsPlaying(viewerRef.current.clock.shouldAnimate);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (viewerRef.current && !viewerRef.current.isDestroyed()) {
      applyQualityProfile(viewerRef.current, hdMode);
    }
  }, [hdMode]);

  // 1. Load static JSON outputs
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
      fetch('/data/schedule_qslice.json').then((r) => {
        if (!r.ok) throw new Error('Missing /data/schedule_qslice.json');
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
          qsliceData,
          scoreboardData,
        ]: [
          ScenarioData,
          TlesMap,
          PassesDocument,
          ScheduleDocument,
          ScheduleDocument,
          ScheduleDocument,
          ScoreboardDocument,
        ]) => {
          const bundle: SchedulesBundle = {
            greedy: greedyData,
            optimizer: optimizerData,
            qslice: qsliceData,
          };
          setBaseScenario(scenarioData);
          setTles(tlesData);
          setBasePassesDoc(passesData);
          setBaseSchedules(bundle);
          setBaseScoreboard(scoreboardData);

          setScenario(scenarioData);
          setPassesDoc(passesData);
          setSchedules(bundle);
          setScoreboard(scoreboardData);
          setCurrentTimeMs(new Date(scenarioData.start_utc).getTime());
        }
      )
      .catch((err) => setError(err.message));
  }, []);

  // Conflict & pass indices
  const conflictsList = useMemo<ConflictRecord[]>(() => {
    if (!passesDoc || !scenario) return [];
    return ensureConflicts(passesDoc.passes, passesDoc.conflicts, scenario);
  }, [passesDoc, scenario]);

  const conflictIndex = useMemo(() => buildConflictIndex(conflictsList), [conflictsList]);

  const activeAssignments = useMemo<AssignmentRecord[]>(() => {
    if (!schedules) return [];
    return schedules[method].assignments;
  }, [schedules, method]);

  const chosenSet = useMemo(() => {
    if (!schedules || !passesDoc) return new Set<string>();
    if (method !== 'qslice') {
      return new Set(schedules[method].assignments.map((a) => a.pass_id));
    }
    const served = new Set<string>();
    for (const p of passesDoc.passes) {
      const pStart = new Date(p.aos_utc).getTime();
      const pEnd = new Date(p.los_utc).getTime();
      const hit = schedules.qslice.assignments.some(
        (a) =>
          a.satellite_id === p.satellite_id &&
          a.antenna_id === p.antenna_id &&
          new Date(a.start_utc).getTime() < pEnd &&
          new Date(a.end_utc).getTime() > pStart
      );
      if (hit) served.add(p.pass_id);
    }
    return served;
  }, [schedules, passesDoc, method]);

  const diffPasses = useMemo(() => {
    if (!schedules || !passesDoc) return [];
    const gSet = new Set(schedules.greedy.assignments.map((a) => a.pass_id));
    const oSet = new Set(schedules.optimizer.assignments.map((a) => a.pass_id));
    return passesDoc.passes.filter((p) => gSet.has(p.pass_id) !== oSet.has(p.pass_id));
  }, [schedules, passesDoc]);

  const diffPassIds = useMemo(() => new Set(diffPasses.map((p) => p.pass_id)), [diffPasses]);

  const conflictLoserPasses = useMemo(() => {
    if (!passesDoc) return [];
    return passesDoc.passes.filter((p) => {
      if (chosenSet.has(p.pass_id)) return false;
      const neighbors = conflictIndex[p.pass_id] ?? [];
      return neighbors.some((n) => chosenSet.has(n.otherPassId));
    });
  }, [passesDoc, chosenSet, conflictIndex]);

  const conflictLoserIds = useMemo(
    () => new Set(conflictLoserPasses.map((p) => p.pass_id)),
    [conflictLoserPasses]
  );

  // Live scene lookup ref shared with 60fps Cesium callbacks
  const liveSceneStateRef = useRef<{
    passes: PassRecord[];
    activeAssignments: AssignmentRecord[];
    chosenSet: Set<string>;
    conflictIndex: Record<
      string,
      { otherPassId: string; reason: 'same_antenna' | 'same_satellite' }[]
    >;
    showConflicts3D: boolean;
  }>({
    passes: [],
    activeAssignments: [],
    chosenSet: new Set(),
    conflictIndex: {},
    showConflicts3D: true,
  });

  useEffect(() => {
    liveSceneStateRef.current = {
      passes: passesDoc?.passes ?? [],
      activeAssignments,
      chosenSet,
      conflictIndex,
      showConflicts3D,
    };
  }, [passesDoc, activeAssignments, chosenSet, conflictIndex, showConflicts3D]);

  // 2. Initialize CesiumJS Viewer ONCE
  useEffect(() => {
    if (!containerRef.current || !baseScenario || !tles) return;

    const startMs = new Date(baseScenario.start_utc).getTime();
    const durationMs = baseScenario.duration_hours * 3600 * 1000;

    const viewer = initCesiumScene({
      container: containerRef.current,
      startUtc: baseScenario.start_utc,
      durationHours: baseScenario.duration_hours,
      initialSpeed: 60,
      hdMode: false,
    });
    viewerRef.current = viewer;

    // Preserved Hero Globe POV
    flyToHeroGlobe(viewer, 0);

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement: { position: Cesium.Cartesian2 }) => {
      if (!isPlacingRef.current) return;
      const cartesian = viewer.camera.pickEllipsoid(
        movement.position,
        viewer.scene.globe.ellipsoid
      );
      if (!cartesian) return;

      const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
      const latDeg = Math.round(Cesium.Math.toDegrees(cartographic.latitude) * 100) / 100;
      const lonDeg = Math.round(Cesium.Math.toDegrees(cartographic.longitude) * 100) / 100;

      setStagedAntennas((prev) => {
        const idx = prev.length + 1;
        const newAnt: AntennaConfig = {
          id: `custom-${Date.now().toString().slice(-4)}`,
          name: `Site-${idx}`,
          lat_deg: latDeg,
          lon_deg: lonDeg,
          alt_m: 100,
          min_elevation_deg: 5,
          dishes: 1,
          setup_s: 120,
        };
        return [...prev, newAnt];
      });
      setIsPlacingStation(false);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // 60fps direct-DOM playheads + 3Hz calm React HUD sync (zero flicker)
    let lastReactSync = 0;
    const removeTickListener = viewer.clock.onTick.addEventListener((c) => {
      const ms = Cesium.JulianDate.toDate(c.currentTime).getTime();
      const frac = Math.min(1, Math.max(0, (ms - startMs) / durationMs));
      const pct = frac * 100;

      if (scrubberPlayheadRef.current) {
        scrubberPlayheadRef.current.style.left = `${pct}%`;
      }
      if (scrubberFillRef.current) {
        scrubberFillRef.current.style.width = `${pct}%`;
      }
      if (chartPlayheadRef.current) {
        const chartLeftPct = (64 / 820 + frac * (742 / 820)) * 100;
        chartPlayheadRef.current.style.left = `${chartLeftPct}%`;
      }

      const now = performance.now();
      if (now - lastReactSync > 320) {
        lastReactSync = now;
        setCurrentTimeMs(ms);
        setIsPlaying(c.shouldAnimate);
      }
    });

    return () => {
      handler.destroy();
      removeTickListener();
      if (!viewer.isDestroyed()) viewer.destroy();
      viewerRef.current = null;
      disposeProceduralModels();
    };
  }, [baseScenario, tles]);

  // 3. Build 3D Satellite, Ground Station & Active RF Link Layers
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !scenario || !tles) return;

    const satHandle = buildSatelliteLayer(viewer, scenario, tles, {
      isSatelliteDownlinking: (satId, timeMs) => {
        const state = liveSceneStateRef.current;
        for (const a of state.activeAssignments) {
          if (a.satellite_id !== satId) continue;
          const s = new Date(a.start_utc).getTime();
          const e = new Date(a.end_utc).getTime();
          if (timeMs >= s && timeMs <= e) return true;
        }
        return false;
      },
      isSwathVisible: () => showSwathsRef.current,
      getTrackedTarget: () => trackedTargetRef.current,
    });

    satEntitiesRef.current = satHandle.entities;
    satPropsRef.current = satHandle.positionProps;

    const stationHandle = buildGroundStationLayer(
      viewer,
      scenario.antennas,
      stagedAntennas,
      {
        getActiveTargetForAntenna: (antennaId, time) => {
          const ms = Cesium.JulianDate.toDate(time).getTime();
          const state = liveSceneStateRef.current;
          for (const a of state.activeAssignments) {
            if (a.antenna_id !== antennaId) continue;
            const s = new Date(a.start_utc).getTime();
            const e = new Date(a.end_utc).getTime();
            if (ms >= s && ms <= e) {
              const satProp = satHandle.positionProps[a.satellite_id];
              const satPosition = satProp?.getValue(time);
              if (satPosition) {
                return { satelliteId: a.satellite_id, satPosition };
              }
            }
          }
          return null;
        },
      }
    );

    antPositionsRef.current = stationHandle.positions;

    const linkHandle = buildActiveLinkLayer(
      viewer,
      scenario,
      satHandle.positionProps,
      stationHandle.positions,
      () => liveSceneStateRef.current
    );

    return () => {
      linkHandle.dispose();
      stationHandle.dispose();
      satHandle.dispose();
    };
  }, [scenario, tles, stagedAntennas]);

  // 4. Batched Ghost Links Primitive
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !passesDoc) return;

    if (ghostCollectionRef.current) {
      viewer.scene.primitives.remove(ghostCollectionRef.current);
      ghostCollectionRef.current = null;
    }

    const collection = buildGhostLinksPrimitive(
      passesDoc.passes,
      chosenSet,
      ghostFilter,
      satPropsRef.current,
      antPositionsRef.current
    );

    if (collection) {
      viewer.scene.primitives.add(collection);
      ghostCollectionRef.current = collection;
    }

    return () => {
      if (ghostCollectionRef.current && !viewer.isDestroyed()) {
        viewer.scene.primitives.remove(ghostCollectionRef.current);
        ghostCollectionRef.current = null;
      }
    };
  }, [passesDoc, chosenSet, ghostFilter, scenario, stagedAntennas]);

  // Derived Telemetry
  const fleetTelemetry = useMemo(() => {
    if (!scenario || !schedules || !currentTimeMs) return null;
    return computeFleetTelemetry(scenario, schedules[method], currentTimeMs);
  }, [scenario, schedules, method, currentTimeMs]);

  const baselineFleetTelemetry = useMemo(() => {
    if (!scenario || !schedules || !currentTimeMs) return null;
    const compareMethod: ScheduleMethod = method === 'greedy' ? 'qslice' : 'greedy';
    return computeFleetTelemetry(scenario, schedules[compareMethod], currentTimeMs);
  }, [scenario, schedules, method, currentTimeMs]);

  // Controls
  const handleScrub = useCallback((ms: number) => {
    if (!viewerRef.current) return;
    viewerRef.current.clock.currentTime = Cesium.JulianDate.fromDate(new Date(ms));
    setCurrentTimeMs(ms);
  }, []);

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

  const jumpToNextPass = useCallback(
    (mode: 'beam' | 'diff' | 'conflict') => {
      if (!passesDoc) return;
      if (mode === 'beam') {
        if (activeAssignments.length === 0) return;
        const next =
          activeAssignments.find(
            (a) => new Date(a.start_utc).getTime() > currentTimeMs + 5000
          ) ?? activeAssignments[0];
        handleScrub(new Date(next.start_utc).getTime() + 20_000);
        return;
      }
      if (mode === 'conflict') {
        setShowConflicts3D(true);
      }
      const pool = mode === 'diff' ? diffPasses : conflictLoserPasses;
      if (pool.length === 0) return;
      const next =
        pool.find((p) => new Date(p.aos_utc).getTime() > currentTimeMs + 5000) ?? pool[0];
      handleScrub(new Date(next.aos_utc).getTime() + 25_000);
    },
    [passesDoc, activeAssignments, diffPasses, conflictLoserPasses, currentTimeMs, handleScrub]
  );

  const handleTrackEntity = useCallback(
    (targetId: string | null) => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      if (!targetId) {
        setTrackedTarget(null);
        flyToHeroGlobe(viewer, 1.3);
        return;
      }

      if (targetId.startsWith('sat-')) {
        const satId = targetId.replace('sat-', '');
        const entity = satEntitiesRef.current[satId];
        if (entity) {
          trackSatelliteEntity(viewer, entity);
          setTrackedTarget(targetId);
        }
      } else if (targetId.startsWith('ant-')) {
        const antId = targetId.replace('ant-', '');
        const ant = scenario?.antennas.find((a) => a.id === antId);
        if (ant) {
          setTrackedTarget(targetId);
          flyToGroundStation(viewer, ant, 1.35);
        }
      }
    },
    [scenario]
  );

  const handleZoom = (dir: 'in' | 'out') => {
    if (viewerRef.current && !viewerRef.current.isDestroyed()) {
      zoomGlobeCamera(viewerRef.current, dir);
    }
  };

  // What-If Handlers
  const handleAddPreset = (preset: PresetStation) => {
    const newAnt: AntennaConfig = {
      id: preset.id,
      name: preset.name,
      lat_deg: preset.lat_deg,
      lon_deg: preset.lon_deg,
      alt_m: preset.alt_m,
      min_elevation_deg: 5,
      dishes: 1,
      setup_s: 120,
    };
    setStagedAntennas((prev) => [...prev, newAnt]);
    if (viewerRef.current) {
      setTrackedTarget(null);
      flyToWhatIfRegion(viewerRef.current, preset.lat_deg, preset.lon_deg, 1.3);
    }
  };

  const handleRemoveCustomAntenna = (id: string) => {
    const nextStaged = stagedAntennas.filter((a) => a.id !== id);
    setStagedAntennas(nextStaged);
    if (nextStaged.length === 0 && appliedAntennas.length > 0) {
      handleResetBaseline();
    }
  };

  const handleRerunEngine = () => {
    if (!baseScenario || !basePassesDoc || !tles) return;
    if (stagedAntennas.length === 0) {
      handleResetBaseline();
      return;
    }
    const result = runWhatIfPipeline(
      baseScenario,
      basePassesDoc,
      tles,
      stagedAntennas
    );
    setScenario(result.scenario);
    setPassesDoc(result.passesDoc);
    setSchedules(result.schedules);
    setScoreboard(result.scoreboard);
    setAppliedAntennas([...stagedAntennas]);
    setLastComputeMs(result.elapsedMs);
  };

  const handleResetBaseline = () => {
    if (!baseScenario || !basePassesDoc || !baseSchedules || !baseScoreboard) return;
    setStagedAntennas([]);
    setAppliedAntennas([]);
    setLastComputeMs(null);
    setIsPlacingStation(false);
    setScenario(baseScenario);
    setPassesDoc(basePassesDoc);
    setSchedules(baseSchedules);
    setScoreboard(baseScoreboard);
  };

  const hasUnappliedChanges = useMemo(() => {
    if (stagedAntennas.length !== appliedAntennas.length) return true;
    return stagedAntennas.some((s, i) => s.id !== appliedAntennas[i]?.id);
  }, [stagedAntennas, appliedAntennas]);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#030712] text-rose-400 p-6">
        <div className="max-w-lg rounded-lg hud-panel-clean p-6">
          <h2 className="font-display text-lg font-bold text-white mb-2">
            Engine Data Contract Missing
          </h2>
          <p className="font-mono-tabular text-sm mb-4">{error}</p>
          <p className="text-xs text-slate-400">
            Run from project root:{' '}
            <code className="text-sky-400 font-mono-tabular">
              python -m engine.run data/scenario.json
            </code>
          </p>
        </div>
      </div>
    );
  }

  const isLoading = !scenario || !tles || !passesDoc || !schedules;
  const isoClock = currentTimeMs
    ? new Date(currentTimeMs).toISOString().replace(/\.\d{3}Z$/, ' UTC')
    : '';

  const liveDeltaGb =
    fleetTelemetry && baselineFleetTelemetry
      ? fleetTelemetry.totalDeliveredSoFarGb - baselineFleetTelemetry.totalDeliveredSoFarGb
      : 0;

  const anyOverflowing =
    fleetTelemetry &&
    Object.values(fleetTelemetry.satellites).some((s) => s.isOverflowing);

  return (
    <div
      className={`relative w-screen h-screen overflow-hidden bg-[#030712] select-none ${
        isPlacingStation ? 'cursor-crosshair' : ''
      }`}
    >
      {isLoading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#030712] text-slate-100">
          <div className="h-9 w-9 rounded-full border-2 border-sky-400 border-t-transparent animate-spin mb-4" />
          <div className="font-mono-tabular text-xs font-semibold uppercase tracking-[0.2em] text-sky-400">
            Bootstrapping QO-3 Ephemeris & 3D Assets...
          </div>
        </div>
      )}

      {/* Full-Viewport 3D Cesium Earth Canvas */}
      <div ref={containerRef} className="fixed inset-0 w-full h-full" />

      {/* Ground Station Placement Banner */}
      {isPlacingStation && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-md border border-amber-400/80 bg-[#040914] px-4 py-2 font-mono-tabular text-xs font-bold text-amber-300 shadow-2xl">
          <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
          CLICK ANYWHERE ON EARTH TO SITE A NEW GROUND STATION
          <button
            onClick={() => setIsPlacingStation(false)}
            className="ml-2 rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-300 hover:text-white cursor-pointer"
          >
            ESC
          </button>
        </div>
      )}

      {/* Minimal Floating Restore Trigger in Cinematic Mode (Press H) */}
      {cinematicMode && (
        <div className="fixed top-3 right-3 z-30">
          <button
            onClick={() => setCinematicMode(false)}
            className="hud-transition flex items-center gap-1.5 rounded-md hud-panel-clean border-sky-500/40 px-3 py-1.5 font-mono-tabular text-[11px] font-bold text-sky-300 hover:text-white cursor-pointer"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            HUD (H)
          </button>
        </div>
      )}

      {/* Floating Zoom & POV Micro-Controls */}
      <div className="fixed bottom-4 right-3 z-20 flex flex-col gap-1 pointer-events-auto">
        <button
          onClick={() => handleZoom('in')}
          title="Zoom In Globe"
          aria-label="Zoom In Globe"
          className="hud-transition flex h-8 w-8 items-center justify-center rounded-md hud-panel-clean text-slate-200 hover:border-sky-400/60 hover:text-white cursor-pointer"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          onClick={() => handleZoom('out')}
          title="Zoom Out Globe"
          aria-label="Zoom Out Globe"
          className="hud-transition flex h-8 w-8 items-center justify-center rounded-md hud-panel-clean text-slate-200 hover:border-sky-400/60 hover:text-white cursor-pointer"
        >
          <Minus className="w-4 h-4" />
        </button>
        <button
          onClick={() => handleTrackEntity(null)}
          title="Reset Globe POV"
          aria-label="Reset Globe POV"
          className="hud-transition flex h-8 w-8 items-center justify-center rounded-md hud-panel-clean text-sky-300 hover:border-sky-400/60 hover:text-white cursor-pointer"
        >
          <Compass className="w-4 h-4" />
        </button>
      </div>

      {/* MOVABLE & COLLAPSIBLE 24H TIMELINE + JUMP + SPEED BLOCK (Lives cleanly in upper space above globe!) */}
      {!cinematicMode && scenario && passesDoc && (
        <TimelineScrubber
          scenario={scenario}
          activeAssignments={activeAssignments}
          conflictPasses={conflictLoserPasses}
          diffPassesCount={diffPasses.length}
          diffPassIds={diffPassIds}
          currentTimeMs={currentTimeMs}
          isPlaying={isPlaying}
          speed={speed}
          playheadRef={scrubberPlayheadRef}
          progressFillRef={scrubberFillRef}
          onTogglePlay={togglePlay}
          onScrub={handleScrub}
          onChangeSpeed={changeSpeed}
          onJumpToNext={jumpToNextPass}
        />
      )}

      {/* MOVABLE 24H TELEMETRY ANALYTICS WINDOW (Toggled from Top Bar "Charts" button) */}
      {!cinematicMode && scenario && passesDoc && schedules && (
        <AnalyticsDrawer
          isOpen={analyticsOpen}
          onClose={() => setAnalyticsOpen(false)}
          scenario={scenario}
          passes={passesDoc.passes}
          schedules={schedules}
          conflictLoserIds={conflictLoserIds}
          activeMethod={method}
          playheadRef={chartPlayheadRef}
          onScrub={handleScrub}
        />
      )}

      {/* TOP BAR + LEFT (TLM) & RIGHT (OPS) STATIC SIDE DRAWERS */}
      <div className="relative z-10 flex h-screen w-screen flex-col p-3 pointer-events-none gap-2.5">
        {/* TOP ROW: Floating Mission Strip */}
        {!cinematicMode && scenario && (
          <TopMissionBar
            isoClock={isoClock}
            fleetTelemetry={fleetTelemetry}
            scoreboard={scoreboard}
            method={method}
            onSelectMethod={setMethod}
            satellites={scenario.satellites}
            antennas={scenario.antennas}
            trackedTarget={trackedTarget}
            onTrackTarget={handleTrackEntity}
            hdMode={hdMode}
            onToggleHdMode={() => setHdMode((v) => !v)}
            analyticsOpen={analyticsOpen}
            onToggleAnalytics={() => setAnalyticsOpen((v) => !v)}
            onOpenLanding={() => onNavigate('/')}
            onEnterCinematic={() => setCinematicMode(true)}
            onOpenHelp={() => setIsHelpOpen(true)}
          />
        )}

        {/* MIDDLE ROW: Clean Matte-Border Left (TLM) & Right (OPS) Drawers */}
        {!cinematicMode && (
          <div className="flex flex-1 items-start justify-between min-h-0">
            {/* LEFT TELEMETRY DRAWER — zero edge flicker (no -1px reticles, no contain:paint, no auto-fade) */}
            <aside className="pointer-events-auto flex items-start">
              {leftOpen ? (
                <div className="flex w-[282px] flex-col rounded-lg hud-panel-clean p-2.5">
                  <div className="flex items-center justify-between gap-1.5 pb-2 border-b border-slate-800/80">
                    <div className="grid flex-1 grid-cols-2 gap-1 rounded-md bg-slate-950 p-0.5 border border-slate-800">
                      <button
                        onClick={() => setLeftTab('telemetry')}
                        className={`hud-transition rounded py-1 font-mono-tabular text-[10px] font-bold uppercase tracking-wider cursor-pointer ${
                          leftTab === 'telemetry'
                            ? 'bg-sky-500 text-slate-950'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Telemetry
                      </button>
                      <button
                        onClick={() => setLeftTab('buffers')}
                        className={`hud-transition flex items-center justify-center gap-1.5 rounded py-1 font-mono-tabular text-[10px] font-bold uppercase tracking-wider cursor-pointer ${
                          leftTab === 'buffers'
                            ? 'bg-sky-500 text-slate-950'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Buffers
                        {anyOverflowing && (
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                        )}
                      </button>
                    </div>
                    <button
                      onClick={() => setLeftOpen(false)}
                      title="Collapse Telemetry Drawer"
                      className="hud-transition rounded border border-slate-800 bg-slate-950 p-1 text-slate-400 hover:border-slate-600 hover:text-white cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {leftTab === 'telemetry' && scenario && fleetTelemetry && (
                    <div className="mt-2.5 flex flex-col gap-2.5">
                      {/* Live Data Trail Hero Card */}
                      <div className="rounded-md hud-subpanel p-2.5">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 font-display text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-400">
                            <Database className="w-3 h-3 text-emerald-400" />
                            Downlinked
                          </span>
                          {fleetTelemetry.activeBeamCount > 0 ? (
                            <span className="flex items-center gap-1 rounded border border-emerald-500/45 bg-emerald-500/15 px-1.5 py-0.5 font-mono-tabular text-[9px] font-bold text-emerald-300">
                              <Activity className="w-2.5 h-2.5" />
                              +{fleetTelemetry.activeDownlinkMbps.toFixed(0)} Mbps
                            </span>
                          ) : (
                            <span className="font-mono-tabular text-[9px] uppercase text-slate-500">
                              Collecting
                            </span>
                          )}
                        </div>

                        <div className="mt-1.5 flex items-baseline justify-between">
                          <div className="flex items-baseline gap-1 font-mono-tabular">
                            <span className="text-xl font-bold tracking-tight text-white">
                              {fleetTelemetry.totalDeliveredSoFarGb.toFixed(1)}
                            </span>
                            <span className="text-[11px] font-semibold text-emerald-400">
                              / {fleetTelemetry.totalPlannedGb.toFixed(0)} GB
                            </span>
                          </div>
                          <div className="text-right font-mono-tabular text-[10px]">
                            <div
                              className={
                                liveDeltaGb > 0.05
                                  ? 'text-emerald-400 font-bold'
                                  : liveDeltaGb < -0.05
                                  ? 'text-amber-400'
                                  : 'text-slate-400'
                              }
                            >
                              {liveDeltaGb >= 0 ? `+${liveDeltaGb.toFixed(1)}` : liveDeltaGb.toFixed(1)}{' '}
                              GB vs {method === 'greedy' ? 'qslice' : 'greedy'}
                            </div>
                            <div className="text-rose-400/90">
                              Spill: {fleetTelemetry.totalOverflowSoFarGb.toFixed(0)} GB
                            </div>
                          </div>
                        </div>

                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-sm bg-slate-950 border border-slate-800">
                          <div
                            className="h-full w-full origin-left bg-emerald-400"
                            style={{
                              transform: `scaleX(${Math.min(
                                1,
                                fleetTelemetry.totalDeliveredSoFarGb /
                                  Math.max(1, fleetTelemetry.totalPlannedGb)
                              )})`,
                            }}
                          />
                        </div>
                      </div>

                      {/* Compact Satellite Buffer Glance */}
                      <div className="grid grid-cols-2 gap-1.5">
                        {scenario.satellites.map((sat) => {
                          const t = fleetTelemetry.satellites[sat.id];
                          if (!t) return null;
                          const hex = SAT_COLORS[sat.id] ?? '#38bdf8';
                          return (
                            <button
                              key={sat.id}
                              onClick={() => handleTrackEntity(`sat-${sat.id}`)}
                              className={`hud-transition rounded-md border p-2 text-left cursor-pointer ${
                                t.isOverflowing
                                  ? 'border-rose-500/70 bg-rose-950/35'
                                  : t.isDraining
                                  ? 'border-emerald-500/50 bg-emerald-950/20'
                                  : 'border-slate-800 bg-slate-950/70 hover:border-slate-600'
                              }`}
                            >
                              <div className="flex items-center justify-between font-mono-tabular text-[10px]">
                                <span className="font-bold flex items-center gap-1 text-slate-100">
                                  <span
                                    className="h-1.5 w-1.5 rounded-full"
                                    style={{ backgroundColor: hex }}
                                  />
                                  {getSatShortName(sat.id)}
                                </span>
                                <span className="text-slate-300 font-semibold">
                                  {t.fillPct.toFixed(0)}%
                                </span>
                              </div>
                              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-sm bg-slate-950">
                                <div
                                  className="h-full w-full origin-left"
                                  style={{
                                    transform: `scaleX(${t.fillPct / 100})`,
                                    backgroundColor: t.isOverflowing
                                      ? '#f43f5e'
                                      : t.isDraining
                                      ? '#10b981'
                                      : hex,
                                  }}
                                />
                              </div>
                              <div className="mt-1 font-mono-tabular text-[9px] text-slate-400">
                                {t.levelGb.toFixed(0)}/{t.capacityGb}G ·{' '}
                                {t.isDraining ? 'DRAIN' : t.isOverflowing ? 'SPILL' : 'FILL'}
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {/* 3D Scene Layer Controls (Auto-fade completely removed!) */}
                      <div className="rounded-md hud-subpanel p-2.5 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 font-display text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-400">
                            <Layers className="w-3 h-3 text-sky-400" />
                            3D Overlays
                          </span>
                          <span className="font-mono-tabular text-[9px] text-slate-500">
                            {passesDoc?.passes.length ?? 0} passes
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            onClick={() => setShowSwaths((v) => !v)}
                            className={`hud-transition flex items-center justify-center gap-1 rounded border px-2 py-1.5 font-mono-tabular text-[10px] font-semibold cursor-pointer ${
                              showSwaths
                                ? 'border-sky-500/45 bg-sky-500/12 text-sky-300'
                                : 'border-slate-800 bg-slate-950 text-slate-500'
                            }`}
                          >
                            <Scan className="w-3 h-3" />
                            MSI Swaths
                          </button>

                          <button
                            onClick={() => setShowConflicts3D((v) => !v)}
                            className={`hud-transition flex items-center justify-center gap-1 rounded border px-2 py-1.5 font-mono-tabular text-[10px] font-semibold cursor-pointer ${
                              showConflicts3D
                                ? 'border-rose-500/45 bg-rose-500/12 text-rose-300'
                                : 'border-slate-800 bg-slate-950 text-slate-500'
                            }`}
                          >
                            <ShieldAlert className="w-3 h-3" />
                            Clashes ({conflictsList.length})
                          </button>
                        </div>

                        <div className="flex items-center justify-between pt-1 border-t border-slate-800/70">
                          <span className="flex items-center gap-1 font-mono-tabular text-[10px] text-slate-400">
                            <Eye className="w-3 h-3 text-slate-400" />
                            Ghost Arcs
                          </span>
                          <div className="flex items-center gap-0.5 rounded bg-slate-950 p-0.5 border border-slate-800">
                            {(
                              [
                                ['all', 'All'],
                                ['sentinel-2a', 'S2A'],
                                ['sentinel-2b', 'S2B'],
                                ['off', 'Off'],
                              ] as const
                            ).map(([val, label]) => (
                              <button
                                key={val}
                                onClick={() => setGhostFilter(val)}
                                className={`hud-transition rounded px-1.5 py-0.5 font-mono-tabular text-[9px] font-semibold cursor-pointer ${
                                  ghostFilter === val
                                    ? 'bg-sky-500 text-slate-950'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {leftTab === 'buffers' && scenario && fleetTelemetry && (
                    <div className="mt-2.5 flex flex-col gap-2">
                      <div className="flex items-center justify-between font-mono-tabular text-[10px] text-slate-400 px-0.5">
                        <span>Cap: 300 GB / sat</span>
                        <span>Gen: +62.5 GB/h</span>
                      </div>

                      {scenario.satellites.map((sat) => {
                        const t = fleetTelemetry.satellites[sat.id];
                        if (!t) return null;
                        const satColor = SAT_COLORS[sat.id] ?? '#38bdf8';

                        return (
                          <div
                            key={sat.id}
                            className={`rounded-md border p-2.5 ${
                              t.isOverflowing
                                ? 'border-rose-500/80 bg-rose-950/40'
                                : t.isDraining
                                ? 'border-emerald-500/50 bg-emerald-950/20'
                                : 'border-slate-800 bg-slate-950/70'
                            }`}
                          >
                            <div className="flex items-center justify-between font-mono-tabular text-xs">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ backgroundColor: satColor }}
                                />
                                <span className="font-bold uppercase text-white">
                                  {getSatShortName(sat.id)}
                                </span>
                                {t.isOverflowing && (
                                  <span className="flex items-center gap-0.5 rounded bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold text-slate-950">
                                    <AlertTriangle className="w-2.5 h-2.5" />
                                    SPILL
                                  </span>
                                )}
                                {!t.isOverflowing && t.isDraining && (
                                  <span className="rounded border border-emerald-500/45 bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
                                    DRAIN
                                  </span>
                                )}
                              </div>

                              <div className="font-bold text-white">
                                {t.levelGb.toFixed(1)}{' '}
                                <span className="font-normal text-slate-400">
                                  / {t.capacityGb}G
                                </span>
                              </div>
                            </div>

                            <div className="mt-2 h-2 w-full overflow-hidden rounded-sm bg-slate-950 border border-slate-800">
                              <div
                                className={`h-full w-full origin-left ${
                                  t.isOverflowing
                                    ? 'bg-rose-500'
                                    : t.fillPct > 85
                                    ? 'bg-amber-400'
                                    : t.isDraining
                                    ? 'bg-emerald-400'
                                    : 'bg-sky-400'
                                }`}
                                style={{ transform: `scaleX(${t.fillPct / 100})` }}
                              />
                            </div>

                            <div className="mt-2 flex items-center justify-between font-mono-tabular text-[10px] text-slate-400">
                              <span>
                                Sent: <strong className="text-slate-200">{t.deliveredSoFarGb.toFixed(1)}G</strong>
                              </span>
                              <span
                                className={
                                  t.overflowSoFarGb > 0
                                    ? 'text-rose-400 font-semibold'
                                    : 'text-slate-500'
                                }
                              >
                                Lost: {t.overflowSoFarGb.toFixed(1)}G
                              </span>
                              <span>
                                {t.netRateGbPerHour >= 0 ? '+' : ''}
                                {t.netRateGbPerHour.toFixed(0)} G/h
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setLeftOpen(true)}
                  title="Expand Telemetry Drawer"
                  className="hud-transition flex items-center gap-1 rounded-md hud-panel-clean px-2 py-2 font-mono-tabular text-[10px] font-bold uppercase tracking-wider text-sky-300 hover:text-white cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                  <span>TLM</span>
                </button>
              )}
            </aside>

            {/* RIGHT OPERATIONS DRAWER (Clean 2 Tabs: Score | What-If; Clash tab removed!) */}
            <aside className="pointer-events-auto flex items-start">
              {rightOpen ? (
                <div className="flex w-[296px] max-h-[calc(100vh-145px)] flex-col rounded-lg hud-panel-clean p-2.5 overflow-y-auto hud-scroll">
                  <div className="flex items-center justify-between gap-1.5 pb-2 border-b border-slate-800/80">
                    <button
                      onClick={() => setRightOpen(false)}
                      title="Collapse Operations Drawer"
                      className="hud-transition rounded border border-slate-800 bg-slate-950 p-1 text-slate-400 hover:border-slate-600 hover:text-white cursor-pointer"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>

                    <div className="grid flex-1 grid-cols-2 gap-1 rounded-md bg-slate-950 p-0.5 border border-slate-800">
                      {(
                        [
                          ['scoreboard', 'Score'],
                          ['whatif', 'What-If'],
                        ] as const
                      ).map(([tabKey, label]) => (
                        <button
                          key={tabKey}
                          onClick={() => setRightTab(tabKey)}
                          className={`hud-transition rounded py-1 font-mono-tabular text-[10px] font-bold uppercase tracking-wider cursor-pointer ${
                            rightTab === tabKey
                              ? 'bg-sky-500 text-slate-950'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-2.5">
                    {rightTab === 'scoreboard' && scoreboard && (
                      <ScoreboardPanel
                        scoreboard={scoreboard}
                        activeMethod={method}
                        onSelectMethod={setMethod}
                      />
                    )}

                    {rightTab === 'whatif' && (
                      <WhatIfPanel
                        isPlacingStation={isPlacingStation}
                        onTogglePlacing={() => setIsPlacingStation((v) => !v)}
                        stagedAntennas={stagedAntennas}
                        appliedAntennas={appliedAntennas}
                        onAddPreset={handleAddPreset}
                        onRemoveAntenna={handleRemoveCustomAntenna}
                        onRerunEngine={handleRerunEngine}
                        onResetBaseline={handleResetBaseline}
                        baseScoreboard={baseScoreboard}
                        currentScoreboard={scoreboard}
                        lastComputeMs={lastComputeMs}
                        hasUnappliedChanges={hasUnappliedChanges}
                      />
                    )}
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setRightOpen(true)}
                  title="Expand Operations Drawer"
                  className="hud-transition flex items-center gap-1 rounded-md hud-panel-clean px-2 py-2 font-mono-tabular text-[10px] font-bold uppercase tracking-wider text-sky-300 hover:text-white cursor-pointer"
                >
                  <span>OPS</span>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              )}
            </aside>
          </div>
        )}
      </div>

      <HowToReadModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </div>
  );
}

/**
 * Lightweight SPA Router:
 *  - `/`                 -> Project Landing Page & Interactive 3D Explainer
 *  - `/landing-page`     -> Project Landing Page (backward compatibility)
 *  - `/console`, `/app`  -> 3D Mission Control Console
 *  - `?view=console`     -> 3D Mission Control Console (same-page toggle)
 *  - any other path      -> Custom Branded 404 Page
 */
export default function App() {
  const [currentUrl, setCurrentUrl] = useState<string>(
    () => window.location.pathname + window.location.search
  );

  useEffect(() => {
    const onPopState = () => setCurrentUrl(window.location.pathname + window.location.search);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((nextPath: string) => {
    if (window.location.pathname + window.location.search !== nextPath) {
      window.history.pushState({}, '', nextPath);
      setCurrentUrl(nextPath);
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, []);

  const pathname = currentUrl.split('?')[0];
  const search = currentUrl.includes('?') ? currentUrl.substring(currentUrl.indexOf('?')) : '';
  const searchParams = new URLSearchParams(search);
  const normalized = pathname.replace(/\/+$/, '') || '/';

  // Support same-page query param toggle (?view=console or ?tab=console) OR dedicated route (/console, /app)
  const isConsoleRoute =
    normalized === '/console' ||
    normalized === '/app' ||
    normalized === '/mission-control' ||
    searchParams.get('view') === 'console' ||
    searchParams.get('tab') === 'console';

  if (isConsoleRoute) {
    return <MissionConsole onNavigate={navigate} />;
  }

  if (normalized === '/' || normalized === '/landing-page' || normalized === '/landing') {
    return <LandingPage onLaunchConsole={() => navigate('/console')} />;
  }

  return (
    <NotFoundPage
      onGoHome={() => navigate('/')}
      onGoConsole={() => navigate('/console')}
    />
  );
}
