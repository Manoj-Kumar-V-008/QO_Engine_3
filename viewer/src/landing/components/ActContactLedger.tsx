import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { LandingDataBundle } from '../data/loadLandingData';
import type { ScheduleMethod } from '../../types/engine';
import { scrollStore } from '../data/scrollStore';
import FallbackStoryboard, { LEDGER_FRAMES } from '../explainer/FallbackStoryboard';

const LazyContactLedger3D = lazy(() => import('../explainer/ContactLedger3D'));

interface ActContactLedgerProps {
  data: LandingDataBundle | null;
}

const MODE_LABELS: { id: ScheduleMethod; label: string }[] = [
  { id: 'greedy', label: 'Greedy' },
  { id: 'optimizer', label: 'MILP' },
  { id: 'qslice', label: 'Q Slice' },
];

export default function ActContactLedger({ data }: ActContactLedgerProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);

  const [activeFrame, setActiveFrame] = useState<number>(0);
  const [mode, setMode] = useState<ScheduleMethod>('qslice');
  const [nearViewport, setNearViewport] = useState<boolean>(false);
  const [webglFailed, setWebglFailed] = useState<boolean>(false);
  const [prefer2D, setPrefer2D] = useState<boolean>(false);
  const [canUse3D, setCanUse3D] = useState<boolean>(false);

  // Register Act III pinned track with single rAF scroll store
  useEffect(() => {
    scrollStore.registerAct3Track(trackRef.current);
    const unsubFrame = scrollStore.subscribeFrame(setActiveFrame);
    const unsubProgress = scrollStore.subscribeProgress((p) => {
      if (playheadRef.current) {
        playheadRef.current.style.transform = `translate3d(${(p * 100).toFixed(2)}%, 0, 0)`;
      }
    });
    return () => {
      unsubFrame();
      unsubProgress();
      scrollStore.registerAct3Track(null);
    };
  }, []);

  // Determine 3D eligibility (desktop >= 768px, no reduced motion, no saveData)
  useEffect(() => {
    const check = () => {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const conn = (navigator as unknown as { connection?: { saveData?: boolean } }).connection;
      const saveData = Boolean(conn?.saveData);
      const desktop = window.innerWidth >= 768;
      setCanUse3D(desktop && !reduced && !saveData);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Lazy-mount 3D canvas when within 400px of viewport
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setNearViewport(true);
          io.disconnect();
        }
      },
      { rootMargin: '400px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Keyboard navigation when focused inside Act III
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.key === 'g' || e.key === 'G') setMode('greedy');
      else if (e.key === 'm' || e.key === 'M') setMode('optimizer');
      else if (e.key === 'q' || e.key === 'Q') setMode('qslice');
      else if (e.key === 'r' || e.key === 'R' || e.key === 'Escape') {
        window.dispatchEvent(new CustomEvent('qoe3-ledger-reset'));
      } else if (e.key === 'ArrowRight') {
        const cur = scrollStore.getSnapshot().act3Frame;
        if (cur < 5) scrollStore.setManualFrame(cur + 1);
      } else if (e.key === 'ArrowLeft') {
        const cur = scrollStore.getSnapshot().act3Frame;
        if (cur > 0) scrollStore.setManualFrame(cur - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleWebGLFail = useCallback(() => setWebglFailed(true), []);

  const frameMeta = LEDGER_FRAMES[activeFrame] ?? LEDGER_FRAMES[0];
  const activeSummary = data?.waterfallRows.find((r) => r.method === mode);
  const activeAssignments = data?.schedules[mode].assignments ?? [];
  const show3D = Boolean(data && canUse3D && nearViewport && !webglFailed && !prefer2D);

  return (
    <section id="act-03" aria-label="Act 03: The 15-second decision — Contact Ledger">
      {/* Pinned 340vh desktop track (non-pinned on mobile & reduced motion via CSS) */}
      <div ref={trackRef} className="lp-act3-track">
        <div className="lp-act3-sticky">
          {/* Top thin Act III header strip */}
          <div
            className="px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3"
            style={{
              background: 'var(--plate)',
              borderBottom: '1px solid var(--rule-void)',
            }}
          >
            <div className="flex items-center gap-3">
              <span className="lp-mono text-[13px] font-semibold" style={{ color: 'var(--amber)' }}>
                03
              </span>
              <span className="lp-micro" style={{ color: 'var(--ink-void)' }}>
                THE 15-SECOND DECISION · THE CONTACT LEDGER
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Segmented mode switch (GREEDY | MILP | Q SLICE) */}
              <div className="lp-segmented" role="radiogroup" aria-label="Scheduler comparison mode">
                {MODE_LABELS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={mode === m.id}
                    onClick={() => setMode(m.id)}
                    className="lp-segmented-btn"
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {canUse3D && !webglFailed && (
                <button
                  type="button"
                  onClick={() => setPrefer2D((v) => !v)}
                  className="lp-btn-tactile hidden sm:inline-flex"
                >
                  {prefer2D ? '3D View' : '2D Schematic'}
                </button>
              )}
            </div>
          </div>

          {/* 8/4 Split Stage */}
          <div className="lp-act3-stage">
            {/* Left 8 cols: Contact Ledger 3D or Schematic Storyboard */}
            <div className="relative min-h-[360px] lg:min-h-0" style={{ borderRight: '1px solid var(--rule-void)' }}>
              {show3D && data ? (
                <Suspense
                  fallback={
                    <FallbackStoryboard
                      data={data}
                      frame={activeFrame}
                      mode={mode}
                      reasonLabel="LOADING 3D CONTACT LEDGER..."
                    />
                  }
                >
                  <LazyContactLedger3D
                    data={data}
                    mode={mode}
                    onWebGLFailed={handleWebGLFail}
                  />
                </Suspense>
              ) : (
                <FallbackStoryboard
                  data={data}
                  frame={activeFrame}
                  mode={mode}
                  reasonLabel={
                    webglFailed
                      ? 'SCHEMATIC FALLBACK · WEBGL UNAVAILABLE'
                      : !canUse3D
                      ? 'STORYBOARD VIEW · STATIC INSTRUMENT'
                      : '2D SCHEMATIC MODE'
                  }
                />
              )}
            </div>

            {/* Right 4 cols: Frame narration + Live numeric telemetry */}
            <div
              className="flex flex-col justify-between p-5 sm:p-6 overflow-y-auto"
              style={{ background: 'var(--plate)' }}
            >
              <div>
                <div className="flex items-center justify-between pb-3 mb-4" style={{ borderBottom: '1px solid var(--rule-void)' }}>
                  <span className="lp-mono text-[13px] font-semibold" style={{ color: 'var(--amber)' }}>
                    FRAME {frameMeta.code} / 06
                  </span>
                  <span className="lp-micro" style={{ color: 'var(--ink-void-2)' }}>
                    {frameMeta.short}
                  </span>
                </div>

                <h3 className="lp-h3" style={{ color: 'var(--ink-void)' }}>
                  {frameMeta.title}
                </h3>

                <p className="mt-4 text-[15.5px] leading-[1.65]" style={{ color: 'var(--ink-void-2)' }}>
                  {frameMeta.body}
                </p>

                {/* Exact live metrics for selected scheduler */}
                <dl
                  className="mt-6 grid grid-cols-2 gap-px m-0"
                  style={{
                    background: 'var(--rule-void)',
                    border: '1px solid var(--rule-void)',
                  }}
                >
                  <div className="p-3.5" style={{ background: 'var(--void)' }}>
                    <dt className="text-[12.5px] font-medium m-0" style={{ color: 'var(--ink-void-2)' }}>
                      Delivered
                    </dt>
                    <dd
                      className="lp-mono m-0 mt-1 text-[20px] font-semibold"
                      style={{ color: mode === 'qslice' ? 'var(--green)' : 'var(--ink-void)' }}
                    >
                      {(activeSummary?.deliveredGb ?? 999.2).toFixed(1)} GB
                    </dd>
                  </div>
                  <div className="p-3.5" style={{ background: 'var(--void)' }}>
                    <dt className="text-[12.5px] font-medium m-0" style={{ color: 'var(--ink-void-2)' }}>
                      Overflow
                    </dt>
                    <dd
                      className="lp-mono m-0 mt-1 text-[20px] font-semibold"
                      style={{ color: 'var(--red)' }}
                    >
                      {(activeSummary?.overflowGb ?? 1400.8).toFixed(1)} GB
                    </dd>
                  </div>
                  <div className="p-3.5" style={{ background: 'var(--void)' }}>
                    <dt className="text-[12.5px] font-medium m-0" style={{ color: 'var(--ink-void-2)' }}>
                      Contacts
                    </dt>
                    <dd className="lp-mono m-0 mt-1 text-[17px] font-semibold" style={{ color: 'var(--ink-void)' }}>
                      {activeSummary?.passesUsed ?? 56}{' '}
                      <span className="text-[12.5px]" style={{ color: 'var(--ink-void-3)' }}>
                        {mode === 'qslice' ? 'slices' : 'passes'}
                      </span>
                    </dd>
                  </div>
                  <div className="p-3.5" style={{ background: 'var(--void)' }}>
                    <dt className="text-[12.5px] font-medium m-0" style={{ color: 'var(--ink-void-2)' }}>
                      vs. Greedy
                    </dt>
                    <dd
                      className="lp-mono m-0 mt-1 text-[17px] font-semibold"
                      style={{
                        color:
                          mode === 'qslice'
                            ? 'var(--green)'
                            : mode === 'optimizer'
                            ? 'var(--amber)'
                            : 'var(--ink-void-2)',
                      }}
                    >
                      {mode === 'greedy'
                        ? 'Baseline'
                        : `+${(activeSummary?.deltaVsGreedyPct ?? 44.5).toFixed(1)}%`}
                    </dd>
                  </div>
                </dl>

                {/* Handover chain micro-ledger on Frame 05 */}
                {activeFrame === 4 && data && (
                  <div className="mt-4 p-3.5" style={{ background: 'var(--void)', border: '1px solid var(--rule-void)' }}>
                    <div className="lp-micro mb-2.5" style={{ color: 'var(--amber)' }}>
                      CANONICAL RELAY · SENTINEL-2B (33.0 GB)
                    </div>
                    <div className="lp-mono text-[12.5px] space-y-1.5">
                      {data.handoverChain
                        .filter((a) => ['qs009', 'qs010', 'qs012', 'qs011'].includes(a.pass_id))
                        .map((a) => (
                          <div key={a.pass_id} className="flex items-center justify-between gap-2">
                            <span style={{ color: 'var(--ink-void)' }}>
                              {a.pass_id.toUpperCase()} · {a.satellite_id === 'sentinel-2b' ? 'S2B' : 'S2A'} ·{' '}
                              {a.antenna_id.replace('-1', '').toUpperCase()}
                            </span>
                            <span style={{ color: 'var(--ink-void-2)' }}>
                              {a.start_utc.slice(11, 16)}–{a.end_utc.slice(11, 16)} · {a.planned_gb.toFixed(1)} GB
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Clickable 6-frame index + keyboard hints */}
              <div className="mt-6 pt-4" style={{ borderTop: '1px solid var(--rule-void)' }}>
                <div className="grid grid-cols-6 gap-1.5">
                  {LEDGER_FRAMES.map((f) => {
                    const active = f.index === activeFrame;
                    return (
                      <button
                        key={f.code}
                        type="button"
                        onClick={() => scrollStore.setManualFrame(f.index)}
                        data-active={active ? 'true' : 'false'}
                        data-accent="amber"
                        className="lp-btn-tactile lp-mono !px-0 !min-h-[38px] text-[13px]"
                        title={`${f.code}: ${f.short}`}
                      >
                        {f.code}
                      </button>
                    );
                  })}
                </div>
                <div className="lp-mono text-[12px] mt-3 flex justify-between" style={{ color: 'var(--ink-void-3)' }}>
                  <span>←/→ Frame · G/M/Q Mode</span>
                  <span>R Reset view</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom 15-second ruler with 6 frame ticks & direct-DOM playhead */}
          <div
            className="relative h-10 px-4 sm:px-6 flex items-center justify-between"
            style={{ background: 'var(--void)' }}
            aria-hidden="true"
          >
            <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: 'var(--rule-void)' }}>
              <div
                ref={playheadRef}
                className="h-full w-full origin-left"
                style={{
                  background: 'var(--amber)',
                  transform: 'translate3d(0%, 0, 0)',
                  width: '12px',
                }}
              />
            </div>
            {LEDGER_FRAMES.map((f) => (
              <button
                key={f.code}
                type="button"
                onClick={() => scrollStore.setManualFrame(f.index)}
                className="lp-micro bg-transparent border-0 cursor-pointer flex items-center gap-1.5"
                style={{
                  color: f.index === activeFrame ? 'var(--amber)' : 'var(--ink-void-3)',
                }}
              >
                <span>{f.code}</span>
                <span className="hidden md:inline">{f.short}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Accessible Complete Assignment Table directly underneath Act III */}
      <div
        className="py-7"
        style={{
          background: 'var(--void)',
          borderBottom: '1px solid var(--rule-void)',
        }}
      >
        <div className="lp-container">
          <details>
            <summary
              className="lp-micro cursor-pointer select-none flex items-center justify-between py-2"
              style={{ color: 'var(--ink-void-2)' }}
            >
              <span>
                FULL SCHEDULE GROUND TRUTH · {activeAssignments.length}{' '}
                {mode === 'qslice' ? 'Q SLICE ASSIGNMENTS' : `${mode.toUpperCase()} PASSES`} (ACCESSIBLE HTML TABLE)
              </span>
              <span style={{ color: 'var(--amber)' }}>EXPAND TABLE +</span>
            </summary>

            <div className="lp-table-wrap mt-4 max-h-[360px] overflow-y-auto lp-plate">
              <table className="lp-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Satellite</th>
                    <th>Ground Station</th>
                    <th>Start (UTC)</th>
                    <th>End (UTC)</th>
                    <th data-align="right">Duration</th>
                    <th data-align="right">Delivered (GB)</th>
                  </tr>
                </thead>
                <tbody>
                  {activeAssignments.map((a) => {
                    const durS = Math.round(
                      (Date.parse(a.end_utc) - Date.parse(a.start_utc)) / 1000
                    );
                    return (
                      <tr key={a.pass_id}>
                        <td style={{ color: 'var(--amber)' }}>{a.pass_id.toUpperCase()}</td>
                        <td>{a.satellite_id.toUpperCase()}</td>
                        <td>{a.antenna_id.replace('-1', '').toUpperCase()}</td>
                        <td>{a.start_utc.slice(11, 19)}Z</td>
                        <td>{a.end_utc.slice(11, 19)}Z</td>
                        <td data-align="right">{durS} s</td>
                        <td data-align="right" style={{ color: 'var(--green)' }}>
                          {a.planned_gb.toFixed(1)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}
