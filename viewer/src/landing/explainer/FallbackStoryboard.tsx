import type { LandingDataBundle } from '../data/loadLandingData';
import type { ScheduleMethod } from '../../types/engine';

interface FallbackStoryboardProps {
  data: LandingDataBundle | null;
  frame: number;
  mode: ScheduleMethod;
  reasonLabel?: string;
}

export const LEDGER_FRAMES = [
  {
    index: 0,
    code: '01',
    short: 'Three stations',
    title: 'Three dishes across 38° of latitude.',
    body: 'Svalbard (78.23°N), Kiruna (67.86°N), and Matera (40.65°N) each operate one X-band dish with a 5° terrain mask and a 120-second mechanical slew between targets.',
    windowLabel: '00:00–24:00 UTC · 3 ANTENNAS · 2 SPACECRAFT',
  },
  {
    index: 1,
    code: '02',
    short: '61 passes, 63 conflicts',
    title: 'Sixty-one passes collide sixty-three times.',
    body: 'Sentinel-2A and Sentinel-2B share the same sun-synchronous orbital plane. As they sweep south over northern Europe, Svalbard and Kiruna see the same spacecraft simultaneously.',
    windowLabel: '40 SAME_SATELLITE · 23 SAME_ANTENNA CONFLICTS',
  },
  {
    index: 2,
    code: '03',
    short: 'The binary ceiling',
    title: 'Whole-pass scheduling drops overlapping windows.',
    body: 'Under Greedy or whole-pass MILP, picking pass p012 over Kiruna (18.2 GB) forces the scheduler to discard p011 over Svalbard (21.6 GB), p014 over Matera, and p015 for Sentinel-2A.',
    windowLabel: 'GREEDY 691.4 GB · MILP 695.8 GB (+0.6%)',
  },
  {
    index: 3,
    code: '04',
    short: 'The 15-second wall',
    title: 'Break 24 hours into 5,760 fifteen-second slices.',
    body: 'Q Slice replaces the whole pass with a 15-second decision cell. Each dish takes only the highest-elevation slices of a pass instead of staying locked onto a low-rate 5° tail.',
    windowLabel: '5,760 CELLS/DAY/SPACECRAFT · STEPPED 140–560 MBPS',
  },
  {
    index: 4,
    code: '05',
    short: 'The handover baton',
    title: 'qs009 → qs010 → qs012: three dishes share one pass.',
    body: 'At 08:01:00 UTC, Svalbard releases Sentinel-2B after 17.8 GB. Fifteen seconds later Kiruna takes the baton (8.9 GB), then hands to Matera (6.3 GB)—while Svalbard finishes its 120 s slew to catch Sentinel-2A.',
    windowLabel: '07:52:45–08:12:30 UTC · 33.0 GB RELAY (+81% IN CLUSTER)',
  },
  {
    index: 5,
    code: '06',
    short: '999.2 GB, 0 violations',
    title: '307.8 GB rescued on the exact same hardware.',
    body: 'Across all 56 sliced contacts, Q Slice raises daily downlink from 691.4 GB to 999.2 GB (+44.5%) with every 120-second slew, 5° mask, and 300 GB buffer limit verified at zero violations.',
    windowLabel: '999.2 GB DELIVERED · 1,400.8 GB OVERFLOW · 0 VIOLATIONS',
  },
] as const;

