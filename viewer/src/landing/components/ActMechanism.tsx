import { useEffect, useRef, useState } from 'react';
import type { LandingDataBundle } from '../data/loadLandingData';
import type { ScheduleMethod } from '../../types/engine';
import MissionCanvas from '../scene/MissionCanvas';
import LedgerFallback from '../explainer/LedgerFallback';
import { useReveal } from '../hooks/useReveal';
import { ArrowUpRight } from './TopBar';

interface ActMechanismProps {
  data: LandingDataBundle | null;
  onLaunchConsole: () => void;
}

const STEP_ANCHORS = [0.06, 0.27, 0.49, 0.71, 0.92];

const STEPS = [
  {
    tag: 'FRAME 01 / 05',
    kicker: 'THE NETWORK',
    title: 'Three dishes, 38° of latitude.',
    body:
      'Svalbard, Kiruna and Matera each operate one steerable X-band dish. Every pass has to clear a 5° terrain mask, and every retarget costs the dish 120 seconds of setup.',
    short: 'Three dishes',
  },
  {
    tag: 'FRAME 02 / 05',
    kicker: 'THE LOCK',
    title: 'Whole passes leave gaps.',
    body:
      'A whole-pass scheduler books one station for an entire 8–12 minute arc. When two arcs overlap, one is dropped and the buffer keeps filling. Greedy delivers 691.4 GB and loses 1,708.6 GB.',
    short: 'The lock',
  },
  {
    tag: 'FRAME 03 / 05',
    kicker: 'THE SLICE',
    title: 'The day is 5,760 slices.',
    body:
      'QOE3 treats each 15-second cell independently. A 638-second pass is 43 cells, not one block. The scheduler can keep the useful cells, drop the idle tail, and never reserve a dish for time it cannot use.',
    short: '15 s slices',
  },
  {
    tag: 'FRAME 04 / 05',
    kicker: 'THE BATON',
    title: 'The carrier moves. The pass does not.',
    body:
      'At 08:01:00 the Svalbard contact ends. Fifteen seconds later Kiruna is already tracking. At 08:06:30 the same spacecraft hands off to Matera. The link stays alive across three countries.',
    short: 'The baton',
  },
  {
    tag: 'FRAME 05 / 05',
    kicker: 'THE RESULT',
    title: '999.2 GB. Zero violations.',
    body:
      'Same spacecraft, same three dishes, same 24 hours. The schedule now delivers 307.8 GB more and captures 33.3% of generated imagery. Five independent checks confirm the physics still holds.',
    short: 'The result',
  },
];

function stepForProgress(progress: number): number {
  if (progress < 0.17) return 0;
  if (progress < 0.38) return 1;
  if (progress < 0.6) return 2;
  if (progress < 0.83) return 3;
  return 4;
}

function clockForProgress(progress: number): { time: string; station: string; color: string } {
  const start = Date.parse('2026-11-09T07:50:00Z');
  const end = Date.parse('2026-11-09T08:14:00Z');
  const ms = start + progress * (end - start);
  const time = new Date(ms).toISOString().slice(11, 19);
  if (ms < Date.parse('2026-11-09T07:52:45Z')) return { time, station: 'ACQUIRING', color: '#b2becb' };
  if (ms < Date.parse('2026-11-09T08:01:00Z')) return { time, station: 'SVALBARD', color: '#f0a43c' };
  if (ms < Date.parse('2026-11-09T08:01:15Z')) return { time, station: '15 S GUARD', color: '#ffb36a' };
  if (ms < Date.parse('2026-11-09T08:06:15Z')) return { time, station: 'KIRUNA', color: '#5bd6e6' };
  if (ms < Date.parse('2026-11-09T08:06:30Z')) return { time, station: '15 S GUARD', color: '#ffb36a' };
  if (ms < Date.parse('2026-11-09T08:12:30Z')) return { time, station: 'MATERA', color: '#45d6a0' };
  return { time, station: 'VERIFIED', color: '#45d6a0' };
}

