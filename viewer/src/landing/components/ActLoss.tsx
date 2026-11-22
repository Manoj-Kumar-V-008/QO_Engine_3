import { useCountUp, useReveal } from '../hooks/useReveal';
import type { LandingDataBundle } from '../data/loadLandingData';

interface ActLossProps {
  data: LandingDataBundle | null;
}

const FALLBACK_ROWS = [
  {
    label: 'Greedy',
    sublabel: 'Earliest pass, whole block',
    passes: 30,
    delivered: 691.4,
    overflow: 1708.6,
    stored: 600,
    capture: 23.0,
    tone: 'baseline',
  },
  {
    label: 'Whole-pass MILP',
    sublabel: 'Global optimum, whole blocks',
    passes: 30,
    delivered: 695.8,
    overflow: 1704.2,
    stored: 600,
    capture: 23.2,
    tone: 'baseline',
  },
  {
    label: 'Q Slice',
    sublabel: '15-second independent slices',
    passes: 56,
    delivered: 999.2,
    overflow: 1400.8,
    stored: 600,
    capture: 33.3,
    tone: 'highlight',
  },
];

export default function ActLoss({ data }: ActLossProps) {
  const sectionRef = useReveal<HTMLElement>(0.08);
  const bigNumber = useCountUp(1708.6, 1);

  const rows =
    data?.waterfallRows?.map((row) => ({
      label: row.label,
      sublabel: row.unitLabel,
      passes: row.passesUsed,
      delivered: row.deliveredGb,
      overflow: row.overflowGb,
      stored: row.storedGb,
      capture: row.capturePct,
      tone: row.method === 'qslice' ? 'highlight' : 'baseline',
    })) ?? FALLBACK_ROWS;

  const total = 3000;
  const qslice = rows.find((row) => row.label === 'Q Slice') ?? rows[2];
  const baseline = rows[0];

  return (
    <section id="act-01" className="q-act q-act--loss" ref={sectionRef}>
      <div className="q-container">
        <div className="q-act__intro">
          <div className="q-act__index">
            <span className="q-act__index-num">01</span>
            <span className="q-micro">MASS BALANCE / 24 H</span>
          </div>

          <div className="q-act__headline">
            <h2 className="q-h2">
              Data that misses
              <br />
              its window is gone.
            </h2>
          </div>

          <div className="q-act__body">
            <p>
              Each Sentinel-2 spacecraft records <strong>62.5 GB of imagery every hour</strong>.
              It can only send that imagery home during the 8–12 minutes it spends above a
              ground station. When the onboard <strong>300 GB buffer</strong> fills, the oldest
              scenes are overwritten.
            </p>
            <p>
              Over one 24-hour scenario, whole-pass scheduling delivers{' '}
              <strong>{baseline.delivered.toFixed(1)} GB</strong> and loses{' '}
              <strong>{baseline.overflow.toFixed(1)} GB</strong> to overflow. Another{' '}
              <strong>600.0 GB</strong> is still stuck in the buffers at midnight.
            </p>
          </div>
        </div>

        <div className="q-loss-figure q-reveal">
          <div className="q-figure-head">
            <div>
              <span className="q-micro">FIGURE 01 / 24-HOUR MASS BALANCE</span>
              <p className="q-figure-sub">
                Every scheduler starts with the same 3,000 GB and ends with 600 GB stored
                onboard. The difference is what reaches the ground.
              </p>
            </div>
            <div className="q-figure-legend" aria-hidden="true">
              <span><i className="q-swatch q-swatch--delivered" /> Delivered</span>
              <span><i className="q-swatch q-swatch--lost" /> Overflow</span>
              <span><i className="q-swatch q-swatch--stored" /> Stored 24:00</span>
            </div>
          </div>

          <div className="q-axis">
            {[0, 600, 1200, 1800, 2400, 3000].map((tick) => (
              <span key={tick} className="q-axis__tick">
                {tick === 0 || tick === 3000 ? tick.toLocaleString('en-US') : tick.toLocaleString('en-US')}
              </span>
            ))}
          </div>

          <div className="q-waterfall">
            {rows.map((row, index) => {
              const deliveredPct = (row.delivered / total) * 100;
              const overflowPct = (row.overflow / total) * 100;
              const storedPct = (row.stored / total) * 100;
              return (
                <div
                  className={`q-waterfall__row${row.tone === 'highlight' ? ' is-highlight' : ''}`}
                  key={row.label}
                  style={{ ['--row-delay' as string]: `${index * 90}ms` }}
                >
                  <div className="q-waterfall__meta">
                    <span className="q-waterfall__name">{row.label}</span>
                    <span className="q-mono q-waterfall__sub">
                      {row.passes} {row.label === 'Q Slice' ? 'contacts' : 'passes'} · {row.capture.toFixed(1)}% capture
                    </span>
                  </div>
                  <div
                    className="q-waterfall__bar"
                    role="img"
                    aria-label={`${row.label}: ${row.delivered.toFixed(1)} GB delivered, ${row.overflow.toFixed(1)} GB overflow, ${row.stored.toFixed(1)} GB stored at 24:00`}
                  >
                    <span
                      className="q-waterfall__seg q-waterfall__seg--delivered"
                      style={{ width: `${deliveredPct}%` }}
                    >
                      <span className="q-waterfall__value">{row.delivered.toFixed(1)} GB</span>
                    </span>
                    <span
                      className="q-waterfall__seg q-waterfall__seg--lost"
                      style={{ width: `${overflowPct}%` }}
                    >
                      <span className="q-waterfall__lost-value">{row.overflow.toFixed(1)} GB lost</span>
                    </span>
                    <span
                      className="q-waterfall__seg q-waterfall__seg--stored"
                      style={{ width: `${storedPct}%` }}
                    >
                      <span className="q-waterfall__stored-value">600.0 GB</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="q-waterfall__foot">
            <div className="q-waterfall__rescue">
              <span className="q-mono">NET RESCUED DATA</span>
              <span className="q-waterfall__bracket" aria-hidden="true" />
              <span className="q-waterfall__rescue-value">
                +{(qslice.delivered - baseline.delivered).toFixed(1)} GB
              </span>
              <span className="q-mono q-waterfall__rescue-note">
                +{(((qslice.delivered - baseline.delivered) / baseline.delivered) * 100).toFixed(1)}%
                vs greedy · same dishes · same 24 hours
              </span>
            </div>

            <div className="q-loss-callout">
              <span className="q-loss-callout__value" ref={bigNumber.ref}>
                {bigNumber.display}
              </span>
              <span className="q-loss-callout__unit">GB</span>
              <span className="q-loss-callout__label">
                boiled off while the schedule waited for a whole pass
              </span>
            </div>
          </div>

          <details className="q-disclosure">
            <summary>Read the exact 24-hour accounting table</summary>
            <div className="q-disclosure__body">
              <table>
                <caption className="q-sr-only">Delivered, overflow and stored data by scheduling method</caption>
                <thead>
                  <tr>
                    <th scope="col">Method</th>
                    <th scope="col">Slots</th>
                    <th scope="col">Delivered</th>
                    <th scope="col">Overflow</th>
                    <th scope="col">Stored 24:00</th>
                    <th scope="col">Capture</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row">{row.label}</th>
                      <td>{row.passes}</td>
                      <td>{row.delivered.toFixed(1)} GB</td>
                      <td>{row.overflow.toFixed(1)} GB</td>
                      <td>{row.stored.toFixed(1)} GB</td>
                      <td>{row.capture.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <p className="q-source">
            SOURCE: scoreboard.json · schedule_greedy.json · schedule_optimizer.json · schedule_qslice.json
          </p>
        </div>

        <aside className="q-act__margin" aria-label="Key numbers">
          <div>
            <span className="q-mono">BUFFER / SPACECRAFT</span>
            <strong>300 GB</strong>
          </div>
          <div>
            <span className="q-mono">INFLOW</span>
            <strong>62.5 GB/h</strong>
          </div>
          <div>
            <span className="q-mono">CAPTURE</span>
            <strong>23.0%</strong>
          </div>
        </aside>
      </div>
    </section>
  );
}
