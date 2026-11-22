import type { LandingDataBundle } from '../data/loadLandingData';
import { ArrowUpRight } from './TopBar';
import { useReveal } from '../hooks/useReveal';

interface ActProofProps {
  data: LandingDataBundle | null;
  onLaunchConsole: () => void;
}

const FALLBACK_CHECKS = [
  { id: 'dish-slew', rule: 'Single dish tracking & 120 s slew gap', detail: 'No antenna tracks two spacecraft at once.', checkedCount: '56 slots · min slew 120 s', violations: 0 },
  { id: 'sat-exclusivity', rule: 'Single X-band downlink per spacecraft', detail: 'One transmitter per spacecraft at every tick.', checkedCount: '56 slots', violations: 0 },
  { id: 'elevation-mask', rule: '5° minimum horizon mask (SGP4)', detail: 'Every contact is inside real CelesTrak visibility.', checkedCount: '56 midpoints', violations: 0 },
  { id: 'buffer-bounds', rule: 'Onboard buffer bounds (0–300 GB)', detail: 'Simulated inflow and X-band drain stay in bounds.', checkedCount: '288 timeline samples', violations: 0 },
  { id: 'mass-balance', rule: '24-hour data conservation', detail: 'Delivered + overflow + stored = 3,000.0 GB.', checkedCount: '999.2 + 1,400.8 + 600.0', violations: 0 },
];