export default function ActMechanism({ data, onLaunchConsole }: ActMechanismProps) {
  const sectionRef = useReveal<HTMLElement>(0.05);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const progressBarRef = useRef<HTMLSpanElement | null>(null);
  const clockRef = useRef<HTMLSpanElement | null>(null);
  const stationRef = useRef<HTMLSpanElement | null>(null);
  const progressRef = useRef(0);
  const stepRef = useRef(0);

  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<ScheduleMethod>('qslice');
  const [isDesktop, setIsDesktop] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      setIsDesktop(desktop.matches);
      setReducedMotion(reduced.matches);
    };
    sync();
    desktop.addEventListener('change', sync);
    reduced.addEventListener('change', sync);
    return () => {
      desktop.removeEventListener('change', sync);
      reduced.removeEventListener('change', sync);
    };
  }, []);

  const pinned = isDesktop && !reducedMotion;

  const updateReadout = (progress: number) => {
    const clock = clockForProgress(progress);
    if (clockRef.current) clockRef.current.textContent = clock.time;
    if (stationRef.current) {
      stationRef.current.textContent = clock.station;
      stationRef.current.style.color = clock.color;
    }
    if (progressBarRef.current) {
      progressBarRef.current.style.transform = `scaleX(${Math.max(0.02, progress)})`;
    }
  };

  useEffect(() => {
    if (!pinned) {
      const progress = STEP_ANCHORS[step];
      progressRef.current = progress;
      updateReadout(progress);
      return;
    }

    let raf = 0;
    const measure = () => {
      raf = 0;
      const track = trackRef.current;
      const stage = stageRef.current;
      if (!track || !stage) return;
      const topbar = 56;
      const trackTop = track.getBoundingClientRect().top;
      const scrollable = Math.max(1, track.offsetHeight - stage.offsetHeight);
      const progress = Math.max(0, Math.min(1, (topbar - trackTop) / scrollable));
      progressRef.current = progress;
      updateReadout(progress);
      const nextStep = stepForProgress(progress);
      if (nextStep !== stepRef.current) {
        stepRef.current = nextStep;
        setStep(nextStep);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [pinned, step]);

  const jumpToStep = (index: number) => {
    stepRef.current = index;
    setStep(index);
    if (!pinned) {
      progressRef.current = STEP_ANCHORS[index];
      updateReadout(STEP_ANCHORS[index]);
      return;
    }
    const track = trackRef.current;
    const stage = stageRef.current;
    if (!track || !stage) return;
    const top = window.scrollY + track.getBoundingClientRect().top - 56;
    const scrollable = Math.max(1, track.offsetHeight - stage.offsetHeight);
    window.scrollTo({ top: top + STEP_ANCHORS[index] * scrollable, behavior: 'smooth' });
  };

  const qslice = data?.waterfallRows.find((row) => row.method === 'qslice');
  const greedy = data?.waterfallRows.find((row) => row.method === 'greedy');
  const activeSummary = mode === 'qslice' ? qslice : greedy;
  const chain = data?.handoverChain.filter((a) => ['qs009', 'qs010', 'qs012'].includes(a.pass_id)) ?? [];
  const current = STEPS[step];

  const showFallback = webglFailed || reducedMotion || !data;

  return (
    <section id="act-03" className="q-act q-act--mechanism" ref={sectionRef}>
      <div className="q-container">
        <div className="q-act__index">
          <span className="q-act__index-num">03</span>
          <span className="q-micro">MECHANISM / 15-SECOND CONTACT LEDGER</span>
        </div>

        <div className="q-mech-intro">
          <h2 className="q-h2">
            The smallest decision
            <br />
            is 15 seconds.
          </h2>
          <div>
            <p className="q-lead">
              A pass is not one object. It is a curve of visibility, sampled 5,760 times per
              spacecraft per day. QOE3 schedules those slices independently, so the link can
              leave one dish and pick up at another before the buffer fills.
            </p>
            <p className="q-mech-intro__note q-mono">
              DRIVEN BY schedule_qslice.json · REAL SGP4 POSITIONS · EXACT AOS / LOS
            </p>
          </div>
        </div>
      </div>

      <div
        className={`q-act3__track${pinned ? ' is-pinned' : ''}`}
        ref={trackRef}
        style={pinned ? { height: '380svh' } : undefined}
      >
        <div className="q-act3__sticky-wrap">
          <div className={`q-act3__stage${pinned ? ' is-pinned' : ''}`} ref={stageRef}>
            <div className="q-act3__topline">
              <div className="q-act3__stage-label">
                <span className="q-mono">03 / CONTACT LEDGER</span>
                <span className="q-act3__live">
                  <i className="q-status-dot" /> LIVE MODEL
                </span>
              </div>

              <div className="q-act3__switch" role="group" aria-label="Scheduling comparison">
                <button
                  type="button"
                  className={mode === 'qslice' ? 'is-active' : ''}
                  onClick={() => setMode('qslice')}
                  aria-pressed={mode === 'qslice'}
                >
                  Q Slice
                </button>
                <button
                  type="button"
                  className={mode === 'greedy' ? 'is-active is-whole' : ''}
                  onClick={() => setMode('greedy')}
                  aria-pressed={mode === 'greedy'}
                >
                  Whole pass
                </button>
              </div>

              <div className="q-act3__readout-clock">
                <span className="q-mono q-act3__clock-label">SIM UTC</span>
                <span className="q-mono q-act3__clock" ref={clockRef}>
                  07:50:00
                </span>
                <span className="q-mono q-act3__station" ref={stationRef}>
                  ACQUIRING
                </span>
              </div>
            </div>

            <div className="q-act3__main">
              <div className="q-act3__canvas-wrap">
                {showFallback ? (
                  <LedgerFallback step={step} mode={mode === 'qslice' ? 'qslice' : 'greedy'} />
                ) : (
                  <MissionCanvas
                    data={data!}
                    variant="ledger"
                    mode={mode}
                    progressRef={progressRef}
                    onFail={() => setWebglFailed(true)}
                    ariaLabel="Interactive 3D contact ledger: Sentinel-2 spacecraft handing an X-band link between Svalbard, Kiruna and Matera, above a 24-hour schedule of 15-second contact slices"
                  />
                )}
                <div className="q-act3__canvas-legend">
                  <span><i className="q-swatch q-swatch--amber" /> Svalbard</span>
                  <span><i className="q-swatch q-swatch--cyan" /> Kiruna</span>
                  <span><i className="q-swatch q-swatch--green" /> Matera</span>
                  <span className="q-act3__canvas-note">
                    {mode === 'qslice' ? '15 s slices · 56 contacts' : 'whole passes · 30 contacts'}
                  </span>
                </div>
              </div>

              <div className="q-act3__readout">
                <div className="q-act3__readout-head">
                  <span className="q-mono">{current.tag}</span>
                  <span className="q-mono">{current.kicker}</span>
                </div>

                <h3>{current.title}</h3>
                <p>{current.body}</p>

                <div className="q-act3__data">
                  {step === 0 && (
                    <ul className="q-station-list">
                      {[
                        { name: 'Svalbard', color: '#f0a43c', coord: '78.23 N / 15.41 E', note: '5° mask · 120 s slew' },
                        { name: 'Kiruna', color: '#5bd6e6', coord: '67.86 N / 20.96 E', note: '5° mask · 120 s slew' },
                        { name: 'Matera', color: '#45d6a0', coord: '40.65 N / 16.70 E', note: '5° mask · 120 s slew' },
                      ].map((station) => (
                        <li key={station.name}>
                          <i style={{ background: station.color }} />
                          <span>
                            <strong>{station.name}</strong>
                            <em>{station.coord}</em>
                          </span>
                          <small className="q-mono">{station.note}</small>
                        </li>
                      ))}
                    </ul>
                  )}

                  {step === 1 && (
                    <div className="q-stat-grid">
                      <div><span className="q-mono">DELIVERED</span><strong>{(greedy?.deliveredGb ?? 691.4).toFixed(1)} GB</strong></div>
                      <div><span className="q-mono">OVERFLOW</span><strong className="is-red">{(greedy?.overflowGb ?? 1708.6).toFixed(1)} GB</strong></div>
                      <div><span className="q-mono">CONTACTS</span><strong>{greedy?.passesUsed ?? 30}</strong></div>
                      <div><span className="q-mono">CONFLICTS</span><strong>63</strong></div>
                    </div>
                  )}

                  {step === 2 && (
                    <div className="q-stat-grid">
                      <div><span className="q-mono">SLICES / DAY / SAT</span><strong>5,760</strong></div>
                      <div><span className="q-mono">P011 PASS</span><strong>43 cells</strong></div>
                      <div><span className="q-mono">Q SLICE CONTACTS</span><strong className="is-green">{qslice?.passesUsed ?? 56}</strong></div>
                      <div><span className="q-mono">WHOLE-PASS CONTACTS</span><strong>{greedy?.passesUsed ?? 30}</strong></div>
                    </div>
                  )}

                  {step === 3 && (
                    <div className="q-chain">
                      {chain.length > 0 ? chain.map((assignment) => (
                        <div className="q-chain__row" key={assignment.pass_id}>
                          <span className="q-mono q-chain__id">{assignment.pass_id.toUpperCase()}</span>
                          <span className="q-chain__station" style={{ color: assignment.antenna_id === 'svalbard-1' ? '#f0a43c' : assignment.antenna_id === 'kiruna-1' ? '#5bd6e6' : '#45d6a0' }}>
                            {assignment.antenna_id.replace('-1', '').replace(/^./, (c) => c.toUpperCase())}
                          </span>
                          <span className="q-mono q-chain__time">
                            {assignment.start_utc.slice(11, 19)} → {assignment.end_utc.slice(11, 19)}
                          </span>
                          <span className="q-mono q-chain__gb">{assignment.planned_gb.toFixed(1)} GB</span>
                        </div>
                      )) : (
                        <>
                          <div className="q-chain__row"><span className="q-mono q-chain__id">QS009</span><span className="q-chain__station" style={{ color: '#f0a43c' }}>Svalbard</span><span className="q-mono q-chain__time">07:52:45 → 08:01:00</span><span className="q-mono q-chain__gb">17.8 GB</span></div>
                          <div className="q-chain__row"><span className="q-mono q-chain__id">QS010</span><span className="q-chain__station" style={{ color: '#5bd6e6' }}>Kiruna</span><span className="q-mono q-chain__time">08:01:15 → 08:06:15</span><span className="q-mono q-chain__gb">8.9 GB</span></div>
                          <div className="q-chain__row"><span className="q-mono q-chain__id">QS012</span><span className="q-chain__station" style={{ color: '#45d6a0' }}>Matera</span><span className="q-mono q-chain__time">08:06:30 → 08:12:30</span><span className="q-mono q-chain__gb">6.3 GB</span></div>
                        </>
                      )}
                      <div className="q-chain__foot q-mono">
                        <span>15 s guard at each handover</span>
                        <span>120 s slew, concurrent qs011 on Svalbard</span>
                      </div>
                    </div>
                  )}

                  {step === 4 && (
                    <>
                      <div className="q-result-figure">
                        <span className="q-result-figure__value">
                          {(activeSummary?.deliveredGb ?? 999.2).toFixed(1)}
                        </span>
                        <span className="q-result-figure__unit">GB</span>
                        <span className="q-result-figure__delta">
                          +{(((activeSummary?.deliveredGb ?? 999.2) - 691.4) / 691.4 * 100).toFixed(1)}% vs greedy
                        </span>
                      </div>
                      <div className="q-stat-grid">
                        <div><span className="q-mono">CAPTURE</span><strong>{(activeSummary?.capturePct ?? 33.3).toFixed(1)}%</strong></div>
                        <div><span className="q-mono">OVERFLOW</span><strong>{(activeSummary?.overflowGb ?? 1400.8).toFixed(1)} GB</strong></div>
                        <div><span className="q-mono">VIOLATIONS</span><strong className="is-green">0</strong></div>
                        <div><span className="q-mono">HANDOVER GAPS</span><strong>15 s</strong></div>
                      </div>
                      <div className="q-act3__cta">
                        <a className="q-btn q-btn--light q-btn--sm" href="#act-04">
                          Read the verification <ArrowUpRight />
                        </a>
                        <button type="button" className="q-link q-link--light" onClick={onLaunchConsole}>
                          Open the console <ArrowUpRight />
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <div className="q-act3__hint q-mono">
                  {pinned ? 'SCROLL THROUGH THE FIVE FRAMES · CLICK A FRAME TO JUMP' : 'SELECT A FRAME BELOW'}
                </div>
              </div>
            </div>

            <div className="q-act3__rail">
              <div className="q-act3__rail-progress" aria-hidden="true">
                <span ref={progressBarRef} />
              </div>
              {STEPS.map((item, index) => (
                <button
                  key={item.short}
                  type="button"
                  className={`q-act3__rail-btn${step === index ? ' is-active' : ''}`}
                  onClick={() => jumpToStep(index)}
                  aria-current={step === index ? 'step' : undefined}
                >
                  <span className="q-mono">0{index + 1}</span>
                  <span>{item.short}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="q-container">
        <p className="q-source q-act3__source">
          SCENARIO demo-001 · 2026-11-09 · P011 / P012 CROSS-CHECKED AGAINST passes.json ·
          HANDOVER CHAIN qs009 → qs010 → qs012
        </p>
      </div>
    </section>
  );
}
