import React, { useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  SkipForward,
  Zap,
} from 'lucide-react';
import type { AssignmentRecord, PassRecord, ScenarioData } from '../types/engine';
import {
  CONFLICT_COLOR,
  DIFF_COLOR,
  SAT_COLORS,
  SPEED_OPTIONS,
  getSatShortName,
} from '../scene/constants';
import FloatingDraggableCard from './FloatingDraggableCard';

interface TimelineScrubberProps {
  scenario: ScenarioData;
  activeAssignments: AssignmentRecord[];
  conflictPasses: PassRecord[];
  diffPassesCount: number;
  diffPassIds: Set<string>;
  currentTimeMs: number;
  isPlaying: boolean;
  speed: number;
  playheadRef: React.RefObject<HTMLDivElement>;
  progressFillRef: React.RefObject<HTMLDivElement>;
  onTogglePlay: () => void;
  onScrub: (timeMs: number) => void;
  onChangeSpeed: (speed: number) => void;
  onJumpToNext: (mode: 'beam' | 'conflict' | 'diff') => void;
}

interface HoverSummary {
  pct: number;
  utcText: string;
  label: string | null;
}

/**
 * Movable, collapsible 24h Mission Timeline & Event Jump Dock.
 * Anchors cleanly in the upper empty space above the globe, can be dragged anywhere,
 * and collapses down to a tiny movable mission-clock pill.
 */
