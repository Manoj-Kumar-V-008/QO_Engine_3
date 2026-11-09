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
} from 'lucide-react';
import type {
  PassRecord,
  PassesDocument,
  ScenarioData,
  ScheduleDocument,
  TlesMap,
} from './types/engine';
import {
  antennaCartesian,
  buildSatellitePositionProperty,
  computeFootprintRadiusMeters,
} from './lib/orbit';

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

  const [method, setMethod] = useState<'greedy' | 'optimizer'>('optimizer');
  const [showGhostWeb, setShowGhostWeb] = useState<boolean>(true);
  const [showFootprints, setShowFootprints] = useState<boolean>(true);

  const [currentTimeMs, setCurrentTimeMs] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [speed, setSpeed] = useState<number>(60);
  const [trackedTarget, setTrackedTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs used inside high-frequency Cesium CallbackProperties (avoids rebuilding scene on toggle)
  const methodRef = useRef<'greedy' | 'optimizer'>(method);
  const chosenSetsRef = useRef<{ greedy: Set<string>; optimizer: Set<string> }>({
    greedy: new Set(),
    optimizer: new Set(),
  });
  const showGhostWebRef = useRef<boolean>(showGhostWeb);

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
    if (!viewerRef.current || !scenario) return;
    for (const ant of scenario.antennas) {
      const footprintEntity = viewerRef.current.entities.getById(`footprint-${ant.id}`);
      const highElEntity = viewerRef.current.entities.getById(`footprint-high-${ant.id}`);
      if (footprintEntity) footprintEntity.show = showFootprints;
      if (highElEntity) highElEntity.show = showFootprints;
    }
  }, [showFootprints, scenario]);

  // 1. Load static JSON files for Phase 2
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
    ])
      .then(
        ([scenarioData, tlesData, passesData, greedyData, optimizerData]: [
          ScenarioData,
          TlesMap,
          PassesDocument,
          ScheduleDocument,
          ScheduleDocument,
        ]) => {
          setScenario(scenarioData);
          setTles(tlesData);
          setPassesDoc(passesData);
          setSchedules({ greedy: greedyData, optimizer: optimizerData });
          chosenSetsRef.current = {
            greedy: new Set(greedyData.assignments.map((a) => a.pass_id)),
            optimizer: new Set(optimizerData.assignments.map((a) => a.pass_id)),
          };
          setCurrentTimeMs(new Date(scenarioData.start_utc).getTime());
        }
      )
      .catch((err) => setError(err.message));
  }, []);

  // 2. Initialize Cesium Globe + Satellites + Antennas + 61 Ghost Links + Dynamic Downlink Beams
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

    // A. Create Satellites (SGP4 Orbits)
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

    // B. Create Ground Station Antennas + Visibility Footprints (min_elevation_deg & 30 deg full-rate inner ring)
    const antPositions: Record<string, Cesium.Cartesian3> = {};
    antEntitiesRef.current = {};

    for (const ant of scenario.antennas) {
      const pos = antennaCartesian(ant);
      antPositions[ant.id] = pos;

      const cssColor = ANT_COLORS[ant.id] ?? '#34d399';
      const color = Cesium.Color.fromCssColorString(cssColor);
      const outerRadius = computeFootprintRadiusMeters(ant.min_elevation_deg, 786);
      const innerFullRateRadius = computeFootprintRadiusMeters(30.0, 786);

      // Dish Station Point & Label
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

      // Outer Visibility Footprint (5 deg minimum elevation horizon)
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

      // Inner 30-deg Elevation Ring (where downlink rate reaches 100% / 560 Mbps)
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

    // C. All 61 Passes: Static Ghost Web (dish -> satellite peak position) + Live Dynamic Downlink Beams
    ghostEntitiesRef.current = [];

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

      // 1. Static Ghost Link (shows all 61 candidate pass geometries considered by the engine)
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

      // 2. Live Chosen Downlink Beam (bright glowing laser beam while pass is active AND chosen by active method)
      const beamMaterial = new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.35,
        taperPower: 0.8,
        color: satColor,
      });

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
          material: beamMaterial,
        },
      });

      // 3. Live Unchosen Candidate Pass (faint dashed ghost tether while pass is in-window but NOT chosen)
      viewer.entities.add({
        id: `beam-unchosen-${p.pass_id}`,
        availability: new Cesium.TimeIntervalCollection([
          new Cesium.TimeInterval({ start: aosJd, stop: losJd }),
        ]),
        polyline: {
          positions: new Cesium.CallbackProperty((time?: Cesium.JulianDate) => {
            if (!time) return [];
            const isChosen = chosenSetsRef.current[methodRef.current].has(p.pass_id);
            if (isChosen) return [];
            const currentSatPos = satProp.getValue(time);
            return currentSatPos ? [antPos, currentSatPos] : [];
          }, false),
          width: 2,
          arcType: Cesium.ArcType.NONE,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.SLATEGRAY.withAlpha(0.55),
            dashLength: 12,
          }),
        },
      });
    }

    // Center initial camera over Europe / Arctic (Svalbard, Kiruna, Matera)
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(18.0, 58.0, 1.65e7),
      duration: 0,
    });

    // Sync React HUD clock at ~10Hz
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
  }, [scenario, tles, passesDoc, schedules]);

  // Compute currently active passes and schedule differences for the HUD
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

  const jumpToNextPass = (onlyDiff = false) => {
    if (!passesDoc) return;
    const pool: PassRecord[] = onlyDiff
      ? diffPasses
      : passesDoc.passes.filter((p) => chosenSet.has(p.pass_id));
    if (pool.length === 0) return;

    const next =
      pool.find((p) => new Date(p.aos_utc).getTime() > currentTimeMs + 5000) ?? pool[0];
    // Jump 15 seconds into the pass so the beam is immediately visible
    const targetMs = new Date(next.aos_utc).getTime() + 15000;
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

  const startMs = scenario ? new Date(scenario.start_utc).getTime() : 0;
  const endMs = scenario ? startMs + scenario.duration_hours * 3600 * 1000 : 100;
  const isoClock = currentTimeMs
    ? new Date(currentTimeMs).toISOString().replace(/\.\d{3}Z$/, ' UTC')
    : '';
  const activeSchedule = schedules ? schedules[method] : null;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 select-none">
      {/* 3D Cesium Canvas */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Top-Left Mission & Camera Bar */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2.5 max-w-xl">
        <div className="flex items-center gap-4 rounded-xl border border-slate-800/80 bg-slate-950/85 px-4 py-3 backdrop-blur-md shadow-xl">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-sky-400">
                QO Engine 3 • Phase 2: Dishes, Ghost Web & Live Beams
              </span>
            </div>
            <div className="mt-1 font-mono text-lg font-bold tracking-tight text-white">
              {isoClock || 'Loading ephemeris...'}
            </div>
          </div>

          {/* Satellite Camera Lock */}
          {scenario && (
            <div className="flex items-center gap-1.5 border-l border-slate-800 pl-4">
              {scenario.satellites.map((sat) => {
                const targetKey = `sat-${sat.id}`;
                const active = trackedTarget === targetKey;
                return (
                  <button
                    key={sat.id}
                    onClick={() => handleTrackEntity(active ? null : targetKey)}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-mono font-medium transition cursor-pointer ${
                      active
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-400/50'
                        : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                    }`}
                  >
                    <Satellite className="w-3.5 h-3.5" style={{ color: SAT_COLORS[sat.id] }} />
                    {sat.id}
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
            </div>
          )}
        </div>

        {/* Ground Station Pills + Layer Toggles */}
        {scenario && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-800/80 bg-slate-950/80 px-3 py-2 backdrop-blur-md">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mr-1">
              Ground Stations:
            </span>
            {scenario.antennas.map((ant) => {
              const targetKey = `ant-${ant.id}`;
              const active = trackedTarget === targetKey;
              return (
                <button
                  key={ant.id}
                  onClick={() => handleTrackEntity(active ? null : targetKey)}
                  className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-mono transition cursor-pointer ${
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

            <div className="h-4 w-px bg-slate-800 mx-1" />

            <button
              onClick={() => setShowGhostWeb((v) => !v)}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-mono transition cursor-pointer border ${
                showGhostWeb
                  ? 'bg-slate-800 text-sky-300 border-sky-500/40'
                  : 'bg-slate-900 text-slate-500 border-slate-800'
              }`}
              title="Toggle all 61 candidate pass ghost lines"
            >
              {showGhostWeb ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              61 Ghost Links
            </button>

            <button
              onClick={() => setShowFootprints((v) => !v)}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-mono transition cursor-pointer border ${
                showFootprints
                  ? 'bg-slate-800 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-900 text-slate-500 border-slate-800'
              }`}
              title="Toggle 5-deg and 30-deg ground visibility rings"
            >
              Footprints
            </button>
          </div>
        )}
      </div>

      {/* Top-Right Scheduler Toggle & Live Active Beam Monitor */}
      {schedules && activeSchedule && (
        <div className="absolute top-4 right-4 z-10 flex w-88 flex-col gap-2.5">
          {/* Greedy vs Optimizer Switcher */}
          <div className="rounded-xl border border-slate-800/90 bg-slate-950/85 p-3 backdrop-blur-md shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                Active Scheduler
              </span>
              <span className="text-[11px] font-mono text-emerald-400">
                {activeSchedule.summary.passes_used} / {activeSchedule.summary.passes_available} passes used
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-slate-900 p-1 border border-slate-800">
              {(['greedy', 'optimizer'] as const).map((m) => {
                const isSelected = method === m;
                const summary = schedules[m].summary;
                return (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    className={`flex flex-col items-start rounded-md px-3 py-2 text-left transition cursor-pointer ${
                      isSelected
                        ? 'bg-sky-500 text-slate-950 shadow-sm'
                        : 'text-slate-300 hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide">
                      {m === 'optimizer' && <Sparkles className="w-3.5 h-3.5" />}
                      {m}
                    </div>
                    <div
                      className={`text-[11px] font-mono mt-0.5 ${
                        isSelected ? 'text-slate-900 font-semibold' : 'text-slate-400'
                      }`}
                    >
                      {summary.gb_delivered.toFixed(0)} GB delivered
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Quick-Jump Buttons */}
            <div className="mt-2.5 flex items-center gap-1.5">
              <button
                onClick={() => jumpToNextPass(false)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-mono text-sky-300 hover:bg-slate-800 transition cursor-pointer"
              >
                <SkipForward className="w-3.5 h-3.5" />
                Next Active Beam
              </button>
              {diffPasses.length > 0 && (
                <button
                  onClick={() => jumpToNextPass(true)}
                  title="Jump to a pass where Greedy and Optimizer make different choices"
                  className="flex items-center justify-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-mono text-amber-300 hover:bg-amber-500/20 transition cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5" />
                  Diff ({diffPasses.length})
                </button>
              )}
            </div>
          </div>

          {/* Live Pass Window Telemetry Card */}
          <div className="rounded-xl border border-slate-800/90 bg-slate-950/85 p-3 backdrop-blur-md shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                Passes In Visibility Window
              </span>
              <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-mono text-slate-300 border border-slate-800">
                {activePassesNow.length} active
              </span>
            </div>

            {activePassesNow.length === 0 ? (
              <div className="rounded-lg border border-slate-800/60 bg-slate-900/50 px-3 py-3 text-xs font-mono text-slate-500 text-center">
                No satellite over a dish right now. Click &ldquo;Next Active Beam&rdquo; to jump.
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {activePassesNow.map((p) => {
                  const isChosen = chosenSet.has(p.pass_id);
                  const otherMethod = method === 'optimizer' ? 'greedy' : 'optimizer';
                  const chosenByOther = schedules[otherMethod].assignments.some(
                    (a) => a.pass_id === p.pass_id
                  );
                  return (
                    <div
                      key={p.pass_id}
                      className={`rounded-lg border px-3 py-2 text-xs font-mono transition ${
                        isChosen
                          ? 'border-sky-500/50 bg-sky-500/10 text-white'
                          : 'border-slate-800 bg-slate-900/60 text-slate-400'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold">
                          {p.pass_id.toUpperCase()} • {p.satellite_id} → {p.antenna_id}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                            isChosen
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {isChosen ? 'BEAM LOCKED' : 'GHOST (SKIPPED)'}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-300">
                        <span>Max El: {p.max_elevation_deg}°</span>
                        <span>Vol: {p.expected_volume_gb} GB</span>
                      </div>
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

      {/* Bottom Timeline & Speed Bar */}
      {scenario && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 flex w-[92%] max-w-4xl items-center gap-4 rounded-2xl border border-slate-800/90 bg-slate-950/85 px-5 py-3 backdrop-blur-md shadow-2xl">
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

          {/* 24-Hour Scrubber */}
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

          {/* Speed Multipliers (1x to 600x) */}
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
    </div>
  );
}
