import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  scrollStore,
  type ActId,
  type HeaderSurface,
} from '../data/scrollStore';
import { ArrowRightIcon, PrimaryLaunchButton } from './LandingButton';

interface TopBarProps {
  onLaunchConsole: () => void;
  onToggleCaseStudy?: () => void;
  showCaseStudy?: boolean;
}

const OVERVIEW_NAV: { id: string; shortLabel: string; title: string; href: string }[] = [
  { id: 'problem', shortLabel: 'Problem', title: 'Why satellite downlinks fail', href: '#problem' },
  { id: 'solution', shortLabel: '15s Engine', title: '15-second time-slicing concept', href: '#interactive-demo' },
  { id: 'benchmarks', shortLabel: 'Benchmark', title: 'Proven 24-hour benchmark', href: '#benchmarks' },
  { id: 'stations', shortLabel: 'Stations', title: 'Ground station infrastructure', href: '#stations' },
  { id: 'case-study', shortLabel: 'Case Study', title: 'Full academic case study & math', href: '#case-study' },
];

const DRAWER_ITEMS = [
  { id: 'overview', title: 'Mission Overview', href: '#overview' },
  { id: 'problem', title: '01 // The Problem', href: '#problem' },
  { id: 'solution', title: '02 // 15s Slicing Engine', href: '#interactive-demo' },
  { id: 'benchmarks', title: '03 // Benchmark Results', href: '#benchmarks' },
  { id: 'stations', title: '04 // Ground Network', href: '#stations' },
  { id: 'case-study', title: '05 // Academic Case Study', href: '#case-study' },
];

export function OrbitalMark({ size = 18 }: { size?: number }) {
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
        stroke="currentColor"
        strokeOpacity="0.48"
        strokeWidth="1.25"
      />
      <line
        x1="4"
        y1="9.5"
        x2="12.5"
        y2="3.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <rect x="11.2" y="2.2" width="2.6" height="2.6" fill="#F0A43C" />
      <rect x="3.1" y="8.8" width="1.8" height="1.8" fill="#45D6A0" />
    </svg>
  );
}

