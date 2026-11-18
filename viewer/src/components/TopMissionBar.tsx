import {
  Activity,
  BarChart3,
  BookOpen,
  Compass,
  Gauge,
  HelpCircle,
  Maximize2,
  Radio,
  Satellite,
  Sparkles,
} from 'lucide-react';
import type {
  AntennaConfig,
  SatelliteConfig,
  ScheduleMethod,
  ScoreboardDocument,
} from '../types/engine';
import type { FleetLiveTelemetry } from '../lib/telemetry';
import {
  ANT_COLORS,
  CUSTOM_ANT_COLOR,
  SAT_COLORS,
  getAntCallsign,
  getSatShortName,
} from '../scene/constants';

interface TopMissionBarProps {
  isoClock: string;
  fleetTelemetry: FleetLiveTelemetry | null;
  scoreboard: ScoreboardDocument | null;
  method: ScheduleMethod;
  onSelectMethod: (m: ScheduleMethod) => void;
  satellites: SatelliteConfig[];
  antennas: AntennaConfig[];
  trackedTarget: string | null;
  onTrackTarget: (targetId: string | null) => void;
  hdMode: boolean;
  onToggleHdMode: () => void;
  analyticsOpen: boolean;
  onToggleAnalytics: () => void;
  onOpenLanding: () => void;
  onEnterCinematic: () => void;
  onOpenHelp: () => void;
}

