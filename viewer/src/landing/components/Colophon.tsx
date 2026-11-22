import { OrbitMark } from './TopBar';
import { ArrowUpRight } from './TopBar';

interface ColophonProps {
  onLaunchConsole: () => void;
}

export default function Colophon({ onLaunchConsole }: ColophonProps) {
  return (
    <footer className="q-colophon">
      <div className="q-container">
        <div className="q-colophon__top">
          <p className="q-colophon__statement">
            The pass is not the unit.
            <br />
            The second is.
          </p>
          <div className="q-colophon__actions">
            <button type="button" className="q-btn q-btn--light" onClick={onLaunchConsole}>
              Run the 24-hour scenario <ArrowUpRight />
            </button>
            <button type="button" className="q-btn q-btn--dark" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              Back to top
            </button>
          </div>
        </div>

        <div className="q-colophon__bottom">
          <span className="q-colophon__brand">
            <OrbitMark size={20} /> QOE3 / QUANTUM ORBIT ENGINE 3
          </span>
          <nav className="q-colophon__links" aria-label="Footer">
            <a href="#act-01">The loss</a>
            <a href="#act-03">The mechanism</a>
            <a href="#act-04">The proof</a>
            <a href="#mission-notes">Mission notes</a>
          </nav>
          <span>Engineering simulation · Public CelesTrak TLEs · Not live ESA operations</span>
          <span>2026-11-09 · DEMO-001</span>
        </div>
      </div>
    </footer>
  );
}
