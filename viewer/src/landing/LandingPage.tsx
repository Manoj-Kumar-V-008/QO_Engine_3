import { useEffect, useState } from 'react';
import './styles/landing.css';
import { loadLandingData, type LandingDataBundle } from './data/loadLandingData';
import { scrollStore } from './data/scrollStore';
import TopBar from './components/TopBar';
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

  return (
    <div className="lp-root">
      <a href="#main-content" className="lp-skip">
        Skip to mission document
      </a>

      <TopBar onLaunchConsole={onLaunchConsole} />

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

        <Hero data={data} onLaunchConsole={onLaunchConsole} />
        <ActWastedPass data={data} />
        <ActBinaryCeiling data={data} />
        <ActContactLedger data={data} />
        <ActProof data={data} onLaunchConsole={onLaunchConsole} />
        <ActInvitation data={data} onLaunchConsole={onLaunchConsole} />
        <MissionNotes />
        <Colophon onLaunchConsole={onLaunchConsole} />
      </main>
    </div>
  );
}
