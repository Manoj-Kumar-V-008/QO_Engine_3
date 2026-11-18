import type { LandingDataBundle } from '../data/loadLandingData';

interface ActBinaryCeilingProps {
  data: LandingDataBundle | null;
}

const WIN_START = Date.parse('2026-11-09T07:51:00Z');
const WIN_END = Date.parse('2026-11-09T08:17:00Z');
const WIN_SPAN = WIN_END - WIN_START;

function fracX(utc: string | number): number {
  const ms = typeof utc === 'number' ? utc : Date.parse(utc);
  return Math.max(0, Math.min(1, (ms - WIN_START) / WIN_SPAN));
}

export default function ActBinaryCeiling({ data }: ActBinaryCeilingProps) {
  const passes = data?.conflictWindowPasses ?? [];
  const profile = data?.elevationProfile ?? [];
  const milpRow = data?.waterfallRows.find((r) => r.method === 'optimizer');

  const W = 720;
  const padL = 94;
  const padR = 18;
  const plotW = W - padL - padR;

  const laneOrder = ['p011', 'p012', 'p014', 'p013', 'p015'];
  const orderedPasses = laneOrder
    .map((id) => passes.find((p) => p.pass_id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const stationColor = (antId: string) => {
    if (antId === 'svalbard-1') return '#F0A43C';
    if (antId === 'kiruna-1') return '#5BD6E6';
    return '#45D6A0';
  };
  const stationShort = (antId: string) => {
    if (antId === 'svalbard-1') return 'SVALBARD';
    if (antId === 'kiruna-1') return 'KIRUNA';
    return 'MATERA';
  };

  // Elevation chart geometry
  const elH = 196;
  const elPadT = 22;
  const elPadB = 30;
  const elPlotH = elH - elPadT - elPadB;
  const elY = (deg: number) => elPadT + (1 - Math.min(35, Math.max(0, deg)) / 35) * elPlotH;

  const svalPath = profile
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${(padL + fracX(pt.timeMs) * plotW).toFixed(1)} ${elY(pt.svalbardS2bEl).toFixed(1)}`)
    .join(' ');
  const kirPath = profile
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${(padL + fracX(pt.timeMs) * plotW).toFixed(1)} ${elY(pt.kirunaS2bEl).toFixed(1)}`)
    .join(' ');
  const matPath = profile
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${(padL + fracX(pt.timeMs) * plotW).toFixed(1)} ${elY(pt.materaS2bEl).toFixed(1)}`)
    .join(' ');

  const handover1X = padL + fracX('2026-11-09T08:01:00Z') * plotW;
  const handover2X = padL + fracX('2026-11-09T08:06:15Z') * plotW;

  const milpChosen = new Set(['p012', 'p013']);

  return (
    <section id="act-02" className="lp-act">
      <div className="lp-container">
        <div className="lp-act-tag">
          <span className="lp-act-num">02</span>
          <span>THE BINARY CEILING · WHOLE-PASS CONFLICT GEOMETRY</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* Left 8 cols: Real pass-overlap diagram + Real SGP4 elevation step curve */}
          <div className="lg:col-span-8">
            <h2 className="lp-h2" style={{ color: 'var(--ink-void)' }}>
              A better optimizer cannot fix a bad unit.
            </h2>

            <p className="lp-lead mt-5 max-w-[60ch]">
              Across 24 hours, 61 candidate passes generate 63 hard conflicts—40 where
              one satellite is visible to two dishes at once, and 23 where two satellites
              want the same dish inside its 120-second slew window. Treating each pass
              as an all-or-nothing block forces even a globally optimal MILP solver to
              discard entire windows.
            </p>

            {/* Diagram 1: Real 07:51–08:17 UTC Conflict Cluster */}
            <div className="lp-plate p-4 sm:p-5 mt-8">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
                <span className="lp-micro" style={{ color: 'var(--ink-void)' }}>
                  REAL CONFLICT CLUSTER · 07:51–08:17 UTC (SENTINEL-2B &amp; 2A)
                </span>
                <span className="lp-micro" style={{ color: 'var(--red)' }}>
                  MILP MUST DROP P011, P014, P015
                </span>
              </div>

              <svg
                viewBox={`0 0 ${W} 214`}
                className="w-full h-auto block"
                role="img"
                aria-label="Overlapping candidate passes p011 through p015 showing same-satellite and same-antenna conflicts"
              >
                {/* Time gridlines */}
                {['07:55', '08:00', '08:05', '08:10', '08:15'].map((t) => {
                  const x = padL + fracX(`2026-11-09T${t}:00Z`) * plotW;
                  return (
                    <g key={t}>
                      <line
                        x1={x}
                        y1={14}
                        x2={x}
                        y2={192}
                        stroke="rgba(233,237,242,0.08)"
                        strokeWidth="1"
                      />
                      <text
                        x={x}
                        y={208}
                        textAnchor="middle"
                        fontFamily="IBM Plex Mono, monospace"
                        fontSize="11"
                        fill="#8391A1"
                      >
                        {t}
                      </text>
                    </g>
                  );
                })}

                {/* Red conflict tie-lines between p011-p012 (same_satellite) and p011-p013 (same_antenna) */}
                {orderedPasses.length >= 4 && (
                  <g>
                    {/* p011 <-> p012 overlap highlight */}
                    <rect
                      x={padL + fracX('2026-11-09T07:56:09Z') * plotW}
                      y={22}
                      width={(fracX('2026-11-09T08:03:29Z') - fracX('2026-11-09T07:56:09Z')) * plotW}
                      height={60}
                      fill="rgba(255,100,100,0.09)"
                      stroke="#FF6464"
                      strokeWidth="1"
                      strokeDasharray="3 2"
                    />
                    <text
                      x={padL + fracX('2026-11-09T07:59:50Z') * plotW}
                      y={16}
                      textAnchor="middle"
                      fontFamily="IBM Plex Mono, monospace"
                      fontSize="10.5"
                      fill="#FF7A7A"
                    >
                      SAME_SATELLITE OVERLAP (7m 20s)
                    </text>
                  </g>
                )}

                {orderedPasses.map((p, idx) => {
                  const y = 26 + idx * 32;
                  const x1 = padL + fracX(p.aos_utc) * plotW;
                  const x2 = padL + fracX(p.los_utc) * plotW;
                  const w = Math.max(4, x2 - x1);
                  const chosenByMilp = milpChosen.has(p.pass_id);
                  const col = stationColor(p.antenna_id);

                  return (
                    <g key={p.pass_id}>
                      <text
                        x={padL - 10}
                        y={y + 15}
                        textAnchor="end"
                        fontFamily="IBM Plex Mono, monospace"
                        fontSize="10"
                        fill={chosenByMilp ? '#E9EDF2' : '#9DA9B8'}
                      >
                        {p.pass_id.toUpperCase()} · {p.satellite_id === 'sentinel-2b' ? 'S2B' : 'S2A'}
                      </text>

                      <rect
                        x={x1}
                        y={y}
                        width={w}
                        height={22}
                        fill={chosenByMilp ? col : 'rgba(255,100,100,0.08)'}
                        fillOpacity={chosenByMilp ? 0.24 : 1}
                        stroke={chosenByMilp ? col : '#FF6464'}
                        strokeWidth={chosenByMilp ? 1.4 : 1}
                        strokeDasharray={chosenByMilp ? undefined : '3 2'}
                      />

                      <text
                        x={w < 190 ? x1 + 6 : x1 + 6}
                        y={y + 15}
                        fontFamily="IBM Plex Mono, monospace"
                        fontSize="10.5"
                        fill={chosenByMilp ? '#EEF2F6' : '#FFA0A0'}
                      >
                        {w < 190
                          ? `${stationShort(p.antenna_id)} · ${p.expected_volume_gb.toFixed(1)} GB`
                          : `${stationShort(p.antenna_id)} · ${p.expected_volume_gb.toFixed(1)} GB · ${chosenByMilp ? 'MILP KEPT' : 'MILP DROPPED'}`}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Diagram 2: Real SGP4 Elevation & Rate Steps (0-10 / 10-20 / 20-30 / >=30 deg) */}
            <div className="lp-plate p-4 sm:p-5 mt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                <span className="lp-micro" style={{ color: 'var(--ink-void)' }}>
                  SENTINEL-2B SGP4 ELEVATION &amp; STEPPED X-BAND RATE
                </span>
                <span className="lp-micro" style={{ color: 'var(--ink-void-2)' }}>
                  0–10° 140 MBPS · 10–20° 280 MBPS · 20–30° 420 MBPS · ≥30° 560 MBPS
                </span>
              </div>

              <svg
                viewBox={`0 0 ${W} ${elH}`}
                className="w-full h-auto block"
                role="img"
                aria-label="Sentinel-2B elevation curves for Svalbard, Kiruna, and Matera showing stepped downlink rate bands and 08:01:00 handover cut"
              >
                {/* Rate band thresholds */}
                {[
                  { deg: 5, label: '5° MASK', col: '#647182' },
                  { deg: 10, label: '10° · 280M', col: '#647182' },
                  { deg: 20, label: '20° · 420M', col: '#9DA9B8' },
                  { deg: 30, label: '30° · 560M', col: '#9DA9B8' },
                ].map((band) => {
                  const y = elY(band.deg);
                  return (
                    <g key={band.deg}>
                      <line
                        x1={padL}
                        y1={y}
                        x2={W - padR}
                        y2={y}
                        stroke="rgba(233,237,242,0.12)"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={padL - 8}
                        y={y + 4}
                        textAnchor="end"
                        fontFamily="IBM Plex Mono, monospace"
                        fontSize="10.5"
                        fill={band.col}
                      >
                        {band.label}
                      </text>
                    </g>
                  );
                })}

                {/* Q Slice handover vertical cuts */}
                <line
                  x1={handover1X}
                  y1={elPadT}
                  x2={handover1X}
                  y2={elH - elPadB}
                  stroke="#E9EDF2"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
                <text
                  x={handover1X + 5}
                  y={elPadT + 11}
                  fontFamily="IBM Plex Mono, monospace"
                  fontSize="10.5"
                  fill="#EEF2F6"
                >
                  08:01 HANDOFF
                </text>

                <line
                  x1={handover2X}
                  y1={elPadT}
                  x2={handover2X}
                  y2={elH - elPadB}
                  stroke="#E9EDF2"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
                <text
                  x={handover2X + 5}
                  y={elPadT + 11}
                  fontFamily="IBM Plex Mono, monospace"
                  fontSize="10.5"
                  fill="#EEF2F6"
                >
                  08:06 HANDOFF
                </text>

                {/* Real SGP4 elevation curves */}
                {svalPath && (
                  <path d={svalPath} fill="none" stroke="#F0A43C" strokeWidth="2" />
                )}
                {kirPath && (
                  <path d={kirPath} fill="none" stroke="#5BD6E6" strokeWidth="2" />
                )}
                {matPath && (
                  <path d={matPath} fill="none" stroke="#45D6A0" strokeWidth="2" />
                )}

                {/* Legend */}
                <g transform={`translate(${padL}, ${elH - 7})`} fontFamily="IBM Plex Mono, monospace" fontSize="10.5">
                  <text x="0" y="0" fill="#F0A43C">SVALBARD P011 (21.1°)</text>
                  <text x="196" y="0" fill="#5BD6E6">KIRUNA P012 (18.6°)</text>
                  <text x="382" y="0" fill="#45D6A0">MATERA P014 (8.9°)</text>
                </g>
              </svg>
            </div>
          </div>

          {/* Right 4 cols: Giant amber +0.6% ceiling figure + pull line */}
          <div className="lg:col-span-4 lg:pt-14 flex flex-col justify-between gap-8">
            <div className="lp-plate p-6 sm:p-7">
              <div className="lp-micro" style={{ color: 'var(--ink-void-2)' }}>
                WHOLE-PASS MILP GAIN OVER GREEDY
              </div>
              <div
                className="lp-mono mt-3 font-semibold leading-none tracking-[-0.04em]"
                style={{
                  fontSize: 'clamp(3.75rem, 6.2vw, 5.5rem)',
                  color: 'var(--amber)',
                }}
              >
                +{(milpRow?.deltaVsGreedyPct ?? 0.6).toFixed(1)}%
              </div>
                <div
                className="lp-mono text-[14px] mt-3 pb-5"
                style={{
                  color: 'var(--ink-void-2)',
                  borderBottom: '1px solid var(--rule-void)',
                }}
              >
                +{(milpRow?.deltaVsGreedyGb ?? 4.4).toFixed(1)} GB across 24 hours (695.8 GB vs. 691.4 GB)
              </div>

              <p
                className="lp-body mt-5 mb-0"
              >
                Whole-pass integer programming explores every legal subset of the 61
                passes and still stalls at +0.6%. The ceiling is not algorithmic—it
                is geometric. Holding Svalbard down to a 5° tail wastes high-elevation
                seconds already opening over Kiruna.
              </p>
            </div>

            <blockquote
              className="m-0 pl-5 py-2"
              style={{ borderLeft: '2px solid var(--amber)' }}
            >
              <p
                className="lp-h3 m-0"
                style={{ color: 'var(--ink-void)' }}
              >
                MILP chose the pass.
                <br />
                Q Slice chooses the second.
              </p>
              <footer className="lp-micro mt-3" style={{ color: 'var(--ink-void-3)' }}>
                5,760 DISCRETE 15-SECOND SLICES PER SPACECRAFT PER DAY
              </footer>
            </blockquote>
          </div>
        </div>
      </div>
    </section>
  );
}