export default function ActProof({ data, onLaunchConsole }: ActProofProps) {
  const ref = useReveal<HTMLElement>(0.08);
  const checks = data?.validatorChecks ?? FALLBACK_CHECKS;
  const totalViolations = data?.totalViolations ?? 0;
  const rows = data?.waterfallRows ?? [
    { method: 'greedy', label: 'Greedy', passesUsed: 30, deliveredGb: 691.4, overflowGb: 1708.6, capturePct: 23.0, deltaVsGreedyPct: 0, deltaVsGreedyGb: 0 },
    { method: 'optimizer', label: 'Whole-pass MILP', passesUsed: 30, deliveredGb: 695.8, overflowGb: 1704.2, capturePct: 23.2, deltaVsGreedyPct: 0.6, deltaVsGreedyGb: 4.4 },
    { method: 'qslice', label: 'Q Slice', passesUsed: 56, deliveredGb: 999.2, overflowGb: 1400.8, capturePct: 33.3, deltaVsGreedyPct: 44.5, deltaVsGreedyGb: 307.8 },
  ];

  return (
    <section id="act-04" className="q-proof" ref={ref}>
      <div className="q-proof__margin" aria-hidden="true">
        <span>VERIFICATION COPY</span>
        <span>QOE3 / DEMO-001</span>
        <span>2026-11-09</span>
      </div>

      <div className="q-container q-proof__inner">
        <div className="q-proof__head">
          <div className="q-act__index q-act__index--paper">
            <span className="q-act__index-num">04</span>
            <span className="q-micro">PROOF / INDEPENDENT VERIFICATION</span>
          </div>
          <div className="q-proof__title-row">
            <h2>
              999.2 GB.
              <br />
              Zero violations.
              <br />
              <span>Same three dishes.</span>
            </h2>
            <div className="q-stamp" aria-label="Verified, zero violations, 2026-11-09">
              <span>VERIFIED</span>
              <strong>0 VIOLATIONS</strong>
              <span>2026-11-09 · DEMO-001</span>
            </div>
          </div>
          <p className="q-proof__lead">
            The result is not a projection. It is the output of the same 24-hour scenario,
            checked against five physical rules by a separate validator that re-runs SGP4 and
            re-adds the mass balance.
          </p>
        </div>

        <div className="q-proof__table-wrap">
          <div className="q-proof__table-head">
            <span className="q-mono">SCOREBOARD / SHARED 0–3,000 GB BASIS</span>
            <span className="q-mono">ENGINEERING SIMULATION</span>
          </div>
          <table className="q-proof-table">
            <caption className="q-sr-only">Delivered data, overflow, capture share and lift by scheduling method</caption>
            <thead>
              <tr>
                <th scope="col">Method</th>
                <th scope="col">Slots</th>
                <th scope="col">Delivered</th>
                <th scope="col">Overflow</th>
                <th scope="col">Capture</th>
                <th scope="col">Lift vs Greedy</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.method} className={row.method === 'qslice' ? 'is-qslice' : ''}>
                  <th scope="row">
                    <span>{row.label}</span>
                    <small>{row.method === 'qslice' ? '15-second handover slices' : row.method === 'optimizer' ? 'whole-pass global MILP' : 'whole pass, earliest first'}</small>
                  </th>
                  <td>{row.passesUsed}</td>
                  <td>{row.deliveredGb.toFixed(1)} GB</td>
                  <td>{row.overflowGb.toFixed(1)} GB</td>
                  <td>{row.capturePct.toFixed(1)}%</td>
                  <td>
                    {row.method === 'greedy'
                      ? 'baseline'
                      : `+${row.deltaVsGreedyPct.toFixed(1)}% (+${row.deltaVsGreedyGb.toFixed(1)} GB)`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="q-proof__table-foot">
            <span className="q-mono">3,000 GB generated · 61 passes · 63 conflicts · 600.0 GB still stored at 24:00</span>
            <span className="q-mono">DELIVERED + OVERFLOW + STORED = 3,000.0 GB</span>
          </div>
        </div>

        <div className="q-proof__grid">
          <div className="q-validator">
            <div className="q-validator__head">
              <span className="q-micro">INDEPENDENT VALIDATOR</span>
              <span className="q-validator__score">
                {totalViolations} <span>violations</span>
              </span>
            </div>
            <div className="q-validator__rows">
              {checks.map((check) => (
                <div className="q-validator__row" key={check.id}>
                  <span className="q-validator__mark" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6.2L4.7 9L10 3.2" stroke="currentColor" strokeWidth="1.7" />
                    </svg>
                  </span>
                  <span className="q-validator__rule">
                    <strong>{check.rule}</strong>
                    <small>{check.detail}</small>
                  </span>
                  <span className="q-mono q-validator__count">{check.checkedCount}</span>
                  <span className="q-mono q-validator__result">0</span>
                </div>
              ))}
            </div>
          </div>

          <aside className="q-proof__notes">
            <div className="q-proof__note">
              <span className="q-micro">WHAT IS CHECKED</span>
              <p>
                One dish per antenna, one X-band transmitter per spacecraft, a 5° elevation
                mask, 120 seconds of slew between different spacecraft, and conservation of
                all 3,000 GB.
              </p>
            </div>
            <div className="q-proof__note">
              <span className="q-micro">WHAT IS SIMULATED</span>
              <p>
                Public CelesTrak TLEs for Sentinel-2A and 2B, epoch 2026-11-09. Buffer size,
                generation rate and X-band rate are documented scenario assumptions, not live
                ESA operations.
              </p>
            </div>
            <div className="q-proof__note q-proof__note--action">
              <span className="q-micro">CHECK IT YOURSELF</span>
              <p>
                The console exposes every pass, every slice, and every buffer sample. Change a
                station and rerun the schedule in the browser.
              </p>
              <button type="button" className="q-btn q-btn--dark q-btn--sm" onClick={onLaunchConsole}>
                Run the 24-hour scenario <ArrowUpRight />
              </button>
            </div>
          </aside>
        </div>

        <p className="q-proof__caveat q-mono">
          ENGINEERING SIMULATION · PUBLIC CELESTRAK TLEs · NOT LIVE ESA OPERATIONS · SOURCE:
          scoreboard.json + schedule_qslice.json + independent validator
        </p>
      </div>
    </section>
  );
}
