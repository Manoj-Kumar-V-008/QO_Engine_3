import { useEffect, useState } from 'react';
import './styles/landing.css';
import { loadLandingData, type LandingDataBundle } from './data/loadLandingData';
import { scrollStore } from './data/scrollStore';
import TopBar from './components/TopBar';
import PresentationOverview from './components/PresentationOverview';
import Hero from './components/Hero';
import ActWastedPass from './components/ActWastedPass';
import ActBinaryCeiling from './components/ActBinaryCeiling';
import ActContactLedger from './components/ActContactLedger';
import ActProof from './components/ActProof';
import ActInvitation from './components/ActInvitation';
import MissionNotes from './components/MissionNotes';
import Colophon from './components/Colophon';

interface LandingPageProps {
  onLaunchConsole: () => void;
}

export default function LandingPage({ onLaunchConsole }: LandingPageProps) {
  const [data, setData] = useState<LandingDataBundle | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCaseStudy, setShowCaseStudy] = useState<boolean>(false);

  useEffect(() => {
    const unmountScroll = scrollStore.mount();
    return unmountScroll;
  }, []);

  useEffect(() => {
    let active = true;
    loadLandingData()
      .then((bundle) => {
        if (active) setData(bundle);
      })
      .catch((err) => {
        if (active) setLoadError(err instanceof Error ? err.message : 'Failed to load data');
      });
    return () => {
      active = false;
    };
  }, []);

  const handleToggleCaseStudy = () => {
    setShowCaseStudy((prev) => {
      const next = !prev;
      if (next) {
        setTimeout(() => {
          const el = document.getElementById('case-study-details');
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
      return next;
    });
  };

  return (
    <div className="lp-root">
      <a href="#main-content" className="lp-skip">
        Skip to presentation overview
      </a>

      <TopBar
        onLaunchConsole={onLaunchConsole}
        onToggleCaseStudy={handleToggleCaseStudy}
        showCaseStudy={showCaseStudy}
      />

      <main id="main-content">
        {loadError && (
          <div
            className="lp-container py-3 lp-mono text-[12px]"
            style={{
              marginTop: 'var(--topbar-h)',
              color: 'var(--red)',
              borderBottom: '1px solid var(--rule-void)',
            }}
            role="alert"
          >
            TELEMETRY LOAD WARNING: {loadError}
          </div>
        )}

        {/* High-Impact Presentation Briefing (Clean, visual, effortless to explain to teachers) */}
        <PresentationOverview
          data={data}
          onLaunchConsole={onLaunchConsole}
          onToggleCaseStudy={handleToggleCaseStudy}
          showCaseStudy={showCaseStudy}
        />

        {/* Collapsible Deep Academic Case Study (Acts 1-5, Contact Ledger, & Mathematical Proofs) */}
        {showCaseStudy ? (
          <div id="case-study-details" className="border-t border-slate-800 bg-[#05070a] transition-all">
            <div className="lp-container py-8 border-b border-slate-800/80 flex items-center justify-between">
              <div>
                <span className="text-xs font-mono text-sky-400 uppercase tracking-widest font-semibold">
                  DEEP ACADEMIC RESEARCH · ACTS 01–05
                </span>
                <h3 className="text-2xl font-bold text-white font-display mt-1">
                  Full Mathematical Formulation & Telemetry Ledger
                </h3>
              </div>
              <button
                onClick={handleToggleCaseStudy}
                className="text-xs font-mono text-slate-300 hover:text-white px-4 py-2 rounded-lg border border-slate-700 bg-slate-900 cursor-pointer hover:border-slate-500 transition"
              >
                Close Case Study ▲
              </button>
            </div>

            <Hero data={data} onLaunchConsole={onLaunchConsole} />
            <ActWastedPass data={data} />
            <ActBinaryCeiling data={data} />
            <ActContactLedger data={data} />
            <ActProof data={data} onLaunchConsole={onLaunchConsole} />
            <ActInvitation data={data} onLaunchConsole={onLaunchConsole} />
            <MissionNotes />
            <Colophon onLaunchConsole={onLaunchConsole} />
          </div>
        ) : (
          <Colophon onLaunchConsole={onLaunchConsole} />
        )}
      </main>
    </div>
  );
}
