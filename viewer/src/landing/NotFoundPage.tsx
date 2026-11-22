import './styles/landing.css';
import { OrbitalMark } from './components/TopBar';
import {
  ArrowRightIcon,
  PrimaryLaunchButton,
  QuietActionLink,
} from './components/LandingButton';

interface NotFoundPageProps {
  onGoHome: () => void;
  onGoConsole: () => void;
}

export default function NotFoundPage({ onGoHome, onGoConsole }: NotFoundPageProps) {
  return (
    <div className="lp-root flex flex-col justify-between min-h-screen">
      <header className="lp-topbar">
        <div className="lp-container lp-topbar-inner">
          <button
            type="button"
            onClick={onGoHome}
            className="lp-brand bg-transparent border-0 p-0 cursor-pointer"
          >
            <OrbitalMark size={16} />
            <span>QOE3</span>
          </button>
          <button type="button" onClick={onGoConsole} className="lp-nav-console">
            <span className="lp-nav-dot" aria-hidden="true" />
            <span>Open Console</span>
            <ArrowRightIcon />
          </button>
        </div>
      </header>

      <main className="lp-container flex-1 flex flex-col justify-center py-28">
        <div className="lp-act-tag">
          <span className="lp-act-num">404</span>
          <span>LOSS OF SIGNAL · ROUTE NOT FOUND</span>
        </div>
        <h1 className="lp-display max-w-[16ch]" style={{ color: 'var(--ink-void)' }}>
          No pass scheduled at this coordinate.
        </h1>
        <p className="lp-lead mt-6 max-w-[52ch]">
          The requested path does not match an active QOE3 route. Return to the
          24-hour mission briefing or open the live 3D CesiumJS console directly.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-8">
          <PrimaryLaunchButton onClick={onGoConsole}>
            Launch 3D Console (/console)
          </PrimaryLaunchButton>
          <QuietActionLink onClick={onGoHome} direction="right">
            Open mission document (/)
          </QuietActionLink>
        </div>
      </main>

      <footer
        className="lp-mono text-[11px] py-5"
        style={{
          background: 'var(--plate)',
          borderTop: '1px solid var(--rule-void)',
          color: 'var(--ink-void-3)',
        }}
      >
        <div className="lp-container flex flex-wrap justify-between gap-2">
          <span>QOE3 · SCENARIO DEMO-001</span>
          <span>SVALBARD · KIRUNA · MATERA</span>
        </div>
      </footer>
    </div>
  );
}
