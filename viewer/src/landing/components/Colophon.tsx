import { useState } from 'react';
import { OrbitalMark } from './TopBar';
import { PrimaryLaunchButton, QuietActionLink } from './LandingButton';

interface ColophonProps {
  onLaunchConsole: () => void;
}

type DocModal = 'scope' | 'terms' | null;

export default function Colophon({ onLaunchConsole }: ColophonProps) {
  const [modal, setModal] = useState<DocModal>(null);

  return (
    <>
      {/* Final Typographic CTA Event */}
      <section
        className="relative overflow-hidden py-24 sm:py-32"
        style={{
          background: 'var(--void)',
          borderBottom: '1px solid var(--rule-void)',
        }}
      >
        {/* Faint static ground track behind display type */}
        <svg
          viewBox="0 0 1440 420"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 w-full h-full opacity-35"
        >
          <path
            d="M -60 340 C 320 120, 680 390, 1080 110 S 1420 260, 1520 160"
            fill="none"
            stroke="#5BD6E6"
            strokeWidth="1"
            strokeDasharray="4 6"
          />
          <path
            d="M -40 370 C 360 155, 720 410, 1120 145 S 1440 290, 1520 190"
            fill="none"
            stroke="#F0A43C"
            strokeWidth="1"
            strokeOpacity="0.55"
          />
        </svg>

        <div className="lp-container relative z-10">
          <div className="lp-act-tag">
            <span className="lp-act-num">END</span>
            <span>SCENARIO DEMO-001 · READY FOR INTERACTIVE INSPECTION</span>
          </div>

          <h2 className="lp-display max-w-[18ch]" style={{ color: 'var(--ink-void)' }}>
            Three dishes. Twenty-four hours. 307.8 gigabytes that used to be lost.
          </h2>

          <div className="mt-10 flex flex-wrap items-center gap-8">
            <PrimaryLaunchButton onClick={onLaunchConsole}>
              Run the 24-hour scenario
            </PrimaryLaunchButton>

            <QuietActionLink href="#act-04" direction="up">
              Jump back to proof sheet
            </QuietActionLink>
          </div>
        </div>
      </section>

      {/* Architectural 3-Row Title-Block Footer Colophon */}
      <footer
        className="text-[13.5px]"
        style={{ background: 'var(--plate)', color: 'var(--ink-void-2)' }}
      >
        <div className="lp-container">
          {/* Row 1: Identity + Scenario */}
          <div
            className="py-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-center"
            style={{ borderBottom: '1px solid var(--rule-void)' }}
          >
            <div className="md:col-span-5 flex items-center gap-2.5" style={{ color: 'var(--ink-void)' }}>
              <OrbitalMark size={16} />
              <span className="font-semibold tracking-[0.04em]">
                QOE3 · Quantum Orbit Engine 3
              </span>
            </div>
            <div className="md:col-span-4 lp-mono text-[13px]">
              DEMO-001 · Epoch 2026-11-09T00:00:00Z
            </div>
            <div className="md:col-span-3 md:text-right font-medium" style={{ color: 'var(--amber)' }}>
              Simulation · Real CelesTrak TLEs
            </div>
          </div>

          {/* Row 2: Ground Station Coordinates & NORAD IDs */}
          <div
            className="py-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 lp-mono text-[13px]"
            style={{ borderBottom: '1px solid var(--rule-void)' }}
          >
            <div>
              <span style={{ color: 'var(--amber)' }}>Svalbard</span> · 78.23°N 15.41°E · 450m
            </div>
            <div>
              <span style={{ color: 'var(--cyan)' }}>Kiruna</span> · 67.86°N 20.96°E · 400m
            </div>
            <div>
              <span style={{ color: 'var(--green)' }}>Matera</span> · 40.65°N 16.70°E · 540m
            </div>
            <div className="lg:text-right">
              S2A 40697 · S2B 42063 · 5° / 120s
            </div>
          </div>

          {/* Row 3: Navigation & Documentation Links (zero fake email forms) */}
          <div className="py-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-6">
              <button
                type="button"
                onClick={onLaunchConsole}
                className="bg-transparent border-0 p-0 cursor-pointer text-[13.5px] font-semibold"
                style={{ color: 'var(--ink-void)' }}
              >
                3D Console
              </button>
              <a
                href="#act-03"
                className="no-underline text-[13.5px] font-medium"
                style={{ color: 'var(--ink-void-2)' }}
              >
                Contact Ledger
              </a>
              <a
                href="#act-04"
                className="no-underline text-[13.5px] font-medium"
                style={{ color: 'var(--ink-void-2)' }}
              >
                Proof Sheet
              </a>
              <a
                href="#act-05"
                className="no-underline text-[13.5px] font-medium"
                style={{ color: 'var(--ink-void-2)' }}
              >
                What-If Lab
              </a>
              <button
                type="button"
                onClick={() => setModal('scope')}
                className="bg-transparent border-0 p-0 cursor-pointer text-[13.5px] font-medium"
                style={{ color: 'var(--ink-void-2)' }}
              >
                Data Scope
              </button>
              <button
                type="button"
                onClick={() => setModal('terms')}
                className="bg-transparent border-0 p-0 cursor-pointer text-[13.5px] font-medium"
                style={{ color: 'var(--ink-void-2)' }}
              >
                Usage Terms
              </button>
            </div>

            <div className="text-[13px]" style={{ color: 'var(--ink-void-3)' }}>
              Client-side SGP4 + CesiumJS + Three.js · No tracking cookies
            </div>
          </div>
        </div>
      </footer>

      {/* Scope / Terms Modal Dialog */}
      {modal && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4"
          style={{ background: 'rgba(5, 7, 10, 0.82)' }}
          role="dialog"
          aria-modal="true"
          aria-label={modal === 'scope' ? 'Data Scope & Privacy' : 'Usage Terms'}
          onClick={() => setModal(null)}
        >
          <div
            className="lp-plate max-w-lg w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between pb-3 mb-4"
              style={{ borderBottom: '1px solid var(--rule-void)' }}
            >
              <span className="lp-micro" style={{ color: 'var(--amber)' }}>
                {modal === 'scope' ? 'DATA SCOPE & PRIVACY' : 'SIMULATION USAGE TERMS'}
              </span>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="lp-micro bg-transparent border-0 cursor-pointer"
                style={{ color: 'var(--ink-void-2)' }}
              >
                CLOSE [ESC]
              </button>
            </div>

            {modal === 'scope' ? (
              <p className="text-[14px] leading-relaxed m-0" style={{ color: 'var(--ink-void-2)' }}>
                All orbital propagation, schedule verification, and What-If experiments execute
                locally in your browser using static JSON artifacts bundled with the site.
                Quantum Orbit Engine 3 does not collect personal data, set advertising cookies,
                or transmit your custom station coordinates to any external server.
              </p>
            ) : (
              <p className="text-[14px] leading-relaxed m-0" style={{ color: 'var(--ink-void-2)' }}>
                Quantum Orbit Engine 3 is a deterministic engineering simulation built for
                algorithmic benchmarking and visualization. While orbital elements originate
                from public CelesTrak Sentinel-2 TLE catalogs, downlink throughput, buffer
                rates, and schedules are modeled approximations and are not intended for live
                spacecraft flight operations.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
