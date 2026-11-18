const NOTES = [
  {
    q: 'What is Q Slice?',
    a: 'Q Slice is a 15-second time-sliced dynamic handover scheduler. Instead of locking a ground station onto an entire satellite pass from 5° rise to 5° set, it divides the 24-hour horizon into 5,760 slices per spacecraft and hands links cleanly between dishes across 15-second guards while respecting each dish’s 120-second slew requirement.',
  },
  {
    q: 'Why did global MILP only gain +0.6% over Greedy?',
    a: 'Both Greedy (691.4 GB) and whole-pass MILP (695.8 GB) choose from the same binary pass blocks. Across 61 passes and 63 conflicts, the whole-pass formulation leaves almost no room for improvement because taking Svalbard’s p011 blocks Kiruna’s p012 and Svalbard’s next Sentinel-2A pass. Changing the decision unit from whole pass to 15-second slice unlocks +307.8 GB (+44.5%).',
  },
  {
    q: 'Are these real Sentinel-2 orbits?',
    a: 'Yes. Pass windows, azimuth/elevation curves, and 3D positions are propagated with SGP4 from real CelesTrak Two-Line Element sets for Sentinel-2A (NORAD 40697) and Sentinel-2B (NORAD 42063) over 24 hours starting 2026-11-09T00:00:00Z.',
  },
  {
    q: 'Where do the remaining 600.0 GB go?',
    a: 'Both Sentinel-2A and Sentinel-2B carry a 300 GB onboard solid-state buffer. At 24:00 UTC, both buffers are full (300.0 GB × 2 = 600.0 GB stored for the next day’s passes). Delivered imagery + buffer overflow + 600.0 GB stored always sums to exactly 3,000.0 GB generated.',
  },
  {
    q: 'Does slicing break the 120-second antenna slew time?',
    a: 'No. Every time a ground dish switches from one satellite to another (for example, Svalbard releasing Sentinel-2B on qs009 at 08:01:00 UTC and acquiring Sentinel-2A on qs011 at 08:03:00 UTC), the scheduler enforces the full 120-second mechanical setup gap. Our independent browser validator verifies 0 violations across all 56 slots.',
  },
  {
    q: 'Can I test my own ground station coordinates?',
    a: 'Yes. Click any coordinate on the Act 05 map above—or open the What-If tab inside the 3D Mission Console—to place a custom dish anywhere on Earth. The browser runs real SGP4 pass finding and re-solves Greedy, MILP, and Q Slice locally.',
  },
  {
    q: 'Is this connected to live ESA Copernicus operations?',
    a: 'No. QOE3 is an open, deterministic scheduling benchmark and 3D mission console. Orbital mechanics use real CelesTrak TLEs, while onboard generation (62.5 GB/h), 300 GB buffer limits, and the stepped X-band rate table (140–560 Mbps) are transparent simulation assumptions.',
  },
];

export default function MissionNotes() {
  return (
    <section
      id="mission-notes"
      className="lp-act"
      aria-labelledby="mission-notes-heading"
    >
      <div className="lp-container">
        <div className="mb-10">
          <div className="lp-act-tag">
            <span className="lp-act-num">REF</span>
            <span>MISSION NOTES · TECHNICAL QUESTIONS</span>
          </div>
          <h2 id="mission-notes-heading" className="lp-h2" style={{ color: 'var(--ink-void)' }}>
            Technical notes.
          </h2>
        </div>

        <dl className="m-0">
          {NOTES.map((item) => (
            <div key={item.q} className="lp-notes-row">
              <dt
                className="lp-h3 m-0 text-[19px] sm:text-[21px]"
                style={{ color: 'var(--ink-void)' }}
              >
                {item.q}
              </dt>
              <dd
                className="lp-body m-0"
              >
                {item.a}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
