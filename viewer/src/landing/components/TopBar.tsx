import { useEffect, useState } from 'react';

const NAV = [
  { id: 'act-01', index: '01', label: 'The loss' },
  { id: 'act-02', index: '02', label: 'The ceiling' },
  { id: 'act-03', index: '03', label: 'The mechanism' },
  { id: 'act-04', index: '04', label: 'The proof' },
  { id: 'act-05', index: '05', label: 'Console' },
];

export function OrbitMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="4.2" stroke="currentColor" strokeWidth="1.4" />
      <ellipse
        cx="16"
        cy="16"
        rx="12.5"
        ry="5.2"
        transform="rotate(-28 16 16)"
        stroke="currentColor"
        strokeWidth="1.1"
        opacity="0.55"
      />
      <circle cx="26.6" cy="9.4" r="1.8" fill="#f0a43c" />
      <path d="M4 27.5h11" stroke="currentColor" strokeWidth="1.1" opacity="0.4" />
    </svg>
  );
}

export function ArrowUpRight({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 12L12 4M5.5 4H12V10.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function ArrowDown({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2.5V13M3.8 8.8L8 13M12.2 8.8L8 13" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function useUtcClock() {
  const [time, setTime] = useState(() => new Date().toISOString().slice(11, 19));
  useEffect(() => {
    const id = window.setInterval(() => {
      setTime(new Date().toISOString().slice(11, 19));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);
  return time;
}

function useActiveSection() {
  const [active, setActive] = useState('act-00');
  useEffect(() => {
    const onScroll = () => {
      const probe = window.innerHeight * 0.35;
      let current = 'act-00';
      for (const item of NAV) {
        const el = document.getElementById(item.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= probe) current = item.id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return active;
}

interface TopBarProps {
  onLaunchConsole: () => void;
  surface?: 'void' | 'paper';
}

export default function TopBar({ onLaunchConsole, surface = 'void' }: TopBarProps) {
  const time = useUtcClock();
  const active = useActiveSection();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  return (
    <header className={`q-top q-top--${surface}`}>
      <div className="q-top__inner">
        <a className="q-brand" href="#act-00" aria-label="Quantum Orbit Engine 3, back to top">
          <span className="q-brand__mark">
            <OrbitMark />
          </span>
          <span className="q-brand__name">QOE3</span>
          <span className="q-brand__full">QUANTUM ORBIT ENGINE 3</span>
        </a>

        <nav className="q-nav" aria-label="Sections">
          {NAV.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={`q-nav__item${active === item.id ? ' is-active' : ''}`}
              aria-current={active === item.id ? 'true' : undefined}
            >
              <span className="q-nav__index">{item.index}</span>
              <span className="q-nav__label">{item.label}</span>
            </a>
          ))}
        </nav>

        <div className="q-top__tools">
          <span className="q-top__clock">
            <span className="q-top__clock-label">UTC</span>
            <span className="q-top__clock-value">{time}</span>
          </span>
          <button type="button" className="q-top__console" onClick={onLaunchConsole}>
            Open console <ArrowUpRight />
          </button>
          <button
            type="button"
            className="q-top__menu"
            aria-expanded={menuOpen}
            aria-controls="q-mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? 'Close' : 'Menu'}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="q-mobile-menu" id="q-mobile-menu">
          <div className="q-mobile-menu__head">
            <span className="q-mono">NAVIGATION / 00—05</span>
            <span className="q-mono">2026-11-09 · DEMO-001</span>
          </div>
          <nav aria-label="Mobile sections">
            {[{ id: 'act-00', index: '00', label: 'Overview' }, ...NAV].map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="q-mobile-menu__link"
                onClick={() => setMenuOpen(false)}
              >
                <span className="q-mobile-menu__index">{item.index}</span>
                <span>{item.label}</span>
                <ArrowUpRight size={18} />
              </a>
            ))}
          </nav>
          <div className="q-mobile-menu__foot">
            <button
              type="button"
              className="q-btn q-btn--dark"
              onClick={() => {
                setMenuOpen(false);
                onLaunchConsole();
              }}
            >
              Run the 24-hour scenario <ArrowUpRight />
            </button>
            <p className="q-mono">
              Public CelesTrak TLEs · SGP4 · engineering simulation, not live ESA operations.
            </p>
          </div>
        </div>
      )}
    </header>
  );
}
