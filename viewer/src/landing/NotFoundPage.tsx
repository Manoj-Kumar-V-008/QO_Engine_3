import './styles/landing.css';
import { ArrowUpRight, OrbitMark } from './components/TopBar';

interface NotFoundPageProps {
  onGoHome: () => void;
  onGoConsole: () => void;
}

export default function NotFoundPage({ onGoHome, onGoConsole }: NotFoundPageProps) {
  return (
    <div className="q-root">
      <header className="q-top q-top--void">
        <div className="q-top__inner">
          <button
            type="button"
            className="q-brand"
            onClick={onGoHome}
            style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0 }}
          >
            <span className="q-brand__mark">
              <OrbitMark />
            </span>
            <span className="q-brand__name">QOE3</span>
          </button>
          <div className="q-top__tools">
            <button type="button" className="q-top__console" onClick={onGoConsole}>
              Open console <ArrowUpRight />
            </button>
          </div>
        </div>
      </header>

      <main
        className="q-container"
        style={{ paddingTop: 'calc(var(--topbar) + 16vh)', paddingBottom: '16vh', minHeight: '82vh' }}
      >
        <div className="q-act__index" style={{ marginBottom: 22 }}>
          <span className="q-act__index-num">404</span>
          <span className="q-micro">LOSS OF SIGNAL / ROUTE NOT FOUND</span>
        </div>
        <h1 className="q-h2" style={{ fontSize: 'clamp(2.8rem, 7vw, 6.2rem)', maxWidth: '15ch' }}>
          No pass scheduled
          <br />
          at this coordinate.
        </h1>
        <p className="q-lead" style={{ marginTop: 24, maxWidth: '56ch' }}>
          The requested path does not match an active QOE3 route. Return to the 24-hour mission
          document, or open the live 3D CesiumJS console directly.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginTop: 34 }}>
          <button type="button" className="q-btn q-btn--light" onClick={onGoHome}>
            Return to mission document <ArrowUpRight />
          </button>
          <button type="button" className="q-btn q-btn--dark" onClick={onGoConsole}>
            Launch 3D console (/console)
          </button>
        </div>
      </main>

      <footer className="q-colophon">
        <div className="q-container">
          <div className="q-colophon__bottom">
            <span>QOE3 · SCENARIO DEMO-001</span>
            <span>SVALBARD · KIRUNA · MATERA</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
