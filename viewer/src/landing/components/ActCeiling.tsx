import { useReveal } from '../hooks/useReveal';
import type { LandingDataBundle } from '../data/loadLandingData';

interface ActCeilingProps {
  data: LandingDataBundle | null;
}

function t(iso: string): number {
  return Date.parse(iso);
}

function shortTime(iso: string): string {
  return iso.slice(11, 19);
}

export default function ActCeiling({ data }: ActCeilingProps) {
  const ref = useReveal<HTMLElement>(0.1);
  const p011 = data?.conflictWindowPasses.find((p) => p.pass_id === 'p011');
  const p012 = data?.conflictWindowPasses.find((p) => p.pass_id === 'p012');
  const aos1 = p011?.aos_utc ?? '2026-11-09T07:52:51Z';
  const los1 = p011?.los_utc ?? '2026-11-09T08:03:29Z';
  const aos2 = p012?.aos_utc ?? '2026-11-09T07:56:09Z';
  const los2 = p012?.los_utc ?? '2026-11-09T08:06:18Z';
  const conflict = data?.conflictWindowPairs.find(
    (pair) =>
      (pair.pass_a === 'p011' && pair.pass_b === 'p012') ||
      (pair.pass_a === 'p012' && pair.pass_b === 'p011')
  );

  const windowStart = t('2026-11-09T07:50:00Z');
  const windowEnd = t('2026-11-09T08:20:00Z');
  const W = 1000;
  const x = (iso: string) => ((t(iso) - windowStart) / (windowEnd - windowStart)) * W;
  const overlapStart = Math.max(t(aos1), t(aos2));
  const overlapEnd = Math.min(t(los1), t(los2));
  const overlapSec = Math.round((overlapEnd - overlapStart) / 1000);

  const ticks = [
    '2026-11-09T07:50:00Z',
    '2026-11-09T07:55:00Z',
    '2026-11-09T08:00:00Z',
    '2026-11-09T08:05:00Z',
    '2026-11-09T08:10:00Z',
    '2026-11-09T08:15:00Z',
    '2026-11-09T08:20:00Z',
  ];

  const milp = data?.waterfallRows.find((row) => row.method === 'optimizer');
  const greedy = data?.waterfallRows.find((row) => row.method === 'greedy');

  return (
    <section id="act-02" className="q-act q-act--ceiling" ref={ref}>
      <div className="q-container">
        <div className="q-act__index">
          <span className="q-act__index-num">02</span>
          <span className="q-micro">DECISION UNIT / WHOLE PASS</span>
        </div>

        <div className="q-ceiling-grid">
          <div className="q-ceiling-copy">
            <h2 className="q-h2">
              A better optimizer
              <br />
              cannot fix a block.
            </h2>
            <p className="q-lead">
              The obvious upgrade is binary MILP: search every possible combination of whole
              passes. It finds the true optimum for that model — <strong>695.8 GB</strong>, just
              <strong> 0.6% above Greedy</strong>.
            </p>
            <p>
              The reason is physical. When Svalbard and Kiruna both see the same spacecraft at
              the same time, choosing one whole pass forbids the other. The solver is exact. The
              unit it is solving is wrong.
            </p>
            <div className="q-ceiling-note">
              <span className="q-mono">61 passes</span>
              <span className="q-mono">63 conflicts</span>
              <span className="q-mono">40 same-spacecraft</span>
              <span className="q-mono">23 same-dish</span>
            </div>
          </div>

          <div className="q-ceiling-figure q-reveal">
            <div className="q-figure-head">
              <span className="q-micro">FIGURE 02 / THE OVERLAP THAT LOCKS THE SCHEDULE</span>
              <span className="q-mono q-ceiling-figure__utc">07:50 — 08:20 UTC</span>
            </div>

            <svg
              className="q-overlap-svg"
              viewBox="0 0 1000 304"
              role="img"
              aria-label={`Two passes overlap for ${overlapSec} seconds: p011 Svalbard ${shortTime(aos1)} to ${shortTime(los1)}, and p012 Kiruna ${shortTime(aos2)} to ${shortTime(los2)}.`}
            >
              <defs>
                <pattern id="conflictHatch" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                  <rect width="7" height="7" fill="rgba(255,100,100,0.10)" />
                  <line x1="0" y1="0" x2="0" y2="7" stroke="rgba(255,100,100,0.55)" strokeWidth="1.4" />
                </pattern>
              </defs>

              {ticks.map((tick, index) => (
                <g key={tick}>
                  <line
                    x1={x(tick)}
                    y1="44"
                    x2={x(tick)}
                    y2="248"
                    stroke={index === 0 || index === ticks.length - 1 ? 'rgba(238,242,246,0.18)' : 'rgba(238,242,246,0.08)'}
                    strokeWidth="1"
                  />
                  <text
                    x={x(tick)}
                    y="274"
                    fill="#7f8d97"
                    fontFamily="IBM Plex Mono, monospace"
                    fontSize="11"
                    textAnchor="middle"
                  >
                    {tick.slice(11, 16)}
                  </text>
                </g>
              ))}

              <rect
                x={x(new Date(overlapStart).toISOString())}
                y="72"
                width={x(new Date(overlapEnd).toISOString()) - x(new Date(overlapStart).toISOString())}
                height="112"
                fill="url(#conflictHatch)"
                stroke="rgba(255,100,100,0.7)"
                strokeWidth="1"
              />

              <g>
                <text x="0" y="95" fill="#f0a43c" fontFamily="IBM Plex Mono, monospace" fontSize="11">
                  p011 · SVALBARD
                </text>
                <rect x={x(aos1)} y="104" width={x(los1) - x(aos1)} height="26" fill="#f0a43c" fillOpacity="0.82" />
                <text x={x(aos1) + 7} y="121" fill="#080c10" fontFamily="IBM Plex Mono, monospace" fontSize="11" fontWeight="600">
                  638 s
                </text>
                <text x={x(los1) + 8} y="122" fill="#b2becb" fontFamily="IBM Plex Mono, monospace" fontSize="10">
                  {shortTime(los1)}
                </text>
              </g>

              <g>
                <text x="0" y="158" fill="#5bd6e6" fontFamily="IBM Plex Mono, monospace" fontSize="11">
                  p012 · KIRUNA
                </text>
                <rect x={x(aos2)} y="167" width={x(los2) - x(aos2)} height="26" fill="#5bd6e6" fillOpacity="0.82" />
                <text x={x(aos2) + 7} y="184" fill="#080c10" fontFamily="IBM Plex Mono, monospace" fontSize="11" fontWeight="600">
                  610 s
                </text>
                <text x={x(aos2) - 8} y="184" fill="#b2becb" fontFamily="IBM Plex Mono, monospace" fontSize="10" textAnchor="end">
                  {shortTime(aos2)}
                </text>
              </g>

              <line
                x1={x(new Date(overlapStart).toISOString())}
                y1="48"
                x2={x(new Date(overlapEnd).toISOString())}
                y2="48"
                stroke="#ff6464"
                strokeWidth="1"
              />
              <line x1={x(new Date(overlapStart).toISOString())} y1="44" x2={x(new Date(overlapStart).toISOString())} y2="52" stroke="#ff6464" strokeWidth="1" />
              <line x1={x(new Date(overlapEnd).toISOString())} y1="44" x2={x(new Date(overlapEnd).toISOString())} y2="52" stroke="#ff6464" strokeWidth="1" />
              <text
                x={(x(new Date(overlapStart).toISOString()) + x(new Date(overlapEnd).toISOString())) / 2}
                y="38"
                fill="#ff8b83"
                fontFamily="IBM Plex Mono, monospace"
                fontSize="11"
                textAnchor="middle"
              >
                {overlapSec} s overlap · {conflict?.reason?.replace('_', ' ') ?? 'same spacecraft'}
              </text>

              <line x1="0" y1="248" x2="1000" y2="248" stroke="rgba(238,242,246,0.2)" strokeWidth="1" />
              <text x="0" y="294" fill="#7f8d97" fontFamily="IBM Plex Mono, monospace" fontSize="10">
                TWO PHYSICAL PASSES · ONE SPACECRAFT · ONE ANTENNA EACH
              </text>
              <text x="1000" y="294" fill="#7f8d97" fontFamily="IBM Plex Mono, monospace" fontSize="10" textAnchor="end">
                LOCK ONE → FORFEIT THE OTHER
              </text>
            </svg>

            <div className="q-ceiling-result">
              <div className="q-ceiling-delta">
                <span className="q-ceiling-delta__value">+0.6%</span>
                <span className="q-mono">MILP vs GREEDY</span>
              </div>
              <div className="q-ceiling-delta__detail">
                <span className="q-mono">
                  {milp?.deliveredGb.toFixed(1) ?? '695.8'} GB vs {greedy?.deliveredGb.toFixed(1) ?? '691.4'} GB
                </span>
                <span>
                  An exact global solve buys 4.4 GB because the decision is still a whole pass.
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="q-ceiling-pull">
          <span className="q-mono">THE REFRAME</span>
          <p>
            MILP chose the pass.
            <br />
            <strong>Q Slice chooses the second.</strong>
          </p>
        </div>
      </div>
    </section>
  );
}