export default function TimelineScrubber({
  scenario,
  activeAssignments,
  conflictPasses,
  diffPassesCount,
  diffPassIds,
  currentTimeMs,
  isPlaying,
  speed,
  playheadRef,
  progressFillRef,
  onTogglePlay,
  onScrub,
  onChangeSpeed,
  onJumpToNext,
}: TimelineScrubberProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [hoverInfo, setHoverInfo] = useState<HoverSummary | null>(null);

  const startMs = useMemo(
    () => new Date(scenario.start_utc).getTime(),
    [scenario.start_utc]
  );
  const durationMs = scenario.duration_hours * 3600 * 1000;

  const assignmentTicks = useMemo(() => {
    return activeAssignments.map((a) => {
      const s = new Date(a.start_utc).getTime();
      const e = new Date(a.end_utc).getTime();
      const isDiff = diffPassIds.has(a.pass_id);
      return {
        id: a.pass_id,
        start: s,
        end: e,
        leftPct: Math.max(0, Math.min(100, ((s - startMs) / durationMs) * 100)),
        widthPct: Math.max(0.35, ((e - s) / durationMs) * 100),
        color: isDiff ? DIFF_COLOR : (SAT_COLORS[a.satellite_id] ?? '#38bdf8'),
        label: `${a.pass_id.toUpperCase()} · ${getSatShortName(a.satellite_id)} → ${a.antenna_id.replace('-1', '').toUpperCase()} (${a.planned_gb.toFixed(1)}G)`,
      };
    });
  }, [activeAssignments, diffPassIds, startMs, durationMs]);

  const clashTicks = useMemo(() => {
    return conflictPasses.map((p) => {
      const s = new Date(p.aos_utc).getTime();
      const e = new Date(p.los_utc).getTime();
      return {
        id: p.pass_id,
        leftPct: Math.max(0, Math.min(100, ((s - startMs) / durationMs) * 100)),
        widthPct: Math.max(0.35, ((e - s) / durationMs) * 100),
      };
    });
  }, [conflictPasses, startMs, durationMs]);

  const computeTimeFromClientX = (clientX: number) => {
    if (!trackRef.current) return { ms: startMs, pct: 0 };
    const rect = trackRef.current.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return { ms: startMs + frac * durationMs, pct: frac * 100 };
  };

  const handlePointer = (e: React.MouseEvent<HTMLDivElement>, scrub: boolean) => {
    const { ms, pct } = computeTimeFromClientX(e.clientX);
    if (scrub) onScrub(ms);

    const tol = 5 * 60 * 1000;
    const hit = assignmentTicks.find((t) => ms >= t.start - tol && ms <= t.end + tol);
    setHoverInfo({
      pct,
      utcText: new Date(ms).toISOString().slice(11, 19) + ' UTC',
      label: hit ? hit.label : null,
    });
  };

  const elapsedHours = Math.max(0, (currentTimeMs - startMs) / 3_600_000);

  return (
    <FloatingDraggableCard
      initialTop={58}
      widthClass={collapsed ? 'w-auto' : 'w-[760px] max-w-[calc(100vw-630px)] min-w-[460px]'}
      zIndexClass="z-20"
    >
      {({ onPointerDown, gripIcon }) =>
        collapsed ? (
          /* COMPACT MOVABLE COLLAPSED LOGO / PILL */
          <div className="flex items-center gap-1.5 rounded-lg hud-panel-clean px-2 py-1.5 shadow-2xl">
            <div
              onPointerDown={onPointerDown}
              title="Drag 24h Timeline Pill"
              className="group flex items-center cursor-grab active:cursor-grabbing px-0.5"
            >
              {gripIcon}
            </div>

            <button
              onClick={onTogglePlay}
              title="Play / Pause (Space)"
              className="hud-transition flex h-6 w-6 items-center justify-center rounded bg-sky-500 text-slate-950 hover:bg-sky-400 cursor-pointer"
            >
              {isPlaying ? (
                <Pause className="w-3 h-3 fill-current" />
              ) : (
                <Play className="w-3 h-3 fill-current ml-0.5" />
              )}
            </button>

            <button
              onClick={() => setCollapsed(false)}
              title="Expand 24h Timeline & Controls"
              className="hud-transition flex items-center gap-1.5 rounded px-2 py-0.5 font-mono-tabular text-[11px] font-semibold text-slate-100 hover:bg-slate-800 cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5 text-sky-400" />
              <span>T+{elapsedHours.toFixed(1)}h</span>
              <span className="text-[10px] text-sky-300">{speed}x</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        ) : (
          /* FULL MOVABLE 24H TIMELINE + JUMP + SPEED DOCK */
          <div className="flex w-full flex-col gap-1.5 rounded-lg hud-panel-clean px-2.5 py-2 shadow-2xl">
            {/* Top Slim Control Strip: Drag Grip + Jump Buttons (Beam/Clash/Diff) + Speed + Collapse */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <div
                  onPointerDown={onPointerDown}
                  title="Drag to move 24h Timeline anywhere"
                  className="group flex items-center gap-1 rounded px-1 py-0.5 cursor-grab active:cursor-grabbing hover:bg-slate-800/80"
                >
                  {gripIcon}
                  <span className="font-display text-[10px] font-bold uppercase tracking-[0.12em] text-slate-300">
                    24h Control
                  </span>
                </div>

                <div className="h-3.5 w-px bg-slate-800" />

                {/* Single Convenient Location for Next Beam / Clash / Diff */}
                <button
                  onClick={() => onJumpToNext('beam')}
                  title="Jump to Next Active Downlink Beam"
                  className="hud-transition flex items-center gap-1 rounded border border-slate-700/80 bg-slate-900 px-2 py-0.5 font-mono-tabular text-[10px] font-semibold text-sky-300 hover:border-sky-400/60 hover:text-white cursor-pointer"
                >
                  <SkipForward className="w-3 h-3" />
                  Next Beam
                </button>
                <button
                  onClick={() => onJumpToNext('conflict')}
                  title="Jump to Next 3D Pass Conflict Clash"
                  className="hud-transition flex items-center gap-1 rounded border border-rose-500/40 bg-rose-500/12 px-2 py-0.5 font-mono-tabular text-[10px] font-semibold text-rose-300 hover:bg-rose-500/22 cursor-pointer"
                >
                  <ShieldAlert className="w-3 h-3" />
                  Next Clash
                </button>
                <button
                  onClick={() => onJumpToNext('diff')}
                  title="Jump to Next Optimizer vs Greedy Difference"
                  className="hud-transition flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/12 px-2 py-0.5 font-mono-tabular text-[10px] font-semibold text-amber-300 hover:bg-amber-500/22 cursor-pointer"
                >
                  <Zap className="w-3 h-3" />
                  Diff ({diffPassesCount})
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-0.5 rounded border border-slate-800 bg-slate-950 p-0.5">
                  {SPEED_OPTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => onChangeSpeed(s)}
                      className={`hud-transition rounded px-1.5 py-0.5 font-mono-tabular text-[10px] font-semibold cursor-pointer ${
                        speed === s
                          ? 'bg-sky-500 text-slate-950'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setCollapsed(true)}
                  title="Collapse Timeline into Compact Pill"
                  className="hud-transition rounded border border-slate-800 bg-slate-950 p-1 text-slate-400 hover:border-slate-600 hover:text-white cursor-pointer"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Bottom Scrubber Row: Play/Pause + Restart + Event-Annotated 24h Track */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={onTogglePlay}
                  title="Play / Pause (Space)"
                  className="hud-transition flex h-6 w-6 items-center justify-center rounded bg-sky-500 text-slate-950 hover:bg-sky-400 cursor-pointer"
                >
                  {isPlaying ? (
                    <Pause className="w-3 h-3 fill-current" />
                  ) : (
                    <Play className="w-3 h-3 fill-current ml-0.5" />
                  )}
                </button>

                <button
                  onClick={() => onScrub(startMs)}
                  title="Restart 24h Window"
                  className="hud-transition flex h-6 w-6 items-center justify-center rounded border border-slate-700/80 bg-slate-900 text-slate-300 hover:border-slate-500 hover:text-white cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>

              <div className="relative flex-1">
                {hoverInfo && (
                  <div
                    style={{ left: `${Math.min(86, Math.max(14, hoverInfo.pct))}%` }}
                    className="pointer-events-none absolute top-7 -translate-x-1/2 z-30 whitespace-nowrap rounded border border-slate-700 bg-[#040914] px-2 py-0.5 font-mono-tabular text-[10px] shadow-xl"
                  >
                    <span className="font-bold text-slate-100">{hoverInfo.utcText}</span>
                    {hoverInfo.label && (
                      <span className="ml-2 text-emerald-300">{hoverInfo.label}</span>
                    )}
                  </div>
                )}

                <div
                  ref={trackRef}
                  onMouseDown={(e) => handlePointer(e, true)}
                  onMouseMove={(e) => handlePointer(e, e.buttons === 1)}
                  onMouseLeave={() => setHoverInfo(null)}
                  className="relative h-5 w-full rounded border border-slate-700/70 bg-slate-950 cursor-ew-resize overflow-hidden"
                >
                  {[3, 6, 9, 12, 15, 18, 21].map((h) => (
                    <div
                      key={h}
                      style={{ left: `${(h / scenario.duration_hours) * 100}%` }}
                      className="pointer-events-none absolute top-0 bottom-0 w-px bg-slate-800/70"
                    />
                  ))}

                  <div
                    ref={progressFillRef}
                    style={{ width: '0%' }}
                    className="pointer-events-none absolute inset-y-0 left-0 bg-sky-500/20"
                  />

                  {assignmentTicks.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        left: `${t.leftPct}%`,
                        width: `${t.widthPct}%`,
                        backgroundColor: t.color,
                      }}
                      className="pointer-events-none absolute top-0.5 h-2 rounded-[1px] opacity-90"
                    />
                  ))}

                  {clashTicks.map((t) => (
                    <div
                      key={`c-${t.id}`}
                      style={{
                        left: `${t.leftPct}%`,
                        width: `${t.widthPct}%`,
                        backgroundColor: CONFLICT_COLOR,
                      }}
                      className="pointer-events-none absolute bottom-0.5 h-1 rounded-[1px] opacity-70"
                    />
                  ))}

                  <div
                    ref={playheadRef}
                    style={{ left: '0%' }}
                    className="pointer-events-none absolute top-0 bottom-0 w-[2px] -ml-[1px] bg-white shadow-[0_0_8px_#38bdf8]"
                  />
                </div>
              </div>

              <span className="font-mono-tabular text-[10px] font-semibold text-slate-300 shrink-0 w-[72px] text-right">
                +{elapsedHours.toFixed(1)}h / {scenario.duration_hours}h
              </span>
            </div>
          </div>
        )
      }
    </FloatingDraggableCard>
  );
}
