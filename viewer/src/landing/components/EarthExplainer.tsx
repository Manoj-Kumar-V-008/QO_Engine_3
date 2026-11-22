/**
 * EarthExplainer — a beginner-friendly section explaining what QOE3 does
 * in plain English, with animated cards and a simple visual metaphor.
 */
import { useEffect, useRef } from 'react';

function useRevealCards(rootMargin = '0px') {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cards = el.querySelectorAll<HTMLElement>('.q-explain-card');
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const card = entry.target as HTMLElement;
            const delay = card.dataset.delay ?? '0';
            setTimeout(() => card.classList.add('is-revealed'), parseInt(delay, 10));
            io.unobserve(card);
          }
        }
      },
      { rootMargin, threshold: 0.15 }
    );
    for (const card of cards) io.observe(card);
    return () => io.disconnect();
  }, [rootMargin]);
  return ref;
}

const EXPLAIN_STEPS = [
  {
    emoji: '🛰️',
    eyebrow: 'The satellites',
    title: 'Two cameras circling Earth at 7.5 km/s',
    body: 'Sentinel-2A and 2B fly 786 km above Earth, photographing forests, oceans, and cities in 13 colour bands — non-stop, 24 hours a day.',
    accent: '#5bd6e6',
    delay: 0,
  },
  {
    emoji: '📡',
    eyebrow: 'The problem',
    title: 'Only 10 minutes to send your photos home',
    body: 'Each satellite can only talk to a ground dish when it flies overhead — a window that lasts just 8–12 minutes per orbit. Miss it, and that imagery is overwritten.',
    accent: '#f0a43c',
    delay: 90,
  },
  {
    emoji: '⚠️',
    eyebrow: 'The old way',
    title: 'One satellite hogs the dish, the other loses data',
    body: 'Old scheduling gives one satellite the entire contact window. If both are overhead at the same time, the second one is simply ignored — and its data is lost.',
    accent: '#ff6464',
    delay: 180,
  },
  {
    emoji: '⚡',
    eyebrow: 'The QOE3 fix',
    title: '15-second slices — the dish rapidly switches between both',
    body: 'QOE3 chops every contact window into 15-second slices. The dish serves whichever satellite needs it most right now — dozens of handoffs per pass, zero data lost.',
    accent: '#45d6a0',
    delay: 270,
  },
];

export default function EarthExplainer() {
  const ref = useRevealCards('-40px');

  return (
    <section className="q-explain" aria-labelledby="q-explain-heading">
      <div className="q-container" ref={ref}>
        <div className="q-explain__header">
          <span className="q-micro q-explain__kicker">NEW TO THIS? START HERE</span>
          <h2 className="q-h2" id="q-explain-heading">
            What is Quantum Orbit Engine 3?
          </h2>
          <p className="q-lead q-explain__lead">
            Imagine two delivery trucks that can only unload at the same loading dock — and the dock is only open for 10 minutes a day. QOE3 makes them share every 15 seconds instead of fighting.
          </p>
        </div>

        <div className="q-explain__grid">
          {EXPLAIN_STEPS.map((step, i) => (
            <div
              key={i}
              className="q-explain-card"
              data-delay={step.delay}
              style={{ '--card-accent': step.accent } as React.CSSProperties}
            >
              <div className="q-explain-card__emoji" aria-hidden="true">
                {step.emoji}
              </div>
              <div className="q-explain-card__inner">
                <span className="q-micro q-explain-card__eyebrow">{step.eyebrow}</span>
                <h3 className="q-explain-card__title">{step.title}</h3>
                <p className="q-explain-card__body">{step.body}</p>
              </div>
              <div className="q-explain-card__glow" aria-hidden="true" />
            </div>
          ))}
        </div>

        {/* Simple visual metaphor: timeline bar showing 15-second slices */}
        <div className="q-explain__demo" aria-label="Visual demonstration: 15-second time-slicing">
          <div className="q-explain__demo-label">
            <span className="q-micro">LIVE DEMONSTRATION — 10-MINUTE CONTACT WINDOW</span>
          </div>
          <div className="q-explain__demo-tracks">
            <div className="q-explain__demo-row">
              <span className="q-explain__demo-sat" style={{ color: '#5bd6e6' }}>
                SENTINEL-2A
              </span>
              <div className="q-explain__demo-bar" data-mode="a">
                {Array.from({ length: 24 }, (_, i) => (
                  <div
                    key={i}
                    className={`q-explain__demo-slice ${i % 3 !== 0 ? 'is-active-a' : ''}`}
                    style={{ animationDelay: `${i * 0.08}s` }}
                  />
                ))}
              </div>
            </div>
            <div className="q-explain__demo-row">
              <span className="q-explain__demo-sat" style={{ color: '#f0a43c' }}>
                SENTINEL-2B
              </span>
              <div className="q-explain__demo-bar" data-mode="b">
                {Array.from({ length: 24 }, (_, i) => (
                  <div
                    key={i}
                    className={`q-explain__demo-slice ${i % 3 === 0 ? 'is-active-b' : ''}`}
                    style={{ animationDelay: `${i * 0.08}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="q-explain__demo-footer">
            <span className="q-mono" style={{ color: '#45d6a0' }}>↑ Each coloured block = 15 seconds of contact</span>
            <span className="q-mono" style={{ color: '#7f8d99' }}>Both satellites served. Zero data lost.</span>
          </div>
        </div>
      </div>
    </section>
  );
}
