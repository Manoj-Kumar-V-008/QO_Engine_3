import { useEffect, useState } from 'react';
import { scrollStore, type ActId } from '../data/scrollStore';
import { ArrowRightIcon, PrimaryLaunchButton } from './LandingButton';

interface TopBarProps {
  onLaunchConsole: () => void;
}

const SECTIONS: { id: ActId; title: string }[] = [
  { id: '00', title: 'Overview' },
  { id: '01', title: 'The wasted pass' },
  { id: '02', title: 'The binary ceiling' },
  { id: '03', title: 'The 15-second decision' },
  { id: '04', title: 'Proof on paper' },
  { id: '05', title: 'What-If station lab' },
];

export function OrbitalMark({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M1 13.5 A11.5 11.5 0 0 1 15 13.5"
        stroke="#5BD6E6"
        strokeWidth="1.25"
      />
      <line x1="4" y1="9.5" x2="12.5" y2="3.5" stroke="#E9EDF2" strokeWidth="1.2" />
      <rect x="11.2" y="2.2" width="2.6" height="2.6" fill="#F0A43C" />
      <rect x="3.1" y="8.8" width="1.8" height="1.8" fill="#45D6A0" />
    </svg>
  );
}

export default function TopBar({ onLaunchConsole }: TopBarProps) {
  const [activeAct, setActiveAct] = useState<ActId>('00');
  const [utcNow, setUtcNow] = useState<string>(() =>
    new Date().toISOString().slice(11, 19)
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const unsub = scrollStore.subscribeAct(setActiveAct);
    return unsub;
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setUtcNow(new Date().toISOString().slice(11, 19));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  return (
    <>
      <header className="lp-topbar">
        <div className="lp-container lp-topbar-inner">
          <a href="#act-00" className="lp-brand">
            <OrbitalMark size={16} />
            <span>QOE3</span>
          </a>

          <nav className="lp-nav-index" aria-label="Mission document index">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#act-${s.id}`}
                data-active={activeAct === s.id ? 'true' : 'false'}
                className="lp-nav-item"
                title={`${s.id} — ${s.title}`}
              >
                <span>{s.id}</span>
                <span className="sr-only"> {s.title}</span>
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3.5">
            <span
              className="lp-mono lp-clock-sm text-[13px] tracking-[0.03em]"
              style={{ color: 'var(--ink-void-2)' }}
              aria-label="Current UTC time"
            >
              {utcNow} UTC
            </span>

            <button
              type="button"
              onClick={onLaunchConsole}
              className="lp-nav-console"
            >
              <span className="lp-nav-dot" aria-hidden="true" />
              <span>Open Console</span>
              <ArrowRightIcon />
            </button>

            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-expanded={drawerOpen}
              aria-controls="lp-mobile-drawer"
              className="lp-nav-console lp-mobile-trigger"
            >
              Index
            </button>
          </div>
        </div>
      </header>

      {drawerOpen && (
        <>
          <div
            className="lp-drawer-backdrop"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside
            id="lp-mobile-drawer"
            className="lp-drawer-paper"
            role="dialog"
            aria-modal="true"
            aria-label="Document index"
          >
            <div>
              <div
                className="flex items-center justify-between pb-4"
                style={{ borderBottom: '1px solid var(--ink-paper)' }}
              >
                <span className="lp-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
                  QOE3 · Mission Index
                </span>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="lp-mono text-[11px] font-semibold uppercase px-2.5 py-1.5 cursor-pointer"
                  style={{
                    border: '1px solid var(--ink-paper)',
                    background: 'transparent',
                    color: 'var(--ink-paper)',
                  }}
                >
                  Close [ESC]
                </button>
              </div>

              <nav className="mt-4 flex flex-col" aria-label="Mobile sections">
                {SECTIONS.map((s, idx) => (
                  <a
                    key={s.id}
                    href={`#act-${s.id}`}
                    onClick={() => setDrawerOpen(false)}
                    className="lp-drawer-link"
                    style={{ animationDelay: `${idx * 30}ms` }}
                  >
                    <span>{s.title}</span>
                    <span
                      className="lp-mono text-[12px]"
                      style={{ color: 'var(--amber-paper)' }}
                    >
                      {s.id}
                    </span>
                  </a>
                ))}
              </nav>
            </div>

            <div className="pt-6" style={{ borderTop: '1px solid var(--rule-paper)' }}>
              <div
                className="lp-mono text-[13px] mb-4"
                style={{ color: 'var(--ink-paper-2)' }}
              >
                DEMO-001 · 2026-11-09 00:00 UTC · {utcNow} UTC
              </div>
              <PrimaryLaunchButton
                fullWidth
                onClick={() => {
                  setDrawerOpen(false);
                  onLaunchConsole();
                }}
              >
                Run the 24-hour scenario
              </PrimaryLaunchButton>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
