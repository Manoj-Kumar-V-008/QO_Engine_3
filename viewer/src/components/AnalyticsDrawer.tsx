import React, { useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  Layers,
} from 'lucide-react';
import type {
  PassRecord,
  ScenarioData,
  ScheduleDocument,
} from '../types/engine';

interface AnalyticsDrawerProps {
  scenario: ScenarioData;
  passes: PassRecord[];
  schedules: {
    greedy: ScheduleDocument;
    optimizer: ScheduleDocument;
  };
  activeMethod: 'greedy' | 'optimizer';
  playheadRef: React.RefObject<HTMLDivElement | null>;
  onScrub: (timeMs: number) => void;
}

const SAT_COLORS: Record<string, string> = {
  'sentinel-2a': '#38bdf8',
  'sentinel-2b': '#c084fc',
};

const ANT_COLORS: Record<string, string> = {
  'svalbard-1': '#34d399',
  'kiruna-1': '#fbbf24',
  'matera-1': '#f472b6',
};

const HOUR_TICKS = [0, 3, 6, 9, 12, 15, 18, 21, 24];

/**
 * Memoized static SVG chart: only redraws when schedule, method, or tab changes.
 * NEVER redraws on 60fps clock ticks! The playhead moves via a plain HTML div ref.
 */
const StaticChartPlot = React.memo(function StaticChartPlot({
  scenario,
  passes,
  schedules,
  activeMethod,
  activeTab,
  compareOverlay,
}: {
  scenario: ScenarioData;
  passes: PassRecord[];
  schedules: { greedy: ScheduleDocument; optimizer: ScheduleDocument };
  activeMethod: 'greedy' | 'optimizer';
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
  const otherMethod = activeMethod === 'optimizer' ? 'greedy' : 'optimizer';
  const otherSchedule = schedules[otherMethod];

  const chosenSet = useMemo(
    () => new Set(activeSchedule.assignments.map((a) => a.pass_id)),
    [activeSchedule]
  );
  const otherChosenSet = useMemo(
    () => new Set(otherSchedule.assignments.map((a) => a.pass_id)),
    [otherSchedule]
  );

  const width = 800;
  const height = 148;
  const padLeft = 48;
  const padRight = 14;
  const padTop = 14;
  const padBottom = 22;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const maxCap = Math.max(
    ...scenario.satellites.map((s) => s.buffer_capacity_gb),
    300
  );

  const timeToX = (ms: number) => {
    const clamped = Math.min(endMs, Math.max(startMs, ms));
    return padLeft + ((clamped - startMs) / durationMs) * plotW;
  };

  const gbToY = (gb: number) => {
    const clamped = Math.min(maxCap, Math.max(0, gb));
    return padTop + plotH - (clamped / maxCap) * plotH;
  };

  const buildPolyline = (sched: ScheduleDocument, satId: string, initGb: number) => {
    const pts = sched.buffer_timeline[satId] ?? [];
    const coords: string[] = [
      `${timeToX(startMs).toFixed(1)},${gbToY(initGb).toFixed(1)}`,
    ];
    for (const pt of pts) {
      const x = timeToX(new Date(pt.t_utc).getTime());
      const y = gbToY(pt.level_gb);
      coords.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return coords.join(' ');
  };

  // Compute contiguous overflow time spans (shaded bands instead of hundreds of SVG circles)
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
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-34 select-none pointer-events-none"
    >
      {/* Vertical Hour Gridlines */}
      {HOUR_TICKS.map((h) => {
        const x = padLeft + (h / scenario.duration_hours) * plotW;
        return (
          <g key={h}>
            <line
              x1={x}
              y1={padTop}
              x2={x}
              y2={padTop + plotH}
              stroke="#1e293b"
              strokeWidth="1"
            />
            <text
              x={x}
              y={height - 5}
              textAnchor="middle"
              fill="#64748b"
              fontSize="10"
              fontFamily="ui-monospace, monospace"
            >
              +{h}h
            </text>
          </g>
        );
      })}

      {activeTab === 'buffers' ? (
        <>
          {/* Shaded Red Ceiling Band (280-300 GB Danger Zone) */}
          <rect
            x={padLeft}
            y={gbToY(300)}
            width={plotW}
            height={gbToY(275) - gbToY(300)}
            fill="#ef4444"
            opacity="0.08"
          />

          {/* Shaded Red Spans where Buffer is Actively Spilling at 300 GB */}
          {overflowSpans.map((sp, i) => (
            <rect
              key={i}
              x={sp.x1}
              y={padTop}
              width={Math.max(2, sp.x2 - sp.x1)}
              height={6}
              fill="#ef4444"
              opacity="0.85"
              rx="1"
            />
          ))}

          {/* Horizontal GB Gridlines (0, 150, 300 GB) */}
          {[0, 150, 300].map((gb) => {
            const y = gbToY(gb);
            const isCap = gb === 300;
            return (
              <g key={gb}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={padLeft + plotW}
                  y2={y}
                  stroke={isCap ? '#ef4444' : '#1e293b'}
                  strokeWidth={isCap ? '1.2' : '1'}
                  strokeDasharray={isCap ? '5 4' : undefined}
                  opacity={isCap ? 0.75 : 1}
                />
                <text
                  x={padLeft - 6}
                  y={y + 3}
                  textAnchor="end"
                  fill={isCap ? '#f87171' : '#64748b'}
                  fontSize="10"
                  fontFamily="ui-monospace, monospace"
                >
                  {gb}G
                </text>
              </g>
            );
          })}

          {/* Optional Comparison Curves */}
          {compareOverlay &&
            scenario.satellites.map((sat) => (
              <polyline
                key={`other-${sat.id}`}
                fill="none"
                stroke={SAT_COLORS[sat.id] ?? '#38bdf8'}
                strokeWidth="1.4"
                strokeDasharray="4 4"
                opacity={0.4}
                points={buildPolyline(
                  otherSchedule,
                  sat.id,
                  sat.initial_buffer_gb
                )}
              />
            ))}

          {/* Active Scheduler Buffer Curves */}
          {scenario.satellites.map((sat) => (
            <polyline
              key={`active-${sat.id}`}
              fill="none"
              stroke={SAT_COLORS[sat.id] ?? '#38bdf8'}
              strokeWidth="2.2"
              points={buildPolyline(
                activeSchedule,
                sat.id,
                sat.initial_buffer_gb
              )}
            />
          ))}
        </>
      ) : (
        /* GANTT PASS TIMELINE BY GROUND STATION */
        <>
          {scenario.antennas.map((ant, idx) => {
            const rowH = plotH / scenario.antennas.length;
            const rowY = padTop + idx * rowH;
            const antPasses = passes.filter((p) => p.antenna_id === ant.id);
            const antColor = ANT_COLORS[ant.id] ?? '#22d3ee';

            return (
              <g key={ant.id}>
                <line
                  x1={padLeft}
                  y1={rowY + rowH / 2}
                  x2={padLeft + plotW}
                  y2={rowY + rowH / 2}
                  stroke="#1e293b"
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 6}
                  y={rowY + rowH / 2 + 3}
                  textAnchor="end"
                  fill={antColor}
                  fontSize="9"
                  fontWeight="bold"
                  fontFamily="ui-monospace, monospace"
                >
                  {ant.name.slice(0, 6)}
                </text>

                {antPasses.map((p) => {
                  const x1 = timeToX(new Date(p.aos_utc).getTime());
                  const x2 = Math.max(
                    x1 + 3.5,
                    timeToX(new Date(p.los_utc).getTime())
                  );
                  const isChosen = chosenSet.has(p.pass_id);
                  const isDiff =
                    chosenSet.has(p.pass_id) !== otherChosenSet.has(p.pass_id);
                  const satColor = SAT_COLORS[p.satellite_id] ?? '#38bdf8';

                  return (
                    <rect
                      key={p.pass_id}
                      x={x1}
                      y={rowY + 4}
                      width={x2 - x1}
                      height={Math.max(4, rowH - 8)}
                      rx="1.5"
                      fill={isChosen ? satColor : '#1e293b'}
                      opacity={isChosen ? 0.92 : 0.45}
                      stroke={
                        isDiff
                          ? '#fbbf24'
                          : isChosen
                          ? '#ffffff'
                          : '#475569'
                      }
                      strokeWidth={isDiff ? '1.5' : '0.5'}
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

export default function AnalyticsDrawer({
  scenario,
  passes,
  schedules,
  activeMethod,
  playheadRef,
  onScrub,
}: AnalyticsDrawerProps) {
  // Starts collapsed by default so the 3D globe is completely unobstructed
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'buffers' | 'gantt'>('buffers');
  const [compareOverlay, setCompareOverlay] = useState<boolean>(true);
  const plotContainerRef = useRef<HTMLDivElement | null>(null);

  const startMs = useMemo(
    () => new Date(scenario.start_utc).getTime(),
    [scenario.start_utc]
  );
  const durationMs = scenario.duration_hours * 3600 * 1000;
  const otherMethod = activeMethod === 'optimizer' ? 'greedy' : 'optimizer';

  // Left and right padding percentages matching SVG (padLeft=48/800=6%, padRight=14/800=1.75%)
  const handlePointerScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!plotContainerRef.current) return;
    const rect = plotContainerRef.current.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const padLeftFrac = 48 / 800;
    const plotWFrac = (800 - 48 - 14) / 800;
    const frac = Math.min(1, Math.max(0, (relX - padLeftFrac) / plotWFrac));
    onScrub(startMs + frac * durationMs);
  };

  return (
    <div className="w-full">
      {/* Compact Header Bar */}
      <div className="flex items-center justify-between rounded-t-xl border border-slate-800/90 bg-slate-950/90 px-3.5 py-1.5 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-3.5 h-3.5 text-sky-400" />
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-200">
            24h Telemetry Chart
          </span>

          <div className="ml-2 flex items-center gap-1 rounded-lg bg-slate-900 p-0.5 border border-slate-800">
            <button
              onClick={() => {
                setActiveTab('buffers');
                setIsOpen(true);
              }}
              className={`rounded px-2 py-0.5 text-[10px] font-mono font-semibold transition cursor-pointer ${
                isOpen && activeTab === 'buffers'
                  ? 'bg-sky-500 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Buffer Curves
            </button>
            <button
              onClick={() => {
                setActiveTab('gantt');
                setIsOpen(true);
              }}
              className={`rounded px-2 py-0.5 text-[10px] font-mono font-semibold transition cursor-pointer ${
                isOpen && activeTab === 'gantt'
                  ? 'bg-sky-500 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {passes.length} Passes Gantt
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isOpen && activeTab === 'buffers' && (
            <button
              onClick={() => setCompareOverlay((v) => !v)}
              className={`hidden md:flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-mono transition cursor-pointer ${
                compareOverlay
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                  : 'border-slate-800 bg-slate-900 text-slate-500'
              }`}
            >
              <Layers className="w-3 h-3" />
              vs {otherMethod}
            </button>
          )}

          <button
            onClick={() => setIsOpen((v) => !v)}
            className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2 py-0.5 text-[10px] font-mono text-slate-300 hover:bg-slate-800 cursor-pointer"
          >
            {isOpen ? (
              <>
                Collapse <ChevronDown className="w-3 h-3" />
              </>
            ) : (
              <>
                Expand Chart <ChevronUp className="w-3 h-3" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Collapsible Chart Body with Zero-Render HTML Div Playhead */}
      {isOpen && (
        <div
          ref={plotContainerRef}
          onClick={handlePointerScrub}
          onMouseMove={(e) => {
            if (e.buttons === 1) handlePointerScrub(e);
          }}
          className="relative rounded-b-xl border border-t-0 border-slate-800/90 bg-slate-950/90 px-2 pb-2 pt-1 backdrop-blur-md shadow-2xl cursor-crosshair overflow-hidden"
        >
          <StaticChartPlot
            scenario={scenario}
            passes={passes}
            schedules={schedules}
            activeMethod={activeMethod}
            activeTab={activeTab}
            compareOverlay={compareOverlay}
          />

          {/* Playhead vertical line moved directly via DOM ref at 60fps (0 React re-renders) */}
          <div
            ref={playheadRef}
            style={{ left: '6%' }}
            className="pointer-events-none absolute top-2 bottom-5 w-[1.5px] bg-white shadow-[0_0_6px_#38bdf8]"
          >
            <div className=" -ml-[3px] -mt-1 h-2 w-2 rounded-full bg-sky-400" />
          </div>
        </div>
      )}
    </div>
  );
}
