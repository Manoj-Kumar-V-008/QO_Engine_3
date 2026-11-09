import { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { Play, Pause, RotateCcw, Satellite, Compass } from 'lucide-react';
import type { ScenarioData, TlesMap } from './types/engine';
import { buildSatellitePositionProperty } from './lib/orbit';

const SAT_COLORS: Record<string, string> = {
  'sentinel-2a': '#38bdf8', // Sky cyan
  'sentinel-2b': '#c084fc', // Neon purple
};

const SPEED_OPTIONS = [1, 10, 60, 180, 300, 600];

export default function App() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const satEntitiesRef = useRef<Record<string, Cesium.Entity>>({});

  const [scenario, setScenario] = useState<ScenarioData | null>(null);
  const [tles, setTles] = useState<TlesMap | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [speed, setSpeed] = useState<number>(60);
  const [trackedSat, setTrackedSat] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 1. Load static JSON files from viewer/data/
  useEffect(() => {
    Promise.all([
      fetch('/data/scenario.json').then((r) => {
        if (!r.ok) throw new Error('Missing /data/scenario.json — run python -m engine.run data/scenario.json first');
        return r.json();
      }),
      fetch('/data/tles.json').then((r) => {
        if (!r.ok) throw new Error('Missing /data/tles.json — run python -m engine.run data/scenario.json first');
        return r.json();
      }),
    ])
      .then(([scenarioData, tlesData]: [ScenarioData, TlesMap]) => {
        setScenario(scenarioData);
        setTles(tlesData);
        setCurrentTimeMs(new Date(scenarioData.start_utc).getTime());
      })
      .catch((err) => setError(err.message));
  }, []);

  // 2. Initialize Cesium Globe + SGP4 Satellite Orbits
  useEffect(() => {
    if (!containerRef.current || !scenario || !tles) return;

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

    // Create both satellites from TLEs
    satEntitiesRef.current = {};
    for (const sat of scenario.satellites) {
      const tle = tles[sat.id];
      if (!tle) continue;

      const positionProp = buildSatellitePositionProperty(
        tle,
        scenario.start_utc,
        scenario.duration_hours
      );
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
          font: '600 12px ui-monospace, SFMono-Regular, monospace',
          fillColor: color,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -18),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 4.5e7),
        },
        path: {
          resolution: 30,
          leadTime: 3000,
          trailTime: 3000,
          width: 1.75,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.2,
            color: color.withAlpha(0.75),
          }),
        },
      });

      satEntitiesRef.current[sat.id] = entity;
    }

    // Center initial camera over Europe / Arctic (Svalbard, Kiruna, Matera)
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(18.0, 55.0, 1.9e7),
      duration: 0,
    });

    // Throttle React HUD clock updates to ~10Hz
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
  }, [scenario, tles]);

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

  const handleTrackSatellite = (satId: string | null) => {
    if (!viewerRef.current) return;
    if (!satId) {
      viewerRef.current.trackedEntity = undefined;
      setTrackedSat(null);
      viewerRef.current.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(18.0, 55.0, 1.9e7),
        duration: 1.2,
      });
      return;
    }
    const entity = satEntitiesRef.current[satId];
    if (entity) {
      viewerRef.current.trackedEntity = entity;
      setTrackedSat(satId);
    }
  };

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-red-400 p-6">
        <div className="max-w-lg rounded-xl border border-red-500/30 bg-slate-900/90 p-6">
          <h2 className="text-lg font-bold text-white mb-2">Data Contract Missing</h2>
          <p className="text-sm font-mono mb-4">{error}</p>
          <p className="text-xs text-slate-400">
            Run from project root: <code className="text-sky-400">python -m engine.run data/scenario.json</code>
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

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 select-none">
      {/* 3D Cesium Canvas */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Top-Left Mission Header */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-4 rounded-xl border border-slate-800/80 bg-slate-950/80 px-4 py-3 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-semibold uppercase tracking-widest text-sky-400">
              QO Engine 3 • Phase 1: Globe & SGP4 Orbits
            </span>
          </div>
          <div className="mt-1 font-mono text-lg font-bold tracking-tight text-white">
            {isoClock || 'Loading ephemeris...'}
          </div>
        </div>

        {/* Camera Follow Controls */}
        {scenario && (
          <div className="flex items-center gap-1.5 border-l border-slate-800 pl-4">
            {scenario.satellites.map((sat) => {
              const active = trackedSat === sat.id;
              return (
                <button
                  key={sat.id}
                  onClick={() => handleTrackSatellite(active ? null : sat.id)}
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
              onClick={() => handleTrackSatellite(null)}
              title="Reset Globe View"
              className="rounded-lg bg-slate-900 p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-800 cursor-pointer"
            >
              <Compass className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Bottom Timeline & Speed Bar */}
      {scenario && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 flex w-[92%] max-w-4xl items-center gap-4 rounded-2xl border border-slate-800/90 bg-slate-950/85 px-5 py-3 backdrop-blur-md shadow-2xl">
          <button
            onClick={togglePlay}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500 text-slate-950 hover:bg-sky-400 transition cursor-pointer"
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
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
              step={10000}
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
