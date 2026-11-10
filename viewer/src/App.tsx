import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import {
  Play,
  Pause,
  RotateCcw,
  Satellite,
  Compass,
  Radio,
  Eye,
  AlertTriangle,
  Database,
  Activity,
  ShieldAlert,
  HelpCircle,
  Gauge,
  Maximize2,
  Minimize2,
  Navigation,
  SkipForward,
  Zap,
} from 'lucide-react';
import type {
  AntennaConfig,
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
import { runWhatIfPipeline } from './lib/whatifEngine';
import ScoreboardPanel from './components/ScoreboardPanel';
import AnalyticsDrawer from './components/AnalyticsDrawer';
import HowToReadModal from './components/HowToReadModal';
import WhatIfPanel, { type PresetStation } from './components/WhatIfPanel';
import ConflictsPanel from './components/ConflictsPanel';
import GuidedTourBar from './components/GuidedTourBar';

const SAT_COLORS: Record<string, string> = {
  'sentinel-2a': '#38bdf8', // Sky cyan
  'sentinel-2b': '#c084fc', // Neon purple
};

const ANT_COLORS: Record<string, string> = {
  'svalbard-1': '#34d399', // Emerald
  'kiruna-1': '#fbbf24',   // Amber
  'matera-1': '#f472b6',   // Pink
};

const CUSTOM_ANT_COLOR = '#22d3ee';
const SPEED_OPTIONS = [1, 10, 60, 180, 300, 600];

export default function App() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const satEntitiesRef = useRef<Record<string, Cesium.Entity>>({});
  const satPropsRef = useRef<Record<string, Cesium.SampledPositionProperty>>({});
  const antPositionsRef = useRef<Record<string, Cesium.Cartesian3>>({});
  const ghostCollectionRef = useRef<Cesium.PolylineCollection | null>(null);

  // Direct DOM refs for 60fps playhead & range input (avoids 60fps React re-renders!)
  const scrubberInputRef = useRef<HTMLInputElement | null>(null);
  const chartPlayheadRef = useRef<HTMLDivElement | null>(null);

  // Baseline Data
  const [baseScenario, setBaseScenario] = useState<ScenarioData | null>(null);
  const [tles, setTles] = useState<TlesMap | null>(null);
  const [basePassesDoc, setBasePassesDoc] = useState<PassesDocument | null>(null);
  const [baseSchedules, setBaseSchedules] = useState<{
    greedy: ScheduleDocument;
    optimizer: ScheduleDocument;
  } | null>(null);
  const [baseScoreboard, setBaseScoreboard] = useState<ScoreboardDocument | null>(null);

  // Active Scenario State
  const [scenario, setScenario] = useState<ScenarioData | null>(null);
  const [passesDoc, setPassesDoc] = useState<PassesDocument | null>(null);
  const [schedules, setSchedules] = useState<{
    greedy: ScheduleDocument;
    optimizer: ScheduleDocument;
  } | null>(null);
  const [scoreboard, setScoreboard] = useState<ScoreboardDocument | null>(null);

  // Dock Tabs & Layout Modes
  const [leftTab, setLeftTab] = useState<'mission' | 'buffers'>('mission');
  const [rightTab, setRightTab] = useState<'scoreboard' | 'whatif' | 'conflicts'>('scoreboard');
  const [cinematicMode, setCinematicMode] = useState<boolean>(false);
  const [autoFadeIdle, setAutoFadeIdle] = useState<boolean>(false);
  const [isIdleFaded, setIsIdleFaded] = useState<boolean>(false);
  const [perfMode, setPerfMode] = useState<boolean>(true); // true = 0.8x fast crisp scale, false = 1.0x native
  const [ghostFilter, setGhostFilter] = useState<'all' | 'sentinel-2a' | 'sentinel-2b' | 'off'>('all');
  const [tourStep, setTourStep] = useState<number | null>(null);

  // What-If State
  const [isPlacingStation, setIsPlacingStation] = useState<boolean>(false);
  const [stagedAntennas, setStagedAntennas] = useState<AntennaConfig[]>([]);
  const [appliedAntennas, setAppliedAntennas] = useState<AntennaConfig[]>([]);
  const [lastComputeMs, setLastComputeMs] = useState<number | null>(null);

  const [method, setMethod] = useState<'greedy' | 'optimizer'>('optimizer');
  const [showConflicts3D, setShowConflicts3D] = useState<boolean>(true);
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);

  // Throttled (4Hz) React HUD timestamp
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [speed, setSpeed] = useState<number>(60);
  const [trackedTarget, setTrackedTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isPlacingRef = useRef<boolean>(isPlacingStation);
  useEffect(() => {
    isPlacingRef.current = isPlacingStation;
  }, [isPlacingStation]);

  // Keyboard shortcut: Press 'H' for Cinematic Mode, 'Space' for Play/Pause
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'h' || e.key === 'H') {
        setCinematicMode((v) => !v);
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

  // Optional 5-second idle auto-fade
  useEffect(() => {
    if (!autoFadeIdle || cinematicMode) {
      setIsIdleFaded(false);
      return;
    }
    let timer = window.setTimeout(() => setIsIdleFaded(true), 5000);
    const resetIdle = () => {
      setIsIdleFaded(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIsIdleFaded(true), 5000);
    };
    window.addEventListener('mousemove', resetIdle, { passive: true });
    window.addEventListener('mousedown', resetIdle, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('mousemove', resetIdle);
      window.removeEventListener('mousedown', resetIdle);
    };
  }, [autoFadeIdle, cinematicMode]);

  // Apply Performance Mode resolution scaling without destroying scene
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.resolutionScale = perfMode ? 0.8 : 1.0;
    viewer.scene.globe.maximumScreenSpaceError = perfMode ? 2.2 : 1.5;
  }, [perfMode]);

  // 1. Load static JSON files
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
          setBaseScenario(scenarioData);
          setTles(tlesData);
          setBasePassesDoc(passesData);
          setBaseSchedules({ greedy: greedyData, optimizer: optimizerData });
          setBaseScoreboard(scoreboardData);

          setScenario(scenarioData);
          setPassesDoc(passesData);
          setSchedules({ greedy: greedyData, optimizer: optimizerData });
          setScoreboard(scoreboardData);
          setCurrentTimeMs(new Date(scenarioData.start_utc).getTime());
        }
      )
      .catch((err) => setError(err.message));
  }, []);

  // Conflict structures
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

  const chosenSet = useMemo(() => {
    if (!schedules) return new Set<string>();
    return new Set(schedules[method].assignments.map((a) => a.pass_id));
  }, [schedules, method]);

  // Ref holding latest active pass & conflict lookup for the tiny pool of 5 dynamic beams
  const liveSceneStateRef = useRef<{
    passes: PassRecord[];
    chosenSet: Set<string>;
    conflictIndex: Record<
      string,
      { otherPassId: string; reason: 'same_antenna' | 'same_satellite' }[]
    >;
    showConflicts3D: boolean;
  }>({
    passes: [],
    chosenSet: new Set(),
    conflictIndex: {},
    showConflicts3D: true,
  });

  useEffect(() => {
    liveSceneStateRef.current = {
      passes: passesDoc?.passes ?? [],
      chosenSet,
      conflictIndex,
      showConflicts3D,
    };
  }, [passesDoc, chosenSet, conflictIndex, showConflicts3D]);

  // 2. Initialize Cesium Viewer ONCE with High-FPS WebGL settings
  useEffect(() => {
    if (!containerRef.current || !baseScenario || !tles) return;

    const startJd = Cesium.JulianDate.fromIso8601(baseScenario.start_utc);
    const stopJd = Cesium.JulianDate.addHours(
      startJd,
      baseScenario.duration_hours,
      new Cesium.JulianDate()
    );
    const startMs = new Date(baseScenario.start_utc).getTime();
    const durationMs = baseScenario.duration_hours * 3600 * 1000;

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
      msaaSamples: 1, // Disable expensive 4x MSAA for smooth 60fps
      baseLayer: new Cesium.ImageryLayer(
        new Cesium.UrlTemplateImageryProvider({
          url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          credit: 'Esri World Imagery',
        })
      ),
    });

    viewer.resolutionScale = 0.8;
    viewer.scene.fog.enabled = false;
    viewer.scene.globe.maximumScreenSpaceError = 2.2;
    viewer.scene.globe.enableLighting = true;
    if (viewer.scene.skyAtmosphere) {
      viewer.scene.skyAtmosphere.hueShift = -0.05;
      viewer.scene.skyAtmosphere.brightnessShift = -0.15;
    }
    viewerRef.current = viewer;

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(18.0, 56.0, 1.75e7),
      duration: 0,
    });

    // Click handler for What-If Station Placement
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
          name: `Station-${idx}`,
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

    // 60fps direct DOM update for playheads + 4Hz (250ms) throttled React state update
    let lastReactSync = 0;
    const removeTickListener = viewer.clock.onTick.addEventListener((c) => {
      const ms = Cesium.JulianDate.toDate(c.currentTime).getTime();

      // 1. Update bottom range slider & chart playhead div directly at 60fps (0 React re-renders)
      if (scrubberInputRef.current) {
        scrubberInputRef.current.value = String(ms);
      }
      if (chartPlayheadRef.current) {
        const frac = Math.min(1, Math.max(0, (ms - startMs) / durationMs));
        const leftPct = 6.0 + frac * 92.25;
        chartPlayheadRef.current.style.left = `${leftPct}%`;
      }

      // 2. Throttle React HUD numbers to 4Hz (every 250ms)
      const now = performance.now();
      if (now - lastReactSync > 250) {
        lastReactSync = now;
        setCurrentTimeMs(ms);
        setIsPlaying(c.shouldAnimate);
      }
    });

    return () => {
      handler.destroy();
      removeTickListener();
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [baseScenario, tles]);

  // 3. Build Satellites, Antennas, and a Tiny Pool of 4 Dynamic Beams (2 Winner + 2 Conflict Loser)
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !scenario || !tles) return;

    viewer.entities.removeAll();
    satEntitiesRef.current = {};
    satPropsRef.current = {};
    antPositionsRef.current = {};

    const startJd = Cesium.JulianDate.fromIso8601(scenario.start_utc);
    const stopJd = Cesium.JulianDate.addHours(
      startJd,
      scenario.duration_hours,
      new Cesium.JulianDate()
    );

    // A. Precompute SGP4 SampledPositionProperty once per satellite
    for (const sat of scenario.satellites) {
      const tle = tles[sat.id];
      if (!tle) continue;

      const positionProp = buildSatellitePositionProperty(
        tle,
        scenario.start_utc,
        scenario.duration_hours,
        30
      );
      satPropsRef.current[sat.id] = positionProp;

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
          pixelSize: 11,
          color,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
        },
        label: {
          text: sat.id.toUpperCase(),
          font: '700 11px ui-monospace, SFMono-Regular, monospace',
          fillColor: color,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -16),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 4.5e7),
        },
        path: {
          resolution: 45,
          leadTime: 2700,
          trailTime: 2700,
          width: 1.5,
          material: color.withAlpha(0.55), // Simple fast material instead of heavy shader glow
        },
      });

      satEntitiesRef.current[sat.id] = entity;

      // Create 1 reusable Active Downlink Beam per satellite (only 2 total in the entire scene!)
      viewer.entities.add({
        id: `active-beam-${sat.id}`,
        polyline: {
          positions: new Cesium.CallbackProperty((time?: Cesium.JulianDate) => {
            if (!time) return [];
            const ms = Cesium.JulianDate.toDate(time).getTime();
            const state = liveSceneStateRef.current;
            const activeWinner = state.passes.find(
              (p) =>
                p.satellite_id === sat.id &&
                state.chosenSet.has(p.pass_id) &&
                ms >= new Date(p.aos_utc).getTime() &&
                ms <= new Date(p.los_utc).getTime()
            );
            if (!activeWinner) return [];
            const antPos = antPositionsRef.current[activeWinner.antenna_id];
            const satPos = positionProp.getValue(time);
            return antPos && satPos ? [antPos, satPos] : [];
          }, false),
          width: 6,
          arcType: Cesium.ArcType.NONE,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.3,
            color,
          }),
        },
      });

      // Create 1 reusable Conflict Loser Beam + Compact Clamped Label per satellite (only 2 total!)
      const crimsonRed = Cesium.Color.fromCssColorString('#ef4444');
      const findActiveLoser = (ms: number) => {
        const state = liveSceneStateRef.current;
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

      viewer.entities.add({
        id: `active-conflict-beam-${sat.id}`,
        polyline: {
          positions: new Cesium.CallbackProperty((time?: Cesium.JulianDate) => {
            if (!time) return [];
            const ms = Cesium.JulianDate.toDate(time).getTime();
            const match = findActiveLoser(ms);
            if (!match) return [];
            const antPos = antPositionsRef.current[match.loser.antenna_id];
            const satPos = positionProp.getValue(time);
            return antPos && satPos ? [antPos, satPos] : [];
          }, false),
          width: 3,
          arcType: Cesium.ArcType.NONE,
          material: new Cesium.PolylineDashMaterialProperty({
            color: crimsonRed.withAlpha(0.92),
            dashLength: 14,
          }),
        },
      });

      viewer.entities.add({
        id: `active-conflict-label-${sat.id}`,
        position: new Cesium.CallbackProperty((time?: Cesium.JulianDate) => {
          if (!time) return Cesium.Cartesian3.ZERO;
          const ms = Cesium.JulianDate.toDate(time).getTime();
          const match = findActiveLoser(ms);
          if (!match) return Cesium.Cartesian3.ZERO;
          const antPos = antPositionsRef.current[match.loser.antenna_id];
          const satPos = positionProp.getValue(time);
          if (!antPos || !satPos) return Cesium.Cartesian3.ZERO;
          return Cesium.Cartesian3.midpoint(antPos, satPos, new Cesium.Cartesian3());
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
            const shortReason =
              match.win.reason === 'same_antenna' ? 'SAME_ANTENNA' : 'SAME_SAT';
            return `⚠ ${match.loser.pass_id.toUpperCase()} DROPPED (${shortReason})`;
          }, false),
          font: '700 10px ui-monospace, SFMono-Regular, monospace',
          fillColor: Cesium.Color.fromCssColorString('#fecaca'),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -6),
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('#450a0a').withAlpha(0.88),
          backgroundPadding: new Cesium.Cartesian2(6, 3),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new Cesium.NearFarScalar(2.0e6, 1.0, 2.2e7, 0.75),
        },
      });
    }

    // B. Ground Stations + Lightweight Single Footprint Outline
    const allDisplayAntennas: AntennaConfig[] = [
      ...scenario.antennas,
      ...stagedAntennas.filter(
        (st) => !scenario.antennas.some((existing) => existing.id === st.id)
      ),
    ];

    for (const ant of allDisplayAntennas) {
      const pos = antennaCartesian(ant);
      antPositionsRef.current[ant.id] = pos;

      const isBaseline = Boolean(ANT_COLORS[ant.id]);
      const isApplied = scenario.antennas.some((a) => a.id === ant.id);
      const cssColor = ANT_COLORS[ant.id] ?? (isApplied ? CUSTOM_ANT_COLOR : '#facc15');
      const color = Cesium.Color.fromCssColorString(cssColor);
      const outerRadius = computeFootprintRadiusMeters(ant.min_elevation_deg, 786);

      viewer.entities.add({
        id: `ant-${ant.id}`,
        name: `${ant.name} (${ant.id})`,
        position: pos,
        point: {
          pixelSize: isBaseline ? 9 : 12,
          color,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
        },
        label: {
          text: isApplied
            ? `📡 ${ant.name.toUpperCase()}`
            : `✨ ${ant.name.toUpperCase()} (RE-RUN)`,
          font: '700 10px ui-monospace, SFMono-Regular, monospace',
          fillColor: color,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, 14),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3.2e7),
        },
      });

      viewer.entities.add({
        id: `footprint-${ant.id}`,
        position: Cesium.Cartesian3.fromDegrees(ant.lon_deg, ant.lat_deg, 0),
        ellipse: {
          semiMajorAxis: outerRadius,
          semiMinorAxis: outerRadius,
          height: 0,
          material: color.withAlpha(0.05),
          outline: true,
          outlineColor: color.withAlpha(0.45),
          outlineWidth: 1,
        },
      });
    }
  }, [scenario, tles, stagedAntennas]);

  // 4. Rebuild Single Merged Cesium.PolylineCollection Primitive for Ghost Links (Ultra-Fast!)
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !passesDoc) return;

    if (ghostCollectionRef.current) {
      viewer.scene.primitives.remove(ghostCollectionRef.current);
      ghostCollectionRef.current = null;
    }

    if (ghostFilter === 'off') return;

    const collection = new Cesium.PolylineCollection();
    for (const p of passesDoc.passes) {
      if (ghostFilter !== 'all' && p.satellite_id !== ghostFilter) continue;

      const antPos = antPositionsRef.current[p.antenna_id];
      const satProp = satPropsRef.current[p.satellite_id];
      if (!antPos || !satProp) continue;

      const aosJd = Cesium.JulianDate.fromIso8601(p.aos_utc);
      const losJd = Cesium.JulianDate.fromIso8601(p.los_utc);
      const midSeconds = Cesium.JulianDate.secondsDifference(losJd, aosJd) / 2;
      const midJd = Cesium.JulianDate.addSeconds(aosJd, midSeconds, new Cesium.JulianDate());
      const peakSatPos = satProp.getValue(midJd);
      if (!peakSatPos) continue;

      const isChosen = chosenSet.has(p.pass_id);
      const satColor = Cesium.Color.fromCssColorString(
        SAT_COLORS[p.satellite_id] ?? '#38bdf8'
      );
      const lineColor = isChosen
        ? satColor.withAlpha(0.24)
        : Cesium.Color.SLATEBLUE.withAlpha(0.09);

      collection.add({
        positions: [antPos, peakSatPos],
        width: isChosen ? 1.2 : 0.8,
        material: Cesium.Material.fromType('Color', { color: lineColor }),
      });
    }

    viewer.scene.primitives.add(collection);
    ghostCollectionRef.current = collection;
  }, [passesDoc, chosenSet, ghostFilter, scenario, stagedAntennas]);

  // Derived schedules & telemetry
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
  const handleScrub = useCallback(
    (ms: number) => {
      if (!viewerRef.current) return;
      viewerRef.current.clock.currentTime = Cesium.JulianDate.fromDate(new Date(ms));
      setCurrentTimeMs(ms);
    },
    []
  );

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
      let pool: PassRecord[] = [];
      if (mode === 'diff') pool = diffPasses;
      else if (mode === 'conflict') pool = conflictLoserPasses;
      else pool = passesDoc.passes.filter((p) => chosenSet.has(p.pass_id));

      if (pool.length === 0) return;
      const next =
        pool.find((p) => new Date(p.aos_utc).getTime() > currentTimeMs + 5000) ?? pool[0];
      const targetMs = new Date(next.aos_utc).getTime() + 20000;
      handleScrub(targetMs);
    },
    [passesDoc, diffPasses, conflictLoserPasses, chosenSet, currentTimeMs, handleScrub]
  );

  const handleTrackEntity = (targetId: string | null) => {
    if (!viewerRef.current) return;
    if (!targetId) {
      viewerRef.current.trackedEntity = undefined;
      setTrackedTarget(null);
      viewerRef.current.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(18.0, 56.0, 1.75e7),
        duration: 1.1,
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
          duration: 1.1,
        });
      }
    }
  };

  // Guided Tour Step Orchestrator
  const handleSelectTourStep = (idx: number) => {
    setTourStep(idx);
    setCinematicMode(false);
    if (!viewerRef.current || !passesDoc) return;

    if (idx === 0) {
      setLeftTab('mission');
      setRightTab('scoreboard');
      handleTrackEntity(null);
    } else if (idx === 1) {
      setLeftTab('buffers');
      setRightTab('scoreboard');
      const firstChosen = passesDoc.passes.find((p) => chosenSet.has(p.pass_id));
      if (firstChosen) {
        handleScrub(new Date(firstChosen.aos_utc).getTime() + 30000);
      }
    } else if (idx === 2) {
      setLeftTab('mission');
      setRightTab('conflicts');
      setShowConflicts3D(true);
      if (conflictLoserPasses.length > 0) {
        handleScrub(new Date(conflictLoserPasses[0].aos_utc).getTime() + 25000);
      }
    } else if (idx === 3) {
      setLeftTab('mission');
      setRightTab('scoreboard');
      if (diffPasses.length > 0) {
        handleScrub(new Date(diffPasses[0].aos_utc).getTime() + 25000);
      }
    } else if (idx === 4) {
      setLeftTab('buffers');
      setRightTab('whatif');
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
      viewerRef.current.trackedEntity = undefined;
      setTrackedTarget(null);
      viewerRef.current.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(preset.lon_deg, preset.lat_deg, 1.5e7),
        duration: 1.1,
      });
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

  const anyOverflowing =
    fleetTelemetry &&
    Object.values(fleetTelemetry.satellites).some((s) => s.isOverflowing);

  const railOpacityClass = isIdleFaded
    ? 'opacity-15 hover:opacity-100 transition-opacity duration-500'
    : 'opacity-100 transition-opacity duration-200';

  return (
    <div
      className={`relative w-screen h-screen overflow-hidden bg-slate-950 select-none ${
        isPlacingStation ? 'cursor-crosshair' : ''
      }`}
    >
      {/* Loading Screen */}
      {isLoading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 text-slate-100">
          <div className="h-10 w-10 rounded-full border-2 border-sky-400 border-t-transparent animate-spin mb-4" />
          <div className="font-mono text-sm font-bold uppercase tracking-widest text-sky-400">
            Initializing QO Engine 3 Ephemeris...
          </div>
        </div>
      )}

      {/* Full-Screen 3D Cesium Canvas */}
      <div ref={containerRef} className="fixed inset-0 w-full h-full" />

      {/* Top Banner when Placing a New Ground Station */}
      {isPlacingStation && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-full border border-amber-400 bg-slate-950/95 px-5 py-2 text-xs font-mono font-bold text-amber-300 shadow-[0_0_25px_rgba(251,191,36,0.35)]">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400 animate-ping" />
          CLICK ANYWHERE ON THE 3D EARTH TO PLACE A NEW GROUND STATION
          <button
            onClick={() => setIsPlacingStation(false)}
            className="ml-2 rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300 hover:text-white cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Floating Restore Button when in Cinematic Mode (Press H) */}
      {cinematicMode && (
        <div className="fixed top-4 right-4 z-30 flex items-center gap-2">
          <button
            onClick={() => setCinematicMode(false)}
            className="flex items-center gap-1.5 rounded-xl border border-sky-500/40 bg-slate-950/85 px-3 py-2 text-xs font-mono font-bold text-sky-300 hover:bg-slate-900 backdrop-blur-md shadow-xl cursor-pointer"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            Exit Cinematic (H)
          </button>
        </div>
      )}

      {/* =======================================================================
          NON-OVERLAPPING 3-COLUMN CSS GRID OVERLAY
          Col 1: Left Dock (330px) | Col 2: Open Center Globe + Bottom Bar (1fr) | Col 3: Right Dock (350px)
         ======================================================================= */}
      <div className="relative z-10 grid h-screen w-screen grid-cols-[auto_1fr_auto] grid-rows-[1fr_auto] gap-3 p-3 pointer-events-none">
        {/* ----------------- COLUMN 1: LEFT DOCK (Mission | Buffers) ----------------- */}
        <aside
          className={`row-span-2 flex w-[335px] flex-col gap-2 pointer-events-auto ${
            cinematicMode ? 'hidden' : railOpacityClass
          }`}
        >
          <div className="flex flex-col rounded-2xl border border-slate-800/90 bg-slate-950/88 p-3 backdrop-blur-md shadow-2xl">
            {/* Header & Clock */}
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-sky-400">
                    QO Engine 3 • Control
                  </span>
                </div>
                <div className="mt-0.5 font-mono text-sm font-bold tracking-tight text-white">
                  {isoClock || 'Loading ephemeris...'}
                </div>
              </div>

              {/* Top Utility Buttons: Tour, Perf, Cinematic, Help */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleSelectTourStep(tourStep === null ? 0 : 0)}
                  title="Start 5-Step Guided Tour"
                  className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-mono font-bold transition cursor-pointer border ${
                    tourStep !== null
                      ? 'bg-sky-500 text-slate-950 border-sky-400'
                      : 'bg-sky-500/15 text-sky-300 border-sky-500/40 hover:bg-sky-500/25'
                  }`}
                >
                  <Navigation className="w-3 h-3" />
                  Tour
                </button>
                <button
                  onClick={() => setCinematicMode(true)}
                  title="Cinematic Mode (Shortcut: H)"
                  className="rounded-lg bg-slate-900 p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-800 cursor-pointer"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setIsHelpOpen(true)}
                  title="How to read this scene"
                  className="rounded-lg bg-slate-900 p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-800 cursor-pointer"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Left Dock Tab Switcher: Mission vs Buffers */}
            <div className="mt-2.5 grid grid-cols-2 gap-1 rounded-xl bg-slate-900 p-1 border border-slate-800">
              <button
                onClick={() => setLeftTab('mission')}
                className={`rounded-lg py-1.5 text-xs font-mono font-bold uppercase transition cursor-pointer ${
                  leftTab === 'mission'
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Mission & Trail
              </button>
              <button
                onClick={() => setLeftTab('buffers')}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-mono font-bold uppercase transition cursor-pointer ${
                  leftTab === 'buffers'
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>Buffers</span>
                {anyOverflowing && (
                  <span className="h-2 w-2 rounded-full bg-red-500 animate-ping" />
                )}
              </button>
            </div>

            {/* TAB 1: MISSION & DATA TRAIL */}
            {leftTab === 'mission' && scenario && fleetTelemetry && activeSchedule && (
              <div className="mt-3 flex flex-col gap-2.5">
                {/* Live Ticking Data Trail */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-400">
                      <Database className="w-3.5 h-3.5 text-emerald-400" />
                      Downlinked So Far
                    </div>
                    {fleetTelemetry.activeBeamCount > 0 ? (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-300 border border-emerald-500/40 animate-pulse">
                        <Activity className="w-3 h-3" />
                        +{fleetTelemetry.activeDownlinkMbps.toFixed(0)} Mbps
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-slate-500">
                        Idle (Collecting)
                      </span>
                    )}
                  </div>

                  <div className="mt-1.5 flex items-baseline justify-between">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-mono text-2xl font-extrabold text-white">
                        {fleetTelemetry.totalDeliveredSoFarGb.toFixed(1)}
                      </span>
                      <span className="font-mono text-xs font-semibold text-emerald-400">
                        / {fleetTelemetry.totalPlannedGb.toFixed(0)} GB
                      </span>
                    </div>
                    <div className="text-right font-mono text-[10px]">
                      <div
                        className={
                          liveDeltaGb > 0.05
                            ? 'text-emerald-400 font-bold'
                            : liveDeltaGb < -0.05
                            ? 'text-amber-400'
                            : 'text-slate-400'
                        }
                      >
                        {liveDeltaGb >= 0 ? `+${liveDeltaGb.toFixed(1)}` : liveDeltaGb.toFixed(1)} GB vs{' '}
                        {method === 'optimizer' ? 'greedy' : 'optimizer'}
                      </div>
                      <div className="text-red-400/90">
                        Spilled: {fleetTelemetry.totalOverflowSoFarGb.toFixed(0)} GB
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-950 border border-slate-800">
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

                {/* Camera Target Lock: Satellites & Ground Stations */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                      Camera Follow Target
                    </span>
                    <button
                      onClick={() => handleTrackEntity(null)}
                      className="flex items-center gap-1 text-[10px] font-mono text-sky-400 hover:underline cursor-pointer"
                    >
                      <Compass className="w-3 h-3" />
                      Reset Globe
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {scenario.satellites.map((sat) => {
                      const key = `sat-${sat.id}`;
                      const active = trackedTarget === key;
                      return (
                        <button
                          key={sat.id}
                          onClick={() => handleTrackEntity(active ? null : key)}
                          className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-mono transition cursor-pointer border ${
                            active
                              ? 'bg-sky-500/20 text-sky-300 border-sky-400/50'
                              : 'bg-slate-950 text-slate-300 hover:bg-slate-800 border-slate-800'
                          }`}
                        >
                          <Satellite
                            className="w-3 h-3"
                            style={{ color: SAT_COLORS[sat.id] }}
                          />
                          {sat.id}
                        </button>
                      );
                    })}

                    {scenario.antennas.map((ant) => {
                      const key = `ant-${ant.id}`;
                      const active = trackedTarget === key;
                      const color = ANT_COLORS[ant.id] ?? CUSTOM_ANT_COLOR;
                      return (
                        <button
                          key={ant.id}
                          onClick={() => handleTrackEntity(active ? null : key)}
                          className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-mono transition cursor-pointer border ${
                            active
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50'
                              : 'bg-slate-950 text-slate-300 hover:bg-slate-800 border-slate-800'
                          }`}
                        >
                          <Radio className="w-3 h-3" style={{ color }} />
                          {ant.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Scene Layer & Performance Controls */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-2.5 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <Eye className="w-3 h-3 text-sky-400" />
                      Ghost Links ({passesDoc?.passes.length ?? 0})
                    </span>
                    <div className="flex items-center gap-1 rounded-lg bg-slate-950 p-0.5 border border-slate-800">
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
                          className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold transition cursor-pointer ${
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

                  <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-slate-800/70">
                    <button
                      onClick={() => setShowConflicts3D((v) => !v)}
                      className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1 text-[10px] font-mono transition cursor-pointer border ${
                        showConflicts3D
                          ? 'bg-red-950/60 text-red-300 border-red-500/40'
                          : 'bg-slate-950 text-slate-500 border-slate-800'
                      }`}
                    >
                      <ShieldAlert className="w-3 h-3" />
                      3D Clashes ({conflictCountsByReason.total})
                    </button>

                    <button
                      onClick={() => setPerfMode((v) => !v)}
                      title="Toggle Performance Mode (0.8x resolutionScale, no MSAA)"
                      className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-mono transition cursor-pointer border ${
                        perfMode
                          ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                          : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      <Gauge className="w-3 h-3" />
                      {perfMode ? 'Perf 60fps' : 'HD 1.0x'}
                    </button>
                  </div>

                  <label className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-800/70 cursor-pointer">
                    <span>Auto-fade panels after 5s idle</span>
                    <input
                      type="checkbox"
                      checked={autoFadeIdle}
                      onChange={(e) => setAutoFadeIdle(e.target.checked)}
                      className="accent-sky-400 cursor-pointer"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* TAB 2: ONBOARD STORAGE BUFFERS */}
            {leftTab === 'buffers' && scenario && fleetTelemetry && (
              <div className="mt-3 flex flex-col gap-2.5">
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span>Capacity: 300 GB / sat</span>
                  <span>Generation: +62.5 GB/h</span>
                </div>

                {scenario.satellites.map((sat) => {
                  const t = fleetTelemetry.satellites[sat.id];
                  if (!t) return null;
                  const satColor = SAT_COLORS[sat.id] ?? '#38bdf8';

                  return (
                    <div
                      key={sat.id}
                      className={`rounded-xl border p-3 transition ${
                        t.isOverflowing
                          ? 'border-red-500 bg-red-950/45 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
                          : t.isDraining
                          ? 'border-emerald-500/50 bg-emerald-950/20'
                          : 'border-slate-800 bg-slate-900/60'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-mono">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: satColor }}
                          />
                          <span className="font-bold uppercase text-white">
                            {sat.id}
                          </span>
                          {t.isOverflowing && (
                            <span className="flex items-center gap-1 rounded bg-red-500 px-1.5 py-0.5 text-[9px] font-extrabold text-slate-950 animate-pulse">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              OVERFLOW
                            </span>
                          )}
                          {!t.isOverflowing && t.isDraining && (
                            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300 border border-emerald-500/40">
                              DRAINING
                            </span>
                          )}
                        </div>

                        <div className="font-bold text-white">
                          {t.levelGb.toFixed(1)}{' '}
                          <span className="text-slate-400 font-normal">
                            / {t.capacityGb} GB
                          </span>
                        </div>
                      </div>

                      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-950 border border-slate-800">
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

                      <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-slate-400">
                        <span>
                          Sent:{' '}
                          <strong className="text-slate-200">
                            {t.deliveredSoFarGb.toFixed(1)} GB
                          </strong>
                        </span>
                        <span
                          className={
                            t.overflowSoFarGb > 0
                              ? 'text-red-400 font-semibold'
                              : 'text-slate-500'
                          }
                        >
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
            )}
          </div>
        </aside>

        {/* ----------------- COLUMN 2: FREE CENTER VIEWPORT + BOTTOM TRANSPORT BAR ----------------- */}
        <main className="col-start-2 row-span-2 flex flex-col justify-end items-center pointer-events-none">
          <div className="w-full max-w-3xl flex flex-col gap-2 pointer-events-auto">
            {/* Guided Tour Step Overlay (if active) */}
            {tourStep !== null && (
              <GuidedTourBar
                stepIndex={tourStep}
                onSelectStep={handleSelectTourStep}
                onClose={() => setTourStep(null)}
              />
            )}

            {/* Collapsible 24h Telemetry Chart (Starts collapsed; sits strictly in Center Column!) */}
            {!cinematicMode && scenario && passesDoc && schedules && (
              <AnalyticsDrawer
                scenario={scenario}
                passes={passesDoc.passes}
                schedules={schedules}
                activeMethod={method}
                playheadRef={chartPlayheadRef}
                onScrub={handleScrub}
              />
            )}

            {/* Bottom 24h Transport & Speed Bar */}
            {scenario && (
              <div className="flex w-full items-center gap-3 rounded-2xl border border-slate-800/90 bg-slate-950/90 px-4 py-2.5 backdrop-blur-md shadow-2xl">
                <button
                  onClick={togglePlay}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500 text-slate-950 hover:bg-sky-400 transition cursor-pointer"
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
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>

                <div className="flex flex-1 flex-col gap-0.5">
                  <input
                    ref={scrubberInputRef}
                    type="range"
                    min={startMs}
                    max={endMs}
                    step={5000}
                    defaultValue={startMs}
                    onChange={(e) => handleScrub(Number(e.target.value))}
                    className="w-full accent-sky-400 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-slate-400">
                    <span>{scenario.start_utc}</span>
                    <span>
                      +{((currentTimeMs - startMs) / 3600000).toFixed(1)}h /{' '}
                      {scenario.duration_hours}h
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-0.5 rounded-xl border border-slate-800 bg-slate-900/90 p-1">
                  {SPEED_OPTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => changeSpeed(s)}
                      className={`rounded-md px-2 py-1 text-[11px] font-mono font-semibold transition cursor-pointer ${
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
          </div>
        </main>

        {/* ----------------- COLUMN 3: RIGHT DOCK (Scoreboard | What-If | Conflicts) ----------------- */}
        <aside
          className={`col-start-3 row-span-2 flex w-[355px] flex-col gap-2 pointer-events-auto ${
            cinematicMode ? 'hidden' : railOpacityClass
          }`}
        >
          <div className="flex flex-col rounded-2xl border border-slate-800/90 bg-slate-950/88 p-3 backdrop-blur-md shadow-2xl">
            {/* Persistent Quick-Jump Row at Top of Right Dock (Never overlapped!) */}
            <div className="grid grid-cols-3 gap-1.5 border-b border-slate-800/80 pb-2.5">
              <button
                onClick={() => jumpToNextPass('beam')}
                className="flex items-center justify-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1.5 text-[10px] font-mono text-sky-300 hover:bg-slate-800 transition cursor-pointer"
              >
                <SkipForward className="w-3 h-3" />
                Next Beam
              </button>
              <button
                onClick={() => {
                  setRightTab('conflicts');
                  jumpToNextPass('conflict');
                }}
                className="flex items-center justify-center gap-1 rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-[10px] font-mono text-red-300 hover:bg-red-500/20 transition cursor-pointer"
              >
                <ShieldAlert className="w-3 h-3" />
                Next Clash
              </button>
              <button
                onClick={() => jumpToNextPass('diff')}
                className="flex items-center justify-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[10px] font-mono text-amber-300 hover:bg-amber-500/20 transition cursor-pointer"
              >
                <Zap className="w-3 h-3" />
                Diff ({diffPasses.length})
              </button>
            </div>

            {/* Right Dock 3-Tab Switcher */}
            <div className="mt-2.5 grid grid-cols-3 gap-1 rounded-xl bg-slate-900 p-1 border border-slate-800">
              {(
                [
                  ['scoreboard', 'Scoreboard'],
                  ['whatif', 'What-If'],
                  ['conflicts', `Clashes (${activePassesNow.length})`],
                ] as const
              ).map(([tabKey, label]) => (
                <button
                  key={tabKey}
                  onClick={() => setRightTab(tabKey)}
                  className={`rounded-lg py-1.5 text-[11px] font-mono font-bold uppercase transition cursor-pointer ${
                    rightTab === tabKey
                      ? 'bg-sky-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* TAB CONTENT */}
            <div className="mt-3">
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

              {rightTab === 'conflicts' && schedules && (
                <ConflictsPanel
                  activePassesNow={activePassesNow}
                  chosenSet={chosenSet}
                  schedules={schedules}
                  method={method}
                  passMap={passMap}
                  conflictIndex={conflictIndex}
                  currentTimeMs={currentTimeMs}
                  conflictCountsByReason={conflictCountsByReason}
                  diffPassesCount={diffPasses.length}
                  onJumpToNext={jumpToNextPass}
                />
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* How To Read Modal */}
      <HowToReadModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </div>
  );
}
