import { useEffect, useState } from 'react';
import './styles/landing.css';
import './styles/enhancements.css';
import { loadLandingData, type LandingDataBundle } from './data/loadLandingData';
import { useSmoothScroll } from './hooks/useSmoothScroll';
import TopBar from './components/TopBar';
import Hero from './components/Hero';
import ActLoss from './components/ActLoss';
import ActCeiling from './components/ActCeiling';
import ActMechanism from './components/ActMechanism';
import ActProof from './components/ActProof';
import ActInvitation from './components/ActInvitation';
import EarthExplainer from './components/EarthExplainer';
import MissionNotes from './components/MissionNotes';
import FinalCTA from './components/FinalCTA';
import Colophon from './components/Colophon';

interface LandingPageProps {
  onLaunchConsole: () => void;
}

export default function LandingPage({ onLaunchConsole }: LandingPageProps) {
  const [data, setData] = useState<LandingDataBundle | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [surface, setSurface] = useState<'void' | 'paper'>('void');

  useSmoothScroll(true);

  useEffect(() => {
    let active = true;
    loadLandingData()
      .then((bundle) => {
        if (active) setData(bundle);
      })
      .catch((error) => {
        if (active) {
          setLoadError(error instanceof Error ? error.message : 'Failed to load telemetry');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // The fixed header takes the surface of the act beneath it.
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const proof = document.getElementById('act-04');
      if (!proof) return;
      const rect = proof.getBoundingClientRect();
      const topbar = document.querySelector<HTMLElement>('.q-top')?.offsetHeight ?? 64;
      const next = rect.top <= topbar && rect.bottom > topbar ? 'paper' : 'void';
      setSurface((previous) => (previous === next ? previous : next));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <div className="q-root">
      <a href="#main-content" className="q-skip">
        Skip to the mission document
      </a>

      <TopBar onLaunchConsole={onLaunchConsole} surface={surface} />

      {loadError && (
        <div className="q-error" role="alert">
          TELEMETRY LOAD WARNING: {loadError}
        </div>
      )}

      <main id="main-content">
        <Hero data={data} onLaunchConsole={onLaunchConsole} />
        <EarthExplainer />
        <ActLoss data={data} />
        <ActCeiling data={data} />
        <ActMechanism data={data} onLaunchConsole={onLaunchConsole} />
        <ActProof data={data} onLaunchConsole={onLaunchConsole} />
        <ActInvitation data={data} onLaunchConsole={onLaunchConsole} />
        <MissionNotes />
        <FinalCTA onLaunchConsole={onLaunchConsole} />
        <Colophon onLaunchConsole={onLaunchConsole} />
      </main>
    </div>
  );
}
