const NOTES = [
  {
    q: 'What is Q Slice?',
    a: 'Q Slice is a 15-second time-sliced handover scheduler. Instead of locking a ground station onto an entire satellite pass from 5° rise to 5° set, it divides the 24-hour horizon into 5,760 slices per spacecraft and hands links between dishes across 15-second guards while respecting each dish’s 120-second slew requirement.',
  },
  {
    q: 'Why did global MILP only gain +0.6% over Greedy?',
    a: 'Both Greedy (691.4 GB) and whole-pass MILP (695.8 GB) choose from the same binary pass blocks. Across 61 passes and 63 conflicts, the whole-pass formulation leaves almost no room for improvement: taking Svalbard’s p011 blocks Kiruna’s p012 and Svalbard’s next Sentinel-2A pass. Changing the decision unit from a whole pass to a 15-second slice unlocks +307.8 GB (+44.5%).',
  },
  {
    q: 'Are these real Sentinel-2 orbits?',
    a: 'Yes. Pass windows, azimuth/elevation curves and 3D positions are propagated with SGP4 from public CelesTrak Two-Line Element sets for Sentinel-2A (NORAD 40697) and Sentinel-2B (NORAD 42063) over 24 hours starting 2026-11-09T00:00:00Z.',
  },
  {
    q: 'Where do the remaining 600.0 GB go?',
    a: 'Both Sentinel-2A and Sentinel-2B carry a 300 GB onboard solid-state buffer. At 24:00 UTC both buffers are full: 300.0 GB × 2 = 600.0 GB stored for the next day’s passes. Delivered imagery + buffer overflow + 600.0 GB stored always sums to exactly 3,000.0 GB generated.',
  },
  {
    q: 'Does slicing break the 120-second antenna slew time?',
    a: 'No. Every time a dish switches from one satellite to another — for example, Svalbard releasing Sentinel-2B on qs009 at 08:01:00 UTC and acquiring Sentinel-2A on qs011 at 08:03:00 UTC — the scheduler enforces the full 120-second mechanical setup gap. The independent browser validator verifies 0 violations across all 56 contacts.',
  },
  {
    q: 'Can I test my own ground station?',
    a: 'Yes. Click the Act 05 ground-track map to place a dish anywhere on Earth, or open the What-If tab inside the 3D mission console. The browser runs real SGP4 pass finding and re-solves the schedule locally.',
  },
  {
    q: 'Is this connected to live ESA operations?',
    a: 'No. QOE3 is an open, deterministic scheduling benchmark and 3D mission console. Orbital mechanics use public CelesTrak TLEs, while onboard generation (62.5 GB/h), the 300 GB buffer limit and the stepped X-band rate table (140–560 Mbps) are transparent simulation assumptions.',
  },
];

export default function MissionNotes() {
  return (
    <section id="mission-notes" className="q-notes" aria-labelledby="mission-notes-heading">
      <div className="q-container">
        <div className="q-notes__head">
          <div>
            <span className="q-micro">REF / MISSION NOTES</span>
            <h2 id="mission-notes-heading" className="q-h2">
              Technical notes.
            </h2>
          </div>
          <span className="q-micro">THE QUESTIONS THE NUMBERS INVITE</span>
        </div>

        <dl className="q-notes__grid">
          {NOTES.map((note, index) => (
            <div className="q-notes__item" key={note.q}>
              <span className="q-notes__num" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div>
                <dt>{note.q}</dt>
                <dd>{note.a}</dd>
              </div>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
