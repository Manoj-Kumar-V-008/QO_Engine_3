import React, { useMemo, useRef, useState } from 'react';
import { BarChart3, Layers, X } from 'lucide-react';
import type {
  PassRecord,
  ScenarioData,
  ScheduleDocument,
  ScheduleMethod,
} from '../types/engine';
import {
  ANT_COLORS,
  CONFLICT_COLOR,
  SAT_COLORS,
  getSatShortName,
} from '../scene/constants';
import FloatingDraggableCard from './FloatingDraggableCard';

interface AnalyticsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  scenario: ScenarioData;
  passes: PassRecord[];
  schedules: Record<ScheduleMethod, ScheduleDocument>;
  conflictLoserIds: Set<string>;
  activeMethod: ScheduleMethod;
  playheadRef: React.RefObject<HTMLDivElement>;
  onScrub: (timeMs: number) => void;
}

const HOUR_TICKS = [0, 3, 6, 9, 12, 15, 18, 21, 24];

const WIDTH = 820;
const HEIGHT = 128;
const PAD_LEFT = 64;
const PAD_RIGHT = 14;
const PAD_TOP = 10;
const PAD_BOTTOM = 18;
const PLOT_W = WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_H = HEIGHT - PAD_TOP - PAD_BOTTOM;

const StaticChartPlot = React.memo(function StaticChartPlot({
  scenario,
  passes,
  schedules,
  conflictLoserIds,
  activeMethod,
  activeTab,
  compareOverlay,
}: {
  scenario: ScenarioData;
  passes: PassRecord[];
  schedules: Record<ScheduleMethod, ScheduleDocument>;
  conflictLoserIds: Set<string>;
  activeMethod: ScheduleMethod;
  activeTab: 'buffers' | 'gantt';
  compareOverlay: boolean;
}) {
  const startMs = useMemo(
    () => new Date(scenario.start_utc).getTime(),
    [scenario.start_utc]
  );
  const durationMs = scenario.duration_hours * 3600 * 1000;
  const endMs = startMs + durationMs;

  const activeSchedule = schedules[activeMethod];
  const compareMethod: ScheduleMethod = activeMethod === 'greedy' ? 'qslice' : 'greedy';
  const otherSchedule = schedules[compareMethod];

  const chosenSet = useMemo(
    () => new Set(activeSchedule.assignments.map((a) => a.pass_id)),
    [activeSchedule]
  );

  const maxCap = Math.max(
    ...scenario.satellites.map((s) => s.buffer_capacity_gb),
    300
  );

  const timeToX = (ms: number) => {
    const clamped = Math.min(endMs, Math.max(startMs, ms));
    return PAD_LEFT + ((clamped - startMs) / durationMs) * PLOT_W;
  };

  const gbToY = (gb: number) => {
    const clamped = Math.min(maxCap, Math.max(0, gb));
    return PAD_TOP + PLOT_H - (clamped / maxCap) * PLOT_H;
  };

  const buildCurvePaths = (sched: ScheduleDocument, satId: string, initGb: number) => {
    const pts = sched.buffer_timeline[satId] ?? [];
    const coords: [number, number][] = [[timeToX(startMs), gbToY(initGb)]];
    for (const pt of pts) {
      coords.push([timeToX(new Date(pt.t_utc).getTime()), gbToY(pt.level_gb)]);
    }
    const lineD = coords
      .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
      .join(' ');
    const baselineY = (PAD_TOP + PLOT_H).toFixed(1);
    const firstX = coords[0][0].toFixed(1);
    const lastX = coords[coords.length - 1][0].toFixed(1);
    const areaD = `${lineD} L${lastX},${baselineY} L${firstX},${baselineY} Z`;
    return { lineD, areaD };
  };

  const overflowSpans = useMemo(() => {
    const spans: { x1: number; x2: number }[] = [];
    for (const sat of scenario.satellites) {
      const pts = activeSchedule.buffer_timeline[sat.id] ?? [];
      let spanStartMs: number | null = null;
      let prevMs = startMs;
      for (const pt of pts) {
        const ptMs = new Date(pt.t_utc).getTime();
        const isFull = pt.level_gb >= sat.buffer_capacity_gb - 0.5;
        if (isFull && spanStartMs === null) {
          spanStartMs = prevMs;
        } else if (!isFull && spanStartMs !== null) {
          spans.push({ x1: timeToX(spanStartMs), x2: timeToX(prevMs) });
          spanStartMs = null;
        }
        prevMs = ptMs;
      }
      if (spanStartMs !== null) {
        spans.push({ x1: timeToX(spanStartMs), x2: timeToX(prevMs) });
      }
    }
    return spans;
  }, [activeSchedule, scenario.satellites, startMs, durationMs]);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full h-32 select-none pointer-events-none"
    >
      <defs>
        {scenario.satellites.map((sat) => {
          const hex = SAT_COLORS[sat.id] ?? '#38bdf8';
          return (
            <linearGradient
              key={`grad-${sat.id}`}
              id={`buf-grad-${sat.id}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={hex} stopOpacity="0.24" />
              <stop offset="100%" stopColor={hex} stopOpacity="0.0" />
            </linearGradient>
          );
        })}

        <pattern
          id="qo-overflow-hatch"
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="6"
            stroke={CONFLICT_COLOR}
            strokeWidth="2"
            strokeOpacity="0.72"
          />
        </pattern>
      </defs>

      {HOUR_TICKS.map((h) => {
        const x = PAD_LEFT + (h / scenario.duration_hours) * PLOT_W;
        return (
          <g key={h}>
            <line
              x1={x}
              y1={PAD_TOP}
              x2={x}
              y2={PAD_TOP + PLOT_H}
              stroke="rgba(148,163,184,0.12)"
              strokeWidth="1"
            />
            <text
              x={x}
              y={HEIGHT - 4}
              textAnchor="middle"
              fill="#64748b"
              fontSize="9"
              fontFamily="JetBrains Mono, ui-monospace, monospace"
            >
              +{h}h
            </text>
          </g>
        );
      })}

      {activeTab === 'buffers' ? (
        <>
          {overflowSpans.map((sp, i) => (
            <rect
              key={i}
              x={sp.x1}
              y={PAD_TOP}
              width={Math.max(2.5, sp.x2 - sp.x1)}
              height={7}
              fill="url(#qo-overflow-hatch)"
              rx="1"
            />
          ))}

          {[0, 150, 300].map((gb) => {
            const y = gbToY(gb);
            const isCap = gb === 300;
            return (
              <g key={gb}>
                <line
                  x1={PAD_LEFT}
                  y1={y}
                  x2={PAD_LEFT + PLOT_W}
                  y2={y}
                  stroke={isCap ? CONFLICT_COLOR : 'rgba(148,163,184,0.12)'}
                  strokeWidth={isCap ? '1.1' : '1'}
                  strokeDasharray={isCap ? '4 4' : undefined}
                  opacity={isCap ? 0.78 : 1}
                />
                <text
                  x={PAD_LEFT - 7}
                  y={y + 3}
                  textAnchor="end"
                  fill={isCap ? '#fb7185' : '#64748b'}
                  fontSize="9"
                  fontFamily="JetBrains Mono, ui-monospace, monospace"
                >
                  {gb}G
                </text>
              </g>
            );
          })}

          {compareOverlay &&
            scenario.satellites.map((sat) => {
              const { lineD } = buildCurvePaths(
                otherSchedule,
                sat.id,
                sat.initial_buffer_gb
              );
              return (
                <path
                  key={`other-${sat.id}`}
                  d={lineD}
                  fill="none"
                  stroke={SAT_COLORS[sat.id] ?? '#38bdf8'}
                  strokeWidth="1.2"
                  strokeDasharray="3 3"
                  opacity={0.42}
                />
              );
            })}

          {scenario.satellites.map((sat) => {
            const { lineD, areaD } = buildCurvePaths(
              activeSchedule,
              sat.id,
              sat.initial_buffer_gb
            );
            return (
              <g key={`active-${sat.id}`}>
                <path d={areaD} fill={`url(#buf-grad-${sat.id})`} />
                <path
                  d={lineD}
                  fill="none"
                  stroke={SAT_COLORS[sat.id] ?? '#38bdf8'}
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
              </g>
            );
          })}
        </>
      ) : (
        <>
          {scenario.antennas.map((ant, idx) => {
            const rowH = PLOT_H / scenario.antennas.length;
            const rowY = PAD_TOP + idx * rowH;
            const antColor = ANT_COLORS[ant.id] ?? '#22d3ee';
            const useSegments = activeMethod === 'qslice';

            return (
              <g key={ant.id}>
                <line
                  x1={PAD_LEFT}
                  y1={rowY + rowH / 2}
                  x2={PAD_LEFT + PLOT_W}
                  y2={rowY + rowH / 2}
                  stroke="rgba(148,163,184,0.12)"
                  strokeWidth="1"
                />
                <text
                  x={PAD_LEFT - 7}
                  y={rowY + rowH / 2 + 3}
                  textAnchor="end"
                  fill={antColor}
                  fontSize="9"
                  fontWeight="600"
                  fontFamily="JetBrains Mono, ui-monospace, monospace"
                >
                  {ant.name.slice(0, 8).toUpperCase()}
                </text>

                {useSegments
                  ? activeSchedule.assignments
                      .filter((a) => a.antenna_id === ant.id)
                      .map((a) => {
                        const x1 = timeToX(new Date(a.start_utc).getTime());
                        const x2 = Math.max(
                          x1 + 3,
                          timeToX(new Date(a.end_utc).getTime())
                        );
                        const satColor = SAT_COLORS[a.satellite_id] ?? '#38bdf8';
                        return (
                          <rect
                            key={a.pass_id}
                            x={x1}
                            y={rowY + 4}
                            width={x2 - x1}
                            height={Math.max(4, rowH - 8)}
                            rx="1.5"
                            fill={satColor}
                            opacity="0.92"
                            stroke="#e2e8f0"
                            strokeWidth="0.5"
                          />
                        );
                      })
                  : passes
                      .filter((p) => p.antenna_id === ant.id)
                      .map((p) => {
                        const x1 = timeToX(new Date(p.aos_utc).getTime());
                        const x2 = Math.max(
                          x1 + 3.5,
                          timeToX(new Date(p.los_utc).getTime())
                        );
                        const isChosen = chosenSet.has(p.pass_id);
                        const isClash = conflictLoserIds.has(p.pass_id);
                        const satColor = SAT_COLORS[p.satellite_id] ?? '#38bdf8';
                        return (
                          <rect
                            key={p.pass_id}
                            x={x1}
                            y={rowY + 4}
                            width={x2 - x1}
                            height={Math.max(4, rowH - 8)}
                            rx="1.5"
                            fill={
                              isChosen
                                ? satColor
                                : isClash
                                ? 'url(#qo-overflow-hatch)'
                                : '#1e293b'
                            }
                            opacity={isChosen ? 0.92 : isClash ? 0.82 : 0.35}
                            stroke={
                              isChosen
                                ? '#e2e8f0'
                                : isClash
                                ? CONFLICT_COLOR
                                : '#475569'
                            }
                            strokeWidth={isClash ? '0.9' : '0.5'}
                          />
                        );
                      })}
              </g>
            );
          })}
        </>
      )}
    </svg>
  );
});

