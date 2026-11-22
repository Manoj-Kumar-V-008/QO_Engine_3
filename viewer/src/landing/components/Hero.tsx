import type { LandingDataBundle } from '../data/loadLandingData';
import MissionCanvas from '../scene/MissionCanvas';
import LedgerStrip from './LedgerStrip';
import { ArrowDown, ArrowUpRight } from './TopBar';
import StarField from './StarField';

interface HeroProps {
  data: LandingDataBundle | null;
  onLaunchConsole: () => void;
}

export default function Hero({ data, onLaunchConsole }: HeroProps) {
  return (
    <section id="act-00" className={`q-hero${data ? '' : ' q-hero--loading'}`}>
      <StarField />
      <div className="q-hero__sky" aria-hidden="true" />
      {data && (
        <div className="q-hero__scene">
          <MissionCanvas
            data={data}
            variant="hero"
            className="q-hero__canvas"
            ariaLabel="Read-only 3D orbital model: Sentinel-2 spacecraft passing over Svalbard, Kiruna and Matera, with a live X-band downlink beam"
          />
        </div>
      )}
      <div className="q-hero__veil" aria-hidden="true" />
      <div className="q-hero__grain" aria-hidden="true" />

      <div className="q-hero__hud q-hero__hud--tr" aria-hidden="true">
        <span>
          <i className="q-status-dot" /> ORBITAL MODEL / SGP4
        </span>
        <span>SENTINEL-2B · NORAD 42063 · 786 KM</span>
      </div>

      <div className="q-container q-hero__inner">
        <div className="q-hero__copy">
          <p className="q-epoch">
            <span className="q-epoch__rule" aria-hidden="true" />
            24 H · 2026-11-09 · SENTINEL-2A + 2B · 3 GROUND STATIONS
          </p>

          <h1 className="q-hero__title">
            <span className="q-line">
              <span className="q-line__inner">44.5% more</span>
            </span>
            <span className="q-line">
              <span className="q-line__inner">data. Same</span>
            </span>
            <span className="q-line">
              <span className="q-line__inner q-hero__title-accent">three dishes.</span>
            </span>
          </h1>

          <p className="q-hero__lead">
            QOE3 schedules satellite downlinks in <strong>15-second slices</strong> instead of
            whole passes, handing the signal between ground stations mid-orbit. The result is
            <strong> 999.2 GB</strong> delivered in 24 hours instead of 691.4 GB — with zero
            physics violations.
          </p>

          <div className="q-hero__actions">
            <button type="button" className="q-btn q-btn--light" onClick={onLaunchConsole}>
              Run the 24-hour scenario <ArrowUpRight />
            </button>
            <a className="q-link q-link--light" href="#act-01">
              See how it works <ArrowDown />
            </a>
          </div>
          <p className="q-hero__note q-mono">
            No account. No token. Runs in your browser on the real scenario.
          </p>
        </div>

        <div className="q-hero__meta" aria-hidden="true">
          <div className="q-hero__handover">
            <span className="q-micro">CARRIER HANDOVER / S-2B</span>
            <span className="q-mono">07:52:45 → 08:01:15 → 08:06:30 UTC</span>
          </div>
          <div className="q-hero__station-legend">
            <span style={{ color: '#f0a43c' }}>SVALBARD</span>
            <span style={{ color: '#5bd6e6' }}>KIRUNA</span>
            <span style={{ color: '#45d6a0' }}>MATERA</span>
          </div>
        </div>
      </div>

      <div className="q-hero__scroll" aria-hidden="true">
        <span className="q-hero__scroll-line" />
        <span>SCROLL TO OPEN THE LEDGER</span>
      </div>

      <LedgerStrip
        generated={data?.scoreboard.generated_gb ?? 3000}
        deliveredBaseline={
          data?.scoreboard.methods.find((m) => m.method === 'greedy')?.gb_delivered ?? 691.4
        }
        deliveredQslice={
          data?.scoreboard.methods.find((m) => m.method === 'qslice')?.gb_delivered ?? 999.2
        }
        overflow={
          data?.scoreboard.methods.find((m) => m.method === 'greedy')?.overflow_gb ?? 1708.6
        }
      />
    </section>
  );
}
