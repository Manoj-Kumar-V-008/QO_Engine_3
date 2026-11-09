import { useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  Layers,
  Radio,
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
  currentTimeMs: number;
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

export default function AnalyticsDrawer({
  scenario,
  passes,
  schedules,
  activeMethod,
  currentTimeMs,
  onScrub,
}: AnalyticsDrawerProps) {
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'buffers' | 'gantt'>('buffers');
  const [compareOverlay, setCompareOverlay] = useState<boolean>(true);
  const svgRef = useRef<SVGSVGElement | null>(null);

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

  // SVG coordinate dimensions
  const width = 920;
  const height = 165;
  const padLeft = 54;
  const padRight = 18;
  const padTop = 16;
  const padBottom = 26;
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

  const handleSvgPointer = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    const frac = Math.min(1, Math.max(0, (relX - padLeft) / plotW));
    onScrub(startMs + frac * durationMs);
  };

  // Build SVG polyline points for each satellite's buffer_timeline
  const buildPolyline = (sched: ScheduleDocument, satId: string, initGb: number) => {
    const pts = sched.buffer_timeline[satId] ?? [];
    const coords: string[] = [`${timeToX(startMs).toFixed(1)},${gbToY(initGb).toFixed(1)}`];
    for (const pt of pts) {
      const x = timeToX(new Date(pt.t_utc).getTime());
      const y = gbToY(pt.level_gb);
      coords.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return coords.join(' ');
  };

  // Find overflow segments where buffer hits capacity (300 GB)
  const overflowDots = useMemo(() => {
    const dots: { x: number; y: number; satId: string }[] = [];
    for (const sat of scenario.satellites) {
      const pts = activeSchedule.buffer_timeline[sat.id] ?? [];
      for (const pt of pts) {
        if (pt.level_gb >= sat.buffer_capacity_gb - 0.5) {
          dots.push({
            x: timeToX(new Date(pt.t_utc).getTime()),
            y: gbToY(pt.level_gb),
            satId: sat.id,
          });
        }
      }
    }
    return dots;
  }, [activeSchedule, scenario.satellites, startMs, durationMs]);

  const playheadX = timeToX(currentTimeMs);
  const hourTicks = [0, 3, 6, 9, 12, 15, 18, 21, 24];

  return (
    <div className="absolute bottom-22 left-1/2 -translate-x-1/2 z-10 w-[92%] max-w-4xl">
      {/* Drawer Header Bar */}
      <div className="flex items-center justify-between rounded-t-xl border border-b-0 border-slate-800/90 bg-slate-950/90 px-4 py-2 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-sky-400" />
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
            24h Telemetry & Schedule Timeline
          </span>

          {/* Mode Tabs */}
          <div className="ml-3 flex items-center gap-1 rounded-lg bg-slate-900 p-0.5 border border-slate-800">
            <button
              onClick={() => {
                setActiveTab('buffers');
                setIsOpen(true);
              }}
              className={`rounded-md px-2.5 py-1 text-[11px] font-mono font-semibold transition cursor-pointer ${
                activeTab === 'buffers'
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
              className={`rounded-md px-2.5 py-1 text-[11px] font-mono font-semibold transition cursor-pointer ${
                activeTab === 'gantt'
                  ? 'bg-sky-500 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              61 Passes Gantt
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isOpen && activeTab === 'buffers' && (
            <button
              onClick={() => setCompareOverlay((v) => !v)}
              className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-mono transition cursor-pointer ${
                compareOverlay
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                  : 'border-slate-800 bg-slate-900 text-slate-500'
              }`}
              title="Overlay dashed curve of the other scheduler for visual comparison"
            >
              <Layers className="w-3 h-3" />
              Compare {otherMethod} (dashed)
            </button>
          )}

          {/* Legend */}
          {isOpen && activeTab === 'buffers' && (
            <div className="hidden sm:flex items-center gap-3 text-[11px] font-mono text-slate-300">
              {scenario.satellites.map((sat) => (
                <span key={sat.id} className="flex items-center gap-1">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: SAT_COLORS[sat.id] }}
                  />
                  {sat.id}
                </span>
              ))}
              <span className="flex items-center gap-1 text-red-400">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                300 GB Spill
              </span>
            </div>
          )}

          <button
            onClick={() => setIsOpen((v) => !v)}
            className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-[11px] font-mono text-slate-300 hover:bg-slate-800 cursor-pointer"
          >
            {isOpen ? (
              <>
                Hide <ChevronDown className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                Show Chart <ChevronUp className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Collapsible Chart Body */}
      {isOpen && (
        <div className="rounded-b-xl border border-slate-800/90 bg-slate-950/90 px-3 pb-2.5 pt-1 backdrop-blur-md shadow-2xl">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-38 cursor-crosshair select-none"
            onClick={handleSvgPointer}
            onMouseMove={(e) => {
              if (e.buttons === 1) handleSvgPointer(e);
            }}
          >
            {/* Vertical Hour Gridlines */}
            {hourTicks.map((h) => {
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
                    y={height - 7}
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

                {/* Optional Comparison Curves (Other scheduler as dashed lines) */}
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

                {/* Red Overflow Markers at 300 GB Ceiling */}
                {overflowDots.map((d, idx) => (
                  <circle
                    key={idx}
                    cx={d.x}
                    cy={d.y}
                    r="2.6"
                    fill="#ef4444"
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
                  const antColor = ANT_COLORS[ant.id] ?? '#38bdf8';

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
                        fontSize="10"
                        fontWeight="bold"
                        fontFamily="ui-monospace, monospace"
                      >
                        {ant.name.slice(0, 6)}
                      </text>

                      {antPasses.map((p) => {
                        const x1 = timeToX(new Date(p.aos_utc).getTime());
                        const x2 = Math.max(
                          x1 + 4,
                          timeToX(new Date(p.los_utc).getTime())
                        );
                        const isChosen = chosenSet.has(p.pass_id);
                        const isDiff =
                          chosenSet.has(p.pass_id) !==
                          otherChosenSet.has(p.pass_id);
                        const satColor =
                          SAT_COLORS[p.satellite_id] ?? '#38bdf8';

                        return (
                          <g key={p.pass_id}>
                            <rect
                              x={x1}
                              y={rowY + 6}
                              width={x2 - x1}
                              height={rowH - 12}
                              rx="2"
                              fill={isChosen ? satColor : '#1e293b'}
                              opacity={isChosen ? 0.92 : 0.45}
                              stroke={
                                isDiff
                                  ? '#fbbf24'
                                  : isChosen
                                  ? '#ffffff'
                                  : '#475569'
                              }
                              strokeWidth={isDiff ? '1.8' : '0.6'}
                            >
                              <title>
                                {`${p.pass_id.toUpperCase()} (${p.satellite_id} -> ${p.antenna_id})
Expected: ${p.expected_volume_gb} GB | Max El: ${p.max_elevation_deg}°
Status: ${
                                  isChosen ? 'CHOSEN' : 'SKIPPED'
                                }${isDiff ? ' (Differs between Greedy & Optimizer!)' : ''}`}
                              </title>
                            </rect>
                          </g>
                        );
                      })}
                    </g>
                  );
                })}
              </>
            )}

            {/* Synchronized Playhead Line */}
            <line
              x1={playheadX}
              y1={padTop - 4}
              x2={playheadX}
              y2={padTop + plotH + 4}
              stroke="#f8fafc"
              strokeWidth="1.8"
            />
            <circle cx={playheadX} cy={padTop} r="3.5" fill="#38bdf8" />
          </svg>
        </div>
      )}
    </div>
  );
}