/**
 * Movable (draggable) floating 24h Telemetry Analytics window triggered from Top Bar "Charts".
 * Defaults neatly in the upper empty space right below the timeline so you can drag it anywhere!
 */
export default function AnalyticsDrawer({
  isOpen,
  onClose,
  scenario,
  passes,
  schedules,
  conflictLoserIds,
  activeMethod,
  playheadRef,
  onScrub,
}: AnalyticsDrawerProps) {
  const [activeTab, setActiveTab] = useState<'buffers' | 'gantt'>('buffers');
  const [compareOverlay, setCompareOverlay] = useState<boolean>(true);
  const plotContainerRef = useRef<HTMLDivElement | null>(null);
  const [hoverX, setHoverX] = useState<{
    leftPct: number;
    timeMs: number;
    satLevels: { id: string; gb: number; color: string }[];
  } | null>(null);

  const startMs = useMemo(
    () => new Date(scenario.start_utc).getTime(),
    [scenario.start_utc]
  );
  const durationMs = scenario.duration_hours * 3600 * 1000;
  const compareMethod: ScheduleMethod = activeMethod === 'greedy' ? 'qslice' : 'greedy';
  const activeSchedule = schedules[activeMethod];

  const padLeftFrac = PAD_LEFT / WIDTH;
  const plotWFrac = PLOT_W / WIDTH;

  if (!isOpen) return null;

  const sampleBufferAt = (satId: string, initGb: number, targetMs: number): number => {
    const timeline = activeSchedule.buffer_timeline[satId] ?? [];
    let prevMs = startMs;
    let prevLevel = initGb;
    for (const pt of timeline) {
      const ptMs = new Date(pt.t_utc).getTime();
      if (targetMs <= ptMs) {
        const frac = Math.min(
          1,
          Math.max(0, (targetMs - prevMs) / Math.max(1, ptMs - prevMs))
        );
        return prevLevel + frac * (pt.level_gb - prevLevel);
      }
      prevMs = ptMs;
      prevLevel = pt.level_gb;
    }
    return timeline.length > 0 ? timeline[timeline.length - 1].level_gb : initGb;
  };

  const handlePointer = (e: React.MouseEvent<HTMLDivElement>, shouldScrub: boolean) => {
    if (!plotContainerRef.current) return;
    const rect = plotContainerRef.current.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const frac = Math.min(1, Math.max(0, (relX - padLeftFrac) / plotWFrac));
    const targetMs = startMs + frac * durationMs;

    if (shouldScrub) onScrub(targetMs);

    setHoverX({
      leftPct: (padLeftFrac + frac * plotWFrac) * 100,
      timeMs: targetMs,
      satLevels: scenario.satellites.map((sat) => ({
        id: getSatShortName(sat.id),
        gb: sampleBufferAt(sat.id, sat.initial_buffer_gb, targetMs),
        color: SAT_COLORS[sat.id] ?? '#38bdf8',
      })),
    });
  };

  return (
    <FloatingDraggableCard
      initialTop={134}
      widthClass="w-[680px] max-w-[calc(100vw-630px)] min-w-[420px]"
      zIndexClass="z-30"
    >
      {({ onPointerDown, gripIcon }) => (
        <div className="w-full rounded-lg hud-panel-clean overflow-hidden shadow-2xl">
          {/* Draggable Header Bar */}
          <div className="flex items-center justify-between border-b border-slate-800/80 px-2.5 py-1.5">
            <div className="flex items-center gap-2">
              <div
                onPointerDown={onPointerDown}
                title="Drag to move 24h Analytics chart anywhere"
                className="group flex items-center gap-1.5 rounded px-1 py-0.5 cursor-grab active:cursor-grabbing hover:bg-slate-800/80"
              >
                {gripIcon}
                <BarChart3 className="w-3.5 h-3.5 text-sky-400" />
                <span className="font-display text-[10px] font-bold uppercase tracking-[0.12em] text-slate-200">
                  24h Analytics
                </span>
              </div>

              <div className="flex items-center gap-0.5 rounded bg-slate-950 p-0.5 border border-slate-800">
                <button
                  onClick={() => setActiveTab('buffers')}
                  className={`hud-transition rounded px-2 py-0.5 font-mono-tabular text-[10px] font-semibold cursor-pointer ${
                    activeTab === 'buffers'
                      ? 'bg-sky-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Buffers
                </button>
                <button
                  onClick={() => setActiveTab('gantt')}
                  className={`hud-transition rounded px-2 py-0.5 font-mono-tabular text-[10px] font-semibold cursor-pointer ${
                    activeTab === 'gantt'
                      ? 'bg-sky-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Gantt ({activeMethod === 'qslice' ? activeSchedule.assignments.length : passes.length})
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {activeTab === 'buffers' && (
                <button
                  onClick={() => setCompareOverlay((v) => !v)}
                  className={`hud-transition flex items-center gap-1 rounded border px-2 py-0.5 font-mono-tabular text-[10px] cursor-pointer ${
                    compareOverlay
                      ? 'border-emerald-500/45 bg-emerald-500/10 text-emerald-300'
                      : 'border-slate-800 bg-slate-900 text-slate-500'
                  }`}
                >
                  <Layers className="w-3 h-3" />
                  vs {compareMethod}
                </button>
              )}
              <button
                onClick={onClose}
                title="Close 24h Analytics"
                className="hud-transition rounded border border-slate-800 bg-slate-900 p-1 text-slate-400 hover:border-slate-600 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div
            ref={plotContainerRef}
            onClick={(e) => handlePointer(e, true)}
            onMouseMove={(e) => handlePointer(e, e.buttons === 1)}
            onMouseLeave={() => setHoverX(null)}
            className="relative px-2 py-1.5 cursor-crosshair overflow-hidden"
          >
            <StaticChartPlot
              scenario={scenario}
              passes={passes}
              schedules={schedules}
              conflictLoserIds={conflictLoserIds}
              activeMethod={activeMethod}
              activeTab={activeTab}
              compareOverlay={compareOverlay}
            />

            {hoverX && (
              <>
                <div
                  style={{ left: `${hoverX.leftPct}%` }}
                  className="pointer-events-none absolute top-1 bottom-4 w-px bg-slate-300/45"
                />
                <div
                  style={{ left: `${Math.min(84, Math.max(16, hoverX.leftPct))}%` }}
                  className="pointer-events-none absolute top-1 -translate-x-1/2 z-20 flex items-center gap-2 rounded border border-slate-700 bg-[#030712] px-2 py-0.5 font-mono-tabular text-[10px] shadow-lg whitespace-nowrap"
                >
                  <span className="font-bold text-slate-100">
                    {new Date(hoverX.timeMs).toISOString().slice(11, 16)}Z
                  </span>
                  {hoverX.satLevels.map((s) => (
                    <span key={s.id} style={{ color: s.color }} className="font-semibold">
                      {s.id}:{s.gb.toFixed(0)}G
                    </span>
                  ))}
                </div>
              </>
            )}

            <div
              ref={playheadRef}
              style={{ left: `${padLeftFrac * 100}%` }}
              className="pointer-events-none absolute top-1 bottom-4 w-[1.5px] bg-white shadow-[0_0_8px_#38bdf8]"
            />
          </div>
        </div>
      )}
    </FloatingDraggableCard>
  );
}