export default function TopBar({
  onLaunchConsole,
  onToggleCaseStudy,
  showCaseStudy,
}: TopBarProps) {
  const [activeAct, setActiveAct] = useState<string>('overview');
  const [scrolled, setScrolled] = useState<boolean>(false);
  const [surface, setSurface] = useState<HeaderSurface>('void');
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);

  const navRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const railRef = useRef<HTMLSpanElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const drawerRef = useRef<HTMLElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const triggerBtnRef = useRef<HTMLButtonElement>(null);
  const wasDrawerOpen = useRef<boolean>(false);

  // Subscribe to scroll store (discrete state changes + zero-render progress hairline)
  useEffect(() => {
    const unsubScrolled = scrollStore.subscribeScrolled(setScrolled);
    const unsubSurface = scrollStore.subscribeHeaderSurface(setSurface);
    const unsubProgress = scrollStore.subscribePageProgress((p) => {
      if (progressRef.current) {
        progressRef.current.style.transform = `scaleX(${p.toFixed(4)})`;
      }
    });
    return () => {
      unsubScrolled();
      unsubSurface();
      unsubProgress();
    };
  }, []);

  // Measure active nav link once on activeAct change or nav resize — GPU transform only
  useLayoutEffect(() => {
    const updateRail = () => {
      const rail = railRef.current;
      if (!rail) return;
      const activeEl = itemRefs.current[activeAct];
      if (!activeEl) {
        rail.style.opacity = '0';
        return;
      }
      const left = activeEl.offsetLeft;
      const width = activeEl.offsetWidth;
      rail.style.transform = `translate3d(${left}px, 0, 0) scaleX(${width})`;
      rail.style.opacity = '1';
    };

    updateRail();

    const navEl = navRef.current;
    if (!navEl || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(updateRail);
    ro.observe(navEl);
    return () => ro.disconnect();
  }, [activeAct]);

  // Mobile drawer inert handling, body scroll lock, Escape key & focus management
  useEffect(() => {
    const drawerEl = drawerRef.current as (HTMLElement & { inert: boolean }) | null;
    if (drawerEl) {
      drawerEl.inert = !drawerOpen;
    }

    if (drawerOpen) {
      wasDrawerOpen.current = true;
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      const focusTimer = window.setTimeout(() => {
        closeBtnRef.current?.focus();
      }, 40);

      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setDrawerOpen(false);
      };
      window.addEventListener('keydown', onKey);

      return () => {
        window.clearTimeout(focusTimer);
        document.body.style.overflow = prevOverflow;
        window.removeEventListener('keydown', onKey);
      };
    }

    if (wasDrawerOpen.current) {
      wasDrawerOpen.current = false;
      triggerBtnRef.current?.focus();
    }
  }, [drawerOpen]);

  return (
    <>
      <header
        className="lp-topbar"
        data-scrolled={scrolled ? 'true' : 'false'}
        data-surface={surface}
      >
        <div className="lp-container lp-topbar-inner">
          {/* Left slot (1fr, justify-self: start) */}
          <a href="#overview" className="lp-brand">
            <OrbitalMark size={18} />
            <span className="lp-brand-wordmark">QOE3</span>
            <span className="lp-brand-sep" aria-hidden="true" />
            <span className="lp-mono lp-brand-sub">S2 · 15s</span>
          </a>

          {/* Center slot (auto, optically dead-center on desktop) */}
          <nav
            ref={navRef}
            className="lp-nav-index"
            aria-label="Presentation index"
          >
            {OVERVIEW_NAV.map((item) => {
              const isActive = activeAct === item.id;
              return (
                <a
                  key={item.id}
                  ref={(el) => {
                    itemRefs.current[item.id] = el;
                  }}
                  href={item.href}
                  onClick={() => {
                    setActiveAct(item.id);
                    if (item.id === 'case-study' && !showCaseStudy && onToggleCaseStudy) {
                      onToggleCaseStudy();
                    }
                  }}
                  data-active={isActive ? 'true' : 'false'}
                  aria-current={isActive ? 'location' : undefined}
                  className="lp-nav-item"
                  title={item.title}
                >
                  <span className="lp-nav-label">{item.shortLabel}</span>
                </a>
              );
            })}
            <span
              ref={railRef}
              className="lp-nav-active-rail"
              aria-hidden="true"
              style={{ opacity: 0, transform: 'translate3d(0, 0, 0) scaleX(0)' }}
            />
          </nav>

          {/* Right slot (1fr, justify-self: end) */}
          <div className="lp-topbar-actions">
            <button
              type="button"
              onClick={onLaunchConsole}
              className="lp-nav-console"
            >
              <span className="lp-nav-console-full">Open Console</span>
              <span className="lp-nav-console-short">Console</span>
              <ArrowRightIcon className="lp-nav-arrow" />
            </button>

            <button
              ref={triggerBtnRef}
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

        {/* Full-bleed 1px document scroll progress hairline (direct DOM ref, zero React renders) */}
        <div
          ref={progressRef}
          className="lp-scroll-hairline"
          aria-hidden="true"
          style={{ transform: 'scaleX(0)' }}
        />
      </header>

      {/* Always-mounted Mobile Paper Drawer with smooth GPU open & close */}
      <div
        className="lp-drawer-backdrop"
        data-open={drawerOpen ? 'true' : 'false'}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />

      <aside
        ref={drawerRef}
        id="lp-mobile-drawer"
        className="lp-drawer-paper"
        data-open={drawerOpen ? 'true' : 'false'}
        role="dialog"
        aria-modal="true"
        aria-hidden={!drawerOpen}
        aria-label="Document index"
      >
        <div>
          <div
            className="flex items-center justify-between pb-4"
            style={{ borderBottom: '1px solid var(--ink-paper)' }}
          >
            <span className="lp-mono text-[11.5px] font-semibold tracking-[0.08em] uppercase">
              QOE3 · Mission Index
            </span>
            <button
              ref={closeBtnRef}
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="lp-drawer-close lp-mono text-[11.5px] font-semibold uppercase px-3 py-2 cursor-pointer"
            >
              Close [ESC]
            </button>
          </div>

          <nav className="mt-4 flex flex-col" aria-label="Mobile sections">
            {DRAWER_ITEMS.map((s, idx) => {
              const isActive = activeAct === s.id;
              return (
                <a
                  key={s.id}
                  href={s.href}
                  onClick={() => {
                    setDrawerOpen(false);
                    setActiveAct(s.id);
                    if (s.id === 'case-study' && !showCaseStudy && onToggleCaseStudy) {
                      onToggleCaseStudy();
                    }
                  }}
                  className="lp-drawer-link"
                  data-active={isActive ? 'true' : 'false'}
                  style={{
                    transitionDelay: drawerOpen
                      ? `${Math.min(idx * 30, 150)}ms`
                      : '0ms',
                  }}
                >
                  <span>{s.title}</span>
                </a>
              );
            })}
          </nav>
        </div>

        <div className="pt-6" style={{ borderTop: '1px solid var(--rule-paper)' }}>
          <div
            className="lp-mono text-[12.5px] mb-4"
            style={{ color: 'var(--ink-paper-2)' }}
          >
            DEMO-001 · EPOCH 2026-11-09 00:00 UTC
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
  );
}
