import { useRef, type CSSProperties } from 'react';
import type { LandingDataBundle } from '../data/loadLandingData';
import type { BufferPoint } from '../../types/engine';
import { useRevealOnce } from '../hooks/useRevealOnce';

interface ActWastedPassProps {
  data: LandingDataBundle | null;
}

function BufferSmallMultiple({
  title,
  norad,
  greedyPts,
  qslicePts,
  startMs,
  durationMs,
  revealed,
}: {
  title: string;
  norad: number;
  greedyPts: BufferPoint[];
  qslicePts: BufferPoint[];
  startMs: number;
  durationMs: number;
  revealed: boolean;
}) {
  const W = 540;
  const H = 176;
  const padL = 44;
  const padR = 16;
  const padT = 20;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const toX = (utc: string) => {
    const frac = Math.max(0, Math.min(1, (Date.parse(utc) - startMs) / durationMs));
    return padL + frac * plotW;
  };
  const toY = (gb: number) => padT + (1 - Math.max(0, Math.min(300, gb)) / 300) * plotH;

  const pathFor = (pts: BufferPoint[]) =>
    pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.t_utc).toFixed(1)} ${toY(p.level_gb).toFixed(1)}`)
      .join(' ');

  const greedyPath = pathFor(greedyPts);
  const qslicePath = pathFor(qslicePts);
  const greedyOverflowMarks = greedyPts.filter((p) => p.level_gb >= 299.5);
  const qsliceOverflowMarks = qslicePts.filter((p) => p.level_gb >= 299.5);

  return (
    <div className="lp-plate lp-plate-interactive p-4" data-revealed={revealed ? 'true' : 'false'}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <div className="flex items-baseline gap-2.5">
          <span className="font-semibold text-[15px]" style={{ color: 'var(--ink-void)' }}>
            {title}
          </span>
          <span className="lp-mono text-[12.5px]" style={{ color: 'var(--ink-void-3)' }}>
            NORAD {norad}
          </span>
        </div>
        <div className="text-[12.5px] font-medium flex items-center gap-4" style={{ color: 'var(--ink-void-2)' }}>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-[2px]" style={{ background: '#9DA9B8' }} />
            Greedy
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-[2px]" style={{ background: '#45D6A0' }} />
            Q Slice
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto block"
        role="img"
        aria-label={`${title} 24-hour onboard buffer fill curve comparing Greedy and Q Slice`}
      >
        {/* Horizontal grid lines */}
        {[0, 100, 200, 300].map((val) => {
          const y = toY(val);
          const isCap = val === 300;
          return (
            <g key={val}>
              <line
                x1={padL}
                y1={y}
                x2={W - padR}
                y2={y}
                stroke={isCap ? 'rgba(255,100,100,0.55)' : 'rgba(233,237,242,0.1)'}
                strokeWidth={isCap ? 1.2 : 1}
                strokeDasharray={isCap ? '4 3' : undefined}
              />
              <text
                x={padL - 8}
                y={y + 4}
                textAnchor="end"
                fontFamily="IBM Plex Mono, monospace"
                fontSize="11"
                fill={isCap ? '#FF6464' : '#8391A1'}
              >
                {val}
              </text>
            </g>
          );
        })}

        {/* Vertical hour grid lines */}
        {[0, 6, 12, 18, 24].map((hr) => {
          const x = padL + (hr / 24) * plotW;
          return (
            <g key={hr}>
              <line
                x1={x}
                y1={padT}
                x2={x}
                y2={H - padB}
                stroke="rgba(233,237,242,0.07)"
                strokeWidth="1"
              />
              <text
                x={x}
                y={H - 8}
                textAnchor="middle"
                fontFamily="IBM Plex Mono, monospace"
                fontSize="11"
                fill="#8391A1"
              >
                {String(hr).padStart(2, '0')}:00
              </text>
            </g>
          );
        })}

        {/* Overflow tick strip along 300 GB ceiling */}
        {greedyOverflowMarks.map((pt, i) => (
          <line
            key={`go-${i}`}
            x1={toX(pt.t_utc)}
            y1={padT - 5}
            x2={toX(pt.t_utc)}
            y2={padT}
            stroke="#FF6464"
            strokeWidth="1.4"
            strokeOpacity="0.65"
          />
        ))}
        {qsliceOverflowMarks.map((pt, i) => (
          <line
            key={`qo-${i}`}
            x1={toX(pt.t_utc)}
            y1={padT}
            x2={toX(pt.t_utc)}
            y2={padT + 4}
            stroke="#FF6464"
            strokeWidth="1.2"
            strokeOpacity="0.9"
          />
        ))}

        {/* Greedy buffer curve (drawn on reveal via pathLength=1) */}
        {greedyPath && (
          <path
            d={greedyPath}
            pathLength={1}
            className="lp-curve-draw"
            fill="none"
            stroke="#9DA9B8"
            strokeWidth="1.4"
            strokeOpacity="0.82"
          />
        )}

        {/* Q Slice buffer curve (draws 140ms after Greedy to highlight lower drain) */}
        {qslicePath && (
          <path
            d={qslicePath}
            pathLength={1}
            className="lp-curve-draw"
            style={{ '--curve-delay': '140ms' } as CSSProperties}
            fill="none"
            stroke="#45D6A0"
            strokeWidth="1.9"
          />
        )}

        <text
          x={padL + 6}
          y={padT - 7}
          fontFamily="IBM Plex Mono, monospace"
          fontSize="10.5"
          fill="#FF7A7A"
        >
          300 GB OVERFLOW CEILING
        </text>
      </svg>
    </div>
  );
}

export default function ActWastedPass({ data }: ActWastedPassProps) {
  const waterfallRef = useRef<HTMLDivElement>(null);
  const buffersRef = useRef<HTMLDivElement>(null);
  const waterfallRevealed = useRevealOnce(waterfallRef, 0.22);
  const buffersRevealed = useRevealOnce(buffersRef, 0.2);

  const rows = data?.waterfallRows ?? [
    {
      method: 'greedy' as const,
      label: 'Greedy',
      unitLabel: 'Whole pass (earliest first)',
      passesUsed: 30,
      deliveredGb: 691.4,
      overflowGb: 1708.6,
      storedGb: 600.0,
      capturePct: 23.0,
      deltaVsGreedyGb: 0,
      deltaVsGreedyPct: 0,
      overflowEvents: 24,
    },
    {
      method: 'optimizer' as const,
      label: 'Whole-pass MILP',
      unitLabel: 'Whole pass (global ILP)',
      passesUsed: 30,
      deliveredGb: 695.8,
      overflowGb: 1704.2,
      storedGb: 600.0,
      capturePct: 23.2,
      deltaVsGreedyGb: 4.4,
      deltaVsGreedyPct: 0.6,
      overflowEvents: 25,
    },
    {
      method: 'qslice' as const,
      label: 'Q Slice',
      unitLabel: '15-second handover slices',
      passesUsed: 56,
      deliveredGb: 999.2,
      overflowGb: 1400.8,
      storedGb: 600.0,
      capturePct: 33.3,
      deltaVsGreedyGb: 307.8,
      deltaVsGreedyPct: 44.5,
      overflowEvents: 25,
    },
  ];

  const totalGb = data?.scoreboard.generated_gb ?? 3000;
  const startMs = data ? Date.parse(data.scenario.start_utc) : Date.parse('2026-11-09T00:00:00Z');
  const durationMs = (data?.scenario.duration_hours ?? 24) * 3600 * 1000;

  const greedyRow = rows.find((r) => r.method === 'greedy')!;
  const qsliceRow = rows.find((r) => r.method === 'qslice')!;

  const barColors: Record<string, string> = {
    greedy: '#9DA9B8',
    optimizer: '#5BD6E6',
    qslice: '#45D6A0',
  };

  return (
    <section id="act-01" className="lp-act">
      <div className="lp-container">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end mb-12">
          <div className="lg:col-span-7">
            <div className="lp-act-tag">
              <span className="lp-act-num">01</span>
              <span>THE WASTED PASS · 24-HOUR MASS BALANCE</span>
            </div>
            <h2 className="lp-h2" style={{ color: 'var(--ink-void)' }}>
              1,708.6 GB did not disappear.
              <br />
              It boiled off.
            </h2>
          </div>

          <div className="lg:col-span-5">
            <p className="lp-lead">
              Each Sentinel-2 spacecraft records 62.5 GB of multispectral imagery
              every hour into a 300 GB solid-state buffer. When a dish sits locked
              onto a low-elevation pass tail—or drops a conflicting pass altogether—the
              buffer hits 300 GB and overwrites un-downlinked scenes.
            </p>
          </div>
        </div>

        {/* Full-Width 0..3,000 GB Mass-Balance Waterfall Chart */}
        <div
          ref={waterfallRef}
          data-revealed={waterfallRevealed ? 'true' : 'false'}
          className="lp-plate p-5 sm:p-7"
        >
          <div
            className="flex flex-wrap items-center justify-between gap-4 pb-5 mb-6"
            style={{ borderBottom: '1px solid var(--rule-void)' }}
          >
            <div>
              <div className="lp-micro" style={{ color: 'var(--ink-void)' }}>
                24-HOUR DATA ACCOUNTING · SHARED 0 TO 3,000 GB AXIS
              </div>
              <div className="text-[14px] mt-1" style={{ color: 'var(--ink-void-2)' }}>
                Every scheduler begins with the same 3,000.0 GB generated and ends with 600.0 GB stored in onboard buffers.
              </div>
            </div>

            <div className="lp-micro flex flex-wrap items-center gap-5">
              <span className="inline-flex items-center gap-2" style={{ color: 'var(--ink-void)' }}>
                <span className="inline-block w-3 h-3" style={{ background: '#45D6A0' }} />
                Delivered
              </span>
              <span className="inline-flex items-center gap-2" style={{ color: 'var(--red)' }}>
                <span
                  className="inline-block w-3 h-3 lp-hatch-overflow"
                  style={{ border: '1px solid rgba(255,100,100,0.65)' }}
                />
                Overflow lost
              </span>
              <span className="inline-flex items-center gap-2" style={{ color: 'var(--ink-void-2)' }}>
                <span
                  className="inline-block w-3 h-3 lp-hatch-stored"
                  style={{ border: '1px solid rgba(157,169,184,0.45)' }}
                />
                Stored at 24:00 (600.0 GB)
              </span>
            </div>
          </div>

          {/* Axis ticks */}
          <div className="hidden sm:grid grid-cols-12 mb-2">
            <div className="col-span-3" />
            <div className="col-span-9 relative h-5">
              {[0, 600, 1200, 1800, 2400, 3000].map((gb) => (
                <span
                  key={gb}
                  className="lp-mono text-[10px] absolute -translate-x-1/2"
                  style={{
                    left: `${(gb / totalGb) * 100}%`,
                    color: 'var(--ink-void-3)',
                  }}
                >
                  {gb.toLocaleString('en-US')}
                </span>
              ))}
            </div>
          </div>

          {/* Stacked rows: dedicated fill layer scales on GPU so labels NEVER squish */}
          <div className="space-y-5">
            {rows.map((row, rowIdx) => {
              const delPct = (row.deliveredGb / totalGb) * 100;
              const ovfPct = (row.overflowGb / totalGb) * 100;
              const stoPct = (row.storedGb / totalGb) * 100;
              const isQSlice = row.method === 'qslice';
              const rowDelay = rowIdx * 90;

              return (
                <div
                  key={row.method}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center"
                >
                  <div className="sm:col-span-3 pr-2">
                    <div className="flex items-baseline justify-between sm:block">
                      <span
                        className="text-[15px] font-semibold"
                        style={{ color: isQSlice ? 'var(--green)' : 'var(--ink-void)' }}
                      >
                        {row.label}
                      </span>
                      <span
                        className="lp-mono text-[12.5px] sm:block mt-0.5"
                        style={{ color: 'var(--ink-void-2)' }}
                      >
                        {row.passesUsed} {row.method === 'qslice' ? 'slots' : 'passes'} · {row.capturePct.toFixed(1)}% capture
                      </span>
                    </div>
                  </div>

                  <div className="sm:col-span-9">
                    <div
                      className="w-full h-12 flex relative"
                      style={{
                        border: isQSlice
                          ? '1px solid rgba(69,214,160,0.55)'
                          : '1px solid var(--rule-void)',
                        background: 'var(--void)',
                      }}
                    >
                      {/* Delivered segment */}
                      <div
                        className="relative h-full flex items-center px-3 overflow-hidden"
                        style={{ width: `${delPct}%`, color: '#05070A' }}
                      >
                        <div
                          className="lp-bar-fill absolute inset-0"
                          style={{
                            backgroundColor: barColors[row.method],
                            transitionDelay: `${rowDelay}ms`,
                          }}
                          aria-hidden="true"
                        />
                        <span
                          className="lp-bar-label relative z-10 lp-mono text-[13.5px] font-semibold whitespace-nowrap"
                          style={{ transitionDelay: `${rowDelay + 240}ms` }}
                        >
                          {row.deliveredGb.toFixed(1)} GB
                        </span>
                      </div>

                      {/* Overflow segment (45 deg diagonal red hatch) */}
                      <div
                        className="relative h-full flex items-center justify-center px-2 overflow-hidden"
                        style={{
                          width: `${ovfPct}%`,
                          borderLeft: '1px solid rgba(255,100,100,0.55)',
                          borderRight: '1px solid rgba(157,169,184,0.3)',
                        }}
                      >
                        <div
                          className="lp-bar-fill lp-hatch-overflow absolute inset-0"
                          style={{ transitionDelay: `${rowDelay + 80}ms` }}
                          aria-hidden="true"
                        />
                        <span
                          className="lp-bar-label relative z-10 lp-mono text-[13px] font-semibold whitespace-nowrap"
                          style={{
                            color: '#FF8585',
                            transitionDelay: `${rowDelay + 280}ms`,
                          }}
                        >
                          {row.overflowGb.toFixed(1)} GB lost
                        </span>
                      </div>

                      {/* Stored segment (600 GB) */}
                      <div
                        className="relative h-full flex items-center justify-center px-1.5 overflow-hidden"
                        style={{ width: `${stoPct}%` }}
                      >
                        <div
                          className="lp-bar-fill lp-hatch-stored absolute inset-0"
                          style={{ transitionDelay: `${rowDelay + 140}ms` }}
                          aria-hidden="true"
                        />
                        <span
                          className="lp-bar-label relative z-10 lp-mono text-[12.5px] whitespace-nowrap hidden md:inline"
                          style={{
                            color: 'var(--ink-void-2)',
                            transitionDelay: `${rowDelay + 310}ms`,
                          }}
                        >
                          {row.storedGb.toFixed(0)} GB
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Direct lift bracket callout */}
          <div className="grid grid-cols-1 sm:grid-cols-12 mt-5 pt-4" style={{ borderTop: '1px solid var(--rule-void)' }}>
            <div className="sm:col-span-3 flex items-center">
              <span className="lp-micro" style={{ color: 'var(--amber)' }}>
                NET RESCUED DATA
              </span>
            </div>
            <div className="sm:col-span-9 relative">
              <div className="hidden sm:block relative h-9">
                {/* Bracket spanning from Greedy delivered (691.4/3000) to Q Slice delivered (999.2/3000) */}
                <div
                  className="lp-bar-fill absolute top-0 h-4"
                  style={{
                    left: `${(greedyRow.deliveredGb / totalGb) * 100}%`,
                    width: `${((qsliceRow.deliveredGb - greedyRow.deliveredGb) / totalGb) * 100}%`,
                    borderLeft: '1.5px solid #45D6A0',
                    borderRight: '1.5px solid #45D6A0',
                    borderBottom: '1.5px solid #45D6A0',
                    transitionDuration: '360ms',
                    transitionDelay: '420ms',
                  }}
                />
                <div
                  className="lp-bar-label text-[14px] font-medium absolute top-5 whitespace-nowrap"
                  style={{
                    left: `${(greedyRow.deliveredGb / totalGb) * 100}%`,
                    color: 'var(--green)',
                    transitionDelay: '520ms',
                  }}
                >
                  <span className="lp-mono font-semibold">+{qsliceRow.deltaVsGreedyGb.toFixed(1)} GB</span> delivered (<span className="lp-mono font-semibold">+{qsliceRow.deltaVsGreedyPct.toFixed(1)}%</span> vs. Greedy) — same 3 dishes, same 24 hours
                </div>
              </div>
              <div className="sm:hidden text-[14px] font-medium mt-1" style={{ color: 'var(--green)' }}>
                +{qsliceRow.deltaVsGreedyGb.toFixed(1)} GB delivered (+{qsliceRow.deltaVsGreedyPct.toFixed(1)}% vs. Greedy)
              </div>
            </div>
          </div>

          {/* Accessible table alternative */}
          <details className="lp-details mt-5 pt-3" style={{ borderTop: '1px solid var(--rule-void)' }}>
            <summary
              className="lp-details-summary lp-micro cursor-pointer select-none flex items-center justify-between py-1.5"
              style={{ color: 'var(--ink-void-2)' }}
            >
              <span>Inspect exact 24-hour mass-balance numbers (accessible table)</span>
              <span className="lp-details-icon lp-mono" aria-hidden="true">+</span>
            </summary>
            <div className="lp-details-body lp-table-wrap mt-3">
              <table className="lp-table lp-table-void">
                <thead>
                  <tr>
                    <th>Scheduler</th>
                    <th data-align="right">Slots / Passes</th>
                    <th data-align="right">Delivered (GB)</th>
                    <th data-align="right">Overflow (GB)</th>
                    <th data-align="right">Stored at 24:00 (GB)</th>
                    <th data-align="right">Sum (GB)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.method}>
                      <td>{r.label}</td>
                      <td data-align="right">{r.passesUsed}</td>
                      <td data-align="right">{r.deliveredGb.toFixed(1)}</td>
                      <td data-align="right">{r.overflowGb.toFixed(1)}</td>
                      <td data-align="right">{r.storedGb.toFixed(1)}</td>
                      <td data-align="right">
                        {(r.deliveredGb + r.overflowGb + r.storedGb).toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>

        {/* Small Multiples: 24-Hour Buffer Curves for S2A & S2B */}
        {data && (
          <div ref={buffersRef} className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-6">
            <BufferSmallMultiple
              title="SENTINEL-2A"
              norad={40697}
              greedyPts={data.schedules.greedy.buffer_timeline['sentinel-2a'] ?? []}
              qslicePts={data.schedules.qslice.buffer_timeline['sentinel-2a'] ?? []}
              startMs={startMs}
              durationMs={durationMs}
              revealed={buffersRevealed}
            />
            <BufferSmallMultiple
              title="SENTINEL-2B"
              norad={42063}
              greedyPts={data.schedules.greedy.buffer_timeline['sentinel-2b'] ?? []}
              qslicePts={data.schedules.qslice.buffer_timeline['sentinel-2b'] ?? []}
              startMs={startMs}
              durationMs={durationMs}
              revealed={buffersRevealed}
            />
          </div>
        )}
      </div>
    </section>
  );
}