export default function TopMissionBar({
  isoClock,
  fleetTelemetry,
  scoreboard,
  method,
  onSelectMethod,
  satellites,
  antennas,
  trackedTarget,
  onTrackTarget,
  hdMode,
  onToggleHdMode,
  analyticsOpen,
  onToggleAnalytics,
  onOpenLanding,
  onEnterCinematic,
  onOpenHelp,
}: TopMissionBarProps) {
  const isDownlinking = (fleetTelemetry?.activeBeamCount ?? 0) > 0;

  // Dynamic badge computed specifically for the CURRENTLY SELECTED scheduler vs Greedy baseline!
  const greedyRow = scoreboard?.methods.find((m) => m.method === 'greedy');
  const activeRow = scoreboard?.methods.find((m) => m.method === method);
  const liftPctVsGreedy =
    greedyRow && activeRow && greedyRow.gb_delivered > 0
      ? ((activeRow.gb_delivered - greedyRow.gb_delivered) / greedyRow.gb_delivered) * 100
      : 0;

  const badgeConfig =
    method === 'greedy'
      ? {
          text: `BASE · ${activeRow ? `${activeRow.gb_delivered.toFixed(0)}G` : '0G'}`,
          cls: 'border-amber-500/40 bg-amber-500/12 text-amber-300',
          title: 'Greedy is the baseline algorithm (0.0% lift)',
        }
      : method === 'optimizer'
      ? {
          text: `${liftPctVsGreedy >= 0 ? '+' : ''}${liftPctVsGreedy.toFixed(1)}% vs Greedy`,
          cls: 'border-sky-500/40 bg-sky-500/12 text-sky-300',
          title: `Whole-pass Binary MILP gain over Greedy baseline (${activeRow?.gb_delivered.toFixed(1)} GB vs ${greedyRow?.gb_delivered.toFixed(1)} GB)`,
        }
      : {
          text: `${liftPctVsGreedy >= 0 ? '+' : ''}${liftPctVsGreedy.toFixed(1)}% vs Greedy`,
          cls: 'border-emerald-500/40 bg-emerald-500/12 text-emerald-300',
          title: `Q-Slice Dynamic Handover gain over Greedy baseline (${activeRow?.gb_delivered.toFixed(1)} GB vs ${greedyRow?.gb_delivered.toFixed(1)} GB)`,
        };

  return (
    <header className="pointer-events-auto flex w-full items-center justify-between gap-2 rounded-lg hud-panel-clean px-3 py-1.5">
      {/* LEFT: Mission Callsign + Live UTC Clock + Link Lock Status */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`h-2 w-2 rounded-full ${
              isDownlinking
                ? 'bg-emerald-400 shadow-[0_0_8px_#10b981]'
                : 'bg-sky-400 shadow-[0_0_6px_#38bdf8]'
            }`}
          />
          <span className="font-display text-[11px] font-bold uppercase tracking-[0.14em] text-slate-100">
            QO-3 <span className="text-slate-500">//</span>{' '}
            <span className="text-sky-400">SENTINEL-2</span>
          </span>
        </div>

        <div className="h-4 w-px bg-slate-700/60 hidden sm:block" />

        <div className="font-mono-tabular text-xs font-semibold tracking-tight text-slate-50 shrink-0">
          {isoClock || 'INIT EPHEMERIS...'}
        </div>

        {fleetTelemetry && (
          <div
            className={`hidden xl:flex items-center gap-1.5 rounded px-2 py-0.5 font-mono-tabular text-[10px] font-semibold uppercase tracking-wider border ${
              isDownlinking
                ? 'border-emerald-500/45 bg-emerald-500/12 text-emerald-300'
                : 'border-slate-700/70 bg-slate-900/70 text-slate-400'
            }`}
          >
            <Activity className="w-3 h-3" />
            {isDownlinking
              ? `+${fleetTelemetry.activeDownlinkMbps.toFixed(0)} MBPS`
              : 'OPTICAL CAPTURE'}
          </div>
        )}
      </div>

      {/* CENTER: 3-Method Segmented Control + Per-Algorithm Live Lift Badge */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="flex items-center rounded-md border border-slate-700/70 bg-slate-950 p-0.5">
          <button
            onClick={() => onSelectMethod('qslice')}
            title="15s Time-Sliced Multi-Station Handover DP"
            className={`hud-transition flex items-center gap-1 rounded px-2 py-1 font-mono-tabular text-[10px] font-bold uppercase tracking-wider cursor-pointer ${
              method === 'qslice'
                ? 'bg-emerald-400 text-slate-950'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            Q-Slice
          </button>
          <button
            onClick={() => onSelectMethod('optimizer')}
            title="Traditional Whole-Pass Binary MILP"
            className={`hud-transition rounded px-2 py-1 font-mono-tabular text-[10px] font-bold uppercase tracking-wider cursor-pointer ${
              method === 'optimizer'
                ? 'bg-sky-500 text-slate-950'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            MILP
          </button>
          <button
            onClick={() => onSelectMethod('greedy')}
            title="Baseline Whole-Pass Greedy Heuristic"
            className={`hud-transition rounded px-2 py-1 font-mono-tabular text-[10px] font-bold uppercase tracking-wider cursor-pointer ${
              method === 'greedy'
                ? 'bg-amber-400 text-slate-950'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            Greedy
          </button>
        </div>

        {scoreboard && (
          <span
            title={badgeConfig.title}
            className={`hidden md:inline-flex items-center rounded border px-2 py-1 font-mono-tabular text-[10px] font-bold whitespace-nowrap ${badgeConfig.cls}`}
          >
            {badgeConfig.text}
          </span>
        )}
      </div>

      {/* RIGHT: Quick Camera Targets + Charts + Guide + Quality + Cinema + Help */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="hidden lg:flex items-center gap-0.5 rounded-md border border-slate-800 bg-slate-950 p-0.5">
          <button
            onClick={() => onTrackTarget(null)}
            title="Reset Globe POV"
            className={`hud-transition flex items-center gap-1 rounded px-1.5 py-1 font-mono-tabular text-[10px] font-semibold uppercase cursor-pointer ${
              trackedTarget === null
                ? 'bg-slate-800 text-sky-300'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Compass className="w-3 h-3" />
            Globe
          </button>

          {satellites.map((sat) => {
            const key = `sat-${sat.id}`;
            const active = trackedTarget === key;
            const color = SAT_COLORS[sat.id] ?? '#38bdf8';
            return (
              <button
                key={sat.id}
                onClick={() => onTrackTarget(active ? null : key)}
                title={`Chase camera on ${sat.id}`}
                className={`hud-transition flex items-center gap-1 rounded px-1.5 py-1 font-mono-tabular text-[10px] font-semibold cursor-pointer ${
                  active
                    ? 'bg-sky-500/20 text-white ring-1 ring-sky-400/60'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Satellite className="w-3 h-3" style={{ color }} />
                {getSatShortName(sat.id)}
              </button>
            );
          })}

          {antennas.slice(0, 3).map((ant) => {
            const key = `ant-${ant.id}`;
            const active = trackedTarget === key;
            const color = ANT_COLORS[ant.id] ?? CUSTOM_ANT_COLOR;
            return (
              <button
                key={ant.id}
                onClick={() => onTrackTarget(active ? null : key)}
                title={`Oblique view of ${ant.name} Dish`}
                className={`hud-transition flex items-center gap-1 rounded px-1.5 py-1 font-mono-tabular text-[10px] font-semibold cursor-pointer ${
                  active
                    ? 'bg-emerald-500/20 text-white ring-1 ring-emerald-400/60'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Radio className="w-3 h-3" style={{ color }} />
                {getAntCallsign(ant.id, ant.name).replace('GS-', '')}
              </button>
            );
          })}
        </div>

        <button
          onClick={onToggleAnalytics}
          title="Toggle Movable 24h Buffer & Gantt Charts"
          className={`hud-transition flex items-center gap-1 rounded-md border px-2 py-1 font-mono-tabular text-[10px] font-bold uppercase tracking-wider cursor-pointer ${
            analyticsOpen
              ? 'border-sky-400 bg-sky-500 text-slate-950'
              : 'border-slate-700/80 bg-slate-900 text-slate-200 hover:border-sky-400/60 hover:text-white'
          }`}
        >
          <BarChart3 className="w-3 h-3" />
          Charts
        </button>

        <button
          onClick={onOpenLanding}
          title="Open Project Overview & Interactive 3D Guide (/landing-page)"
          className="hud-transition flex items-center gap-1 rounded-md border border-sky-500/40 bg-sky-500/12 px-2 py-1 font-mono-tabular text-[10px] font-bold uppercase tracking-wider text-sky-300 hover:bg-sky-500/24 cursor-pointer"
        >
          <BookOpen className="w-3 h-3" />
          Guide
        </button>

        <button
          onClick={onToggleHdMode}
          title={
            hdMode
              ? 'HD Cinema Mode — Click for Perf 60fps'
              : 'Perf 60fps Mode — Click for HD Cinema'
          }
          className={`hud-transition flex items-center gap-1 rounded-md border px-2 py-1 font-mono-tabular text-[10px] font-semibold uppercase cursor-pointer ${
            hdMode
              ? 'border-sky-500/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20'
              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
          }`}
        >
          <Gauge className="w-3 h-3" />
          {hdMode ? 'HD' : '60FPS'}
        </button>

        <button
          onClick={onEnterCinematic}
          title="Cinematic Fullscreen Viewport (Shortcut: H)"
          className="hud-transition rounded-md border border-slate-800 bg-slate-900 p-1.5 text-slate-400 hover:border-slate-600 hover:text-white cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onOpenHelp}
          title="Quick Legend & Keyboard Shortcuts (?)"
          className="hud-transition rounded-md border border-slate-800 bg-slate-900 p-1.5 text-slate-400 hover:border-slate-600 hover:text-white cursor-pointer"
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
}