export default function FallbackStoryboard({
  data,
  frame,
  mode,
  reasonLabel,
}: FallbackStoryboardProps) {
  const assignments = data?.schedules[mode].assignments ?? [];
  const startMs = data ? Date.parse(data.scenario.start_utc) : Date.parse('2026-11-09T00:00:00Z');
  const durMs = 24 * 3600 * 1000;

  const antColor = (id: string) => {
    if (id === 'svalbard-1') return '#F0A43C';
    if (id === 'kiruna-1') return '#5BD6E6';
    return '#45D6A0';
  };

  const activeMeta = LEDGER_FRAMES[frame] ?? LEDGER_FRAMES[0];

  return (
    <div
      className="relative w-full h-full min-h-[360px] lg:min-h-0 flex flex-col justify-between p-4 sm:p-6"
      style={{ background: '#070B10' }}
      aria-label={`Contact Ledger schematic view — Frame ${activeMeta.code}: ${activeMeta.short}`}
    >
      {/* Top schematic telemetry header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3" style={{ borderBottom: '1px solid var(--rule-void)' }}>
        <div className="lp-micro" style={{ color: 'var(--ink-void-2)' }}>
          CONTACT LEDGER SCHEMATIC · FRAME {activeMeta.code}/06 · MODE: {mode.toUpperCase()}
        </div>
        <div className="lp-micro" style={{ color: 'var(--ink-void-3)' }}>
          {reasonLabel ?? 'REAL SGP4 EPHEMERIS · 1.35× ALTITUDE SCALE'}
        </div>
      </div>

      {/* Center SVG Plate */}
      <div className="flex-1 flex items-center justify-center my-3">
        <svg
          viewBox="0 0 820 420"
          className="w-full h-auto max-h-[460px] block"
          role="img"
          aria-label={activeMeta.title}
        >
          {/* Subtle coordinate grid */}
          {[100, 200, 300, 400, 500, 600, 700].map((x) => (
            <line
              key={x}
              x1={x}
              y1={0}
              x2={x}
              y2={420}
              stroke="rgba(233,237,242,0.04)"
            />
          ))}

          {/* Top 24-Hour Contact Ledger Wall (2 rows: S2A, S2B) */}
          <g transform="translate(36, 22)">
            <text
              x="0"
              y="10"
              fontFamily="IBM Plex Mono, monospace"
              fontSize="11"
              fill="#B2BECB"
            >
              24-HOUR CONTACT LEDGER WALL ({assignments.length} SCHEDULED WINDOWS · {mode.toUpperCase()})
            </text>

            {/* S2A Track */}
            <text x="0" y="35" fontFamily="IBM Plex Mono, monospace" fontSize="11" fill="#8391A1">
              S2A
            </text>
            <rect
              x="36"
              y="22"
              width="712"
              height="18"
              fill="#0C1218"
              stroke="rgba(233,237,242,0.16)"
            />

            {/* S2B Track */}
            <text x="0" y="61" fontFamily="IBM Plex Mono, monospace" fontSize="11" fill="#8391A1">
              S2B
            </text>
            <rect
              x="36"
              y="48"
              width="712"
              height="18"
              fill="#0C1218"
              stroke="rgba(233,237,242,0.16)"
            />

            {/* Real scheduled assignments plotted across 24h */}
            {assignments.map((a) => {
              const x1 = 36 + ((Date.parse(a.start_utc) - startMs) / durMs) * 712;
              const x2 = 36 + ((Date.parse(a.end_utc) - startMs) / durMs) * 712;
              const y = a.satellite_id === 'sentinel-2a' ? 23 : 49;
              const isFocus =
                frame === 4 &&
                ['qs009', 'qs010', 'qs011', 'qs012', 'p012', 'p013'].includes(a.pass_id);
              return (
                <rect
                  key={a.pass_id}
                  x={x1}
                  y={y}
                  width={Math.max(2.5, x2 - x1)}
                  height={16}
                  fill={antColor(a.antenna_id)}
                  fillOpacity={frame >= 3 ? (isFocus ? 1 : 0.85) : 0.35}
                  className="lp-ledger-rect"
                />
              );
            })}

            {/* Highlight box around 07:52–08:16 UTC handover cluster */}
            <rect
              x={36 + ((Date.parse('2026-11-09T07:52:00Z') - startMs) / durMs) * 712}
              y="18"
              width="24"
              height="52"
              fill="none"
              stroke={frame === 4 ? '#F0A43C' : 'rgba(233,237,242,0.28)'}
              strokeWidth={frame === 4 ? 1.5 : 1}
              className="lp-ledger-rect"
            />
            <text
              x={36 + ((Date.parse('2026-11-09T07:52:00Z') - startMs) / durMs) * 712 + 28}
              y="84"
              fontFamily="IBM Plex Mono, monospace"
              fontSize="10.5"
              fill={frame === 4 ? '#F0A43C' : '#8391A1'}
            >
              07:52–08:16 UTC HANDOVER CLUSTER
            </text>
          </g>

          {/* Curved Earth Limb at Bottom */}
          <path
            d="M -60 365 A 980 980 0 0 1 880 365 L 880 430 L -60 430 Z"
            fill="#0A1117"
          />
          <path
            d="M -60 365 A 980 980 0 0 1 880 365"
            fill="none"
            stroke="#5BD6E6"
            strokeWidth="1.6"
            strokeOpacity="0.72"
          />

          {/* Orbital Arc above Limb */}
          <path
            d="M 40 236 Q 410 132 780 230"
            fill="none"
            stroke="rgba(233,237,242,0.34)"
            strokeWidth="1.2"
          />

          {/* Frame-specific link & handover geometry */}
          {/* Svalbard Dish (left) */}
          <g transform="translate(188, 316)">
            <circle cx="0" cy="0" r="5" fill="#F0A43C" />
            <circle cx="0" cy="0" r="12" fill="none" stroke="#F0A43C" strokeOpacity="0.4" />
            <text x="0" y="29" textAnchor="middle" fontFamily="IBM Plex Sans, sans-serif" fontSize="12" fontWeight="600" fill="#EEF2F6">
              Svalbard
            </text>
            <text x="0" y="44" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="10.5" fill="#B2BECB">
              78.23°N 15.41°E
            </text>
          </g>

          {/* Kiruna Dish (center) */}
          <g transform="translate(410, 294)">
            <circle cx="0" cy="0" r="5" fill="#5BD6E6" />
            <circle cx="0" cy="0" r="12" fill="none" stroke="#5BD6E6" strokeOpacity="0.4" />
            <text x="0" y="29" textAnchor="middle" fontFamily="IBM Plex Sans, sans-serif" fontSize="12" fontWeight="600" fill="#EEF2F6">
              Kiruna
            </text>
            <text x="0" y="44" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="10.5" fill="#B2BECB">
              67.86°N 20.96°E
            </text>
          </g>

          {/* Matera Dish (right) */}
          <g transform="translate(632, 316)">
            <circle cx="0" cy="0" r="5" fill="#45D6A0" />
            <circle cx="0" cy="0" r="12" fill="none" stroke="#45D6A0" strokeOpacity="0.4" />
            <text x="0" y="29" textAnchor="middle" fontFamily="IBM Plex Sans, sans-serif" fontSize="12" fontWeight="600" fill="#EEF2F6">
              Matera
            </text>
            <text x="0" y="44" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="10.5" fill="#B2BECB">
              40.65°N 16.70°E
            </text>
          </g>

          {/* Conflict beams in Frames 1 & 2 */}
          {(frame === 1 || frame === 2) && (
            <g>
              <line x1="250" y1="194" x2="188" y2="316" stroke="#FF6464" strokeWidth="1.4" strokeDasharray="4 3" />
              <line x1="395" y1="184" x2="410" y2="294" stroke="#5BD6E6" strokeWidth="1.8" />
              <line x1="560" y1="192" x2="632" y2="316" stroke="#FF6464" strokeWidth="1.2" strokeDasharray="4 3" />
              <rect x="245" y="189" width="10" height="10" fill="#05070A" stroke="#FF6464" strokeWidth="1.5" />
              <rect x="390" y="179" width="10" height="10" fill="#5BD6E6" />
              <text x="190" y="178" fontFamily="IBM Plex Mono, monospace" fontSize="10.5" fill="#FF7A7A">
                P011 DROPPED (-21.6 GB)
              </text>
              <text x="350" y="166" fontFamily="IBM Plex Mono, monospace" fontSize="10.5" fill="#5BD6E6">
                P012 KEPT (18.2 GB)
              </text>
              <text x="524" y="178" fontFamily="IBM Plex Mono, monospace" fontSize="10.5" fill="#FF7A7A">
                P014 DROPPED (-6.8 GB)
              </text>
            </g>
          )}

          {/* Handover baton chain in Frames 0, 3, 4, 5 */}
          {(frame === 0 || frame >= 3) && (
            <g>
              <line
                x1="215"
                y1="200"
                x2="188"
                y2="316"
                stroke="#F0A43C"
                strokeWidth={frame === 4 ? 2.2 : 1.5}
                className={frame === 4 ? 'lp-relay-flow' : 'lp-ledger-rect'}
              />
              <line
                x1="410"
                y1="184"
                x2="410"
                y2="294"
                stroke="#5BD6E6"
                strokeWidth={frame === 4 ? 2.2 : 1.5}
                className={frame === 4 ? 'lp-relay-flow' : 'lp-ledger-rect'}
              />
              <line
                x1="605"
                y1="200"
                x2="632"
                y2="316"
                stroke="#45D6A0"
                strokeWidth={frame === 4 ? 2.2 : 1.5}
                className={frame === 4 ? 'lp-relay-flow' : 'lp-ledger-rect'}
              />

              <rect x="210" y="195" width="10" height="10" fill="#F0A43C" />
              <rect x="405" y="179" width="10" height="10" fill="#5BD6E6" />
              <rect x="600" y="195" width="10" height="10" fill="#45D6A0" />

              <text x="215" y="180" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="11" fill="#F0A43C">
                QS009 · 17.8 GB
              </text>
              <text x="410" y="164" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="11" fill="#5BD6E6">
                QS010 · 8.9 GB
              </text>
              <text x="605" y="180" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="11" fill="#45D6A0">
                QS012 · 6.3 GB
              </text>

              {frame >= 4 && (
                <>
                  <text x="312" y="188" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="10.5" fill="#EEF2F6">
                    15s GUARD →
                  </text>
                  <text x="508" y="188" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="10.5" fill="#EEF2F6">
                    15s GUARD →
                  </text>
                </>
              )}
            </g>
          )}
        </svg>
      </div>

      {/* Bottom schematic footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-3" style={{ borderTop: '1px solid var(--rule-void)' }}>
        <span className="lp-micro" style={{ color: 'var(--amber)' }}>
          {activeMeta.windowLabel}
        </span>
        <span className="lp-micro" style={{ color: 'var(--ink-void-3)' }}>
          SVALBARD (AMBER) · KIRUNA (CYAN) · MATERA (GREEN)
        </span>
      </div>
    </div>
  );
}
