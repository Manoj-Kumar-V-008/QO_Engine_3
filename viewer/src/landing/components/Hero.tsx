import type { LandingDataBundle } from '../data/loadLandingData';
import LedgerStrip from './LedgerStrip';
import { PrimaryLaunchButton, QuietActionLink } from './LandingButton';

interface HeroProps {
  data: LandingDataBundle | null;
  onLaunchConsole: () => void;
}

/**
 * Cropped Earth-Limb Telemetry Instrument (bleeds off right/bottom edges).
 * Replaces generic centered globe with horizon-at-58% European orbital geometry:
 * Svalbard (78.23 N), Kiruna (67.86 N), Matera (40.65 N), Sentinel-2B handover arc.
 */
function HeroLimbInstrument() {
  return (
    <div
      className="relative w-full h-[360px] sm:h-[420px] lg:h-[calc(100svh-142px)] lg:min-h-[480px] lg:max-h-[700px] overflow-hidden select-none"
      style={{ borderLeft: '1px solid var(--rule-void)' }}
      aria-label="Orbital horizon diagram showing Sentinel-2B handover across Svalbard, Kiruna, and Matera"
      role="img"
    >
      <svg
        viewBox="0 0 640 620"
        preserveAspectRatio="xMinYMax meet"
        className="w-full h-full block"
      >
        <defs>
          <linearGradient id="limbAtmo" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5BD6E6" stopOpacity="0.28" />
            <stop offset="22%" stopColor="#5BD6E6" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#05070A" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="limbBody" x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0%" stopColor="#0E1722" />
            <stop offset="55%" stopColor="#091018" />
            <stop offset="100%" stopColor="#05070A" />
          </linearGradient>
        </defs>

        {/* Subtle telemetry coordinate grid */}
        {[90, 180, 270, 360, 450, 540].map((x) => (
          <line
            key={`gx-${x}`}
            x1={x}
            y1="0"
            x2={x}
            y2="620"
            stroke="rgba(233,237,242,0.05)"
            strokeWidth="1"
          />
        ))}
        {[80, 170, 260, 350, 440, 530].map((y) => (
          <line
            key={`gy-${y}`}
            x1="0"
            y1={y}
            x2="640"
            y2={y}
            stroke="rgba(233,237,242,0.05)"
            strokeWidth="1"
          />
        ))}

        {/* Top-right instrument header */}
        <g fontFamily="IBM Plex Mono, monospace" fontSize="11.5" fill="#8391A1">
          <text x="28" y="34" letterSpacing="0.04em">
            ORBITAL LIMB · ALT 786 KM · INC 98.57°
          </text>
          <text x="28" y="52" fill="#B2BECB">
            HANDOVER QS009 → QS010 → QS012 (07:52–08:12 UTC)
          </text>
        </g>

        {/* 15-second tick ruler at top of instrument */}
        <g transform="translate(28, 76)">
          <line x1="0" y1="0" x2="584" y2="0" stroke="rgba(233,237,242,0.22)" strokeWidth="1" />
          {Array.from({ length: 40 }).map((_, i) => {
            const x = i * 14.95;
            const major = i % 5 === 0;
            return (
              <line
                key={i}
                x1={x}
                y1={0}
                x2={x}
                y2={major ? 9 : 4}
                stroke={major ? 'rgba(233,237,242,0.45)' : 'rgba(233,237,242,0.18)'}
                strokeWidth="1"
              />
            );
          })}
          {/* Q Slice allocation ticks along top ruler */}
          <rect
            x="60"
            y="-4"
            width="165"
            height="4"
            fill="#F0A43C"
            className="lp-hero-ruler-bar"
            style={{ animationDelay: '260ms' }}
          />
          <rect
            x="231"
            y="-4"
            width="102"
            height="4"
            fill="#5BD6E6"
            className="lp-hero-ruler-bar"
            style={{ animationDelay: '380ms' }}
          />
          <rect
            x="339"
            y="-4"
            width="122"
            height="4"
            fill="#45D6A0"
            className="lp-hero-ruler-bar"
            style={{ animationDelay: '490ms' }}
          />
          <text
            x="60"
            y="24"
            fontFamily="IBM Plex Mono, monospace"
            fontSize="11"
            fill="#F0A43C"
          >
            QS009 · 17.8 GB
          </text>
          <text
            x="231"
            y="24"
            fontFamily="IBM Plex Mono, monospace"
            fontSize="11"
            fill="#5BD6E6"
          >
            QS010 · 8.9 GB
          </text>
          <text
            x="362"
            y="24"
            fontFamily="IBM Plex Mono, monospace"
            fontSize="11"
            fill="#45D6A0"
          >
            QS012 · 6.3 GB
          </text>
        </g>

        {/* Orbital shell arcs (Sentinel-2A & Sentinel-2B tracks) */}
        <path
          d="M -30 338 Q 285 112 695 256"
          fill="none"
          stroke="rgba(91,214,230,0.22)"
          strokeWidth="1"
          strokeDasharray="3 5"
        />
        <path
          d="M -40 300 Q 290 88 705 224"
          fill="none"
          stroke="rgba(233,237,242,0.45)"
          strokeWidth="1.25"
        />

        {/* Highlighted handover path segment */}
        <path
          d="M 118 220 Q 290 156 492 178"
          pathLength={1}
          className="lp-svg-draw"
          fill="none"
          stroke="#5BD6E6"
          strokeWidth="2"
        />

        {/* Atmospheric Fresnel band above Earth limb */}
        <path
          d="M -110 495 A 790 790 0 0 1 780 495 L 780 650 L -110 650 Z"
          fill="url(#limbAtmo)"
          transform="translate(0, -18)"
        />

        {/* Cropped Earth Limb Body (horizon apex ~58% down) */}
        <path
          d="M -110 495 A 790 790 0 0 1 780 495 L 780 650 L -110 650 Z"
          fill="url(#limbBody)"
        />
        {/* Crisp Fresnel limb edge */}
        <path
          d="M -110 495 A 790 790 0 0 1 780 495"
          fill="none"
          stroke="#5BD6E6"
          strokeWidth="1.6"
          strokeOpacity="0.82"
        />
        {/* Faint inner meridian arcs on limb */}
        <path
          d="M -90 540 A 770 770 0 0 1 760 540"
          fill="none"
          stroke="rgba(233,237,242,0.08)"
          strokeWidth="1"
        />
        <path
          d="M 140 426 L 100 620 M 320 398 L 320 620 M 510 424 L 550 620"
          stroke="rgba(233,237,242,0.07)"
          strokeWidth="1"
        />

        {/* RF Downlink Beams from Sentinel-2B handover positions to European dishes */}
        {/* Svalbard beam (QS009) */}
        <g className="lp-hero-beam" style={{ animationDelay: '420ms' }}>
          <line
            x1="168"
            y1="199"
            x2="146"
            y2="424"
            stroke="#F0A43C"
            strokeWidth="1.4"
            strokeOpacity="0.88"
          />
          <polygon
            points="168,199 135,427 157,422"
            fill="#F0A43C"
            fillOpacity="0.09"
          />
        </g>

        {/* Kiruna beam (QS010 — active relay baton) */}
        <g className="lp-hero-beam" style={{ animationDelay: '540ms' }}>
          <line
            x1="312"
            y1="173"
            x2="314"
            y2="399"
            stroke="#5BD6E6"
            strokeWidth="1.75"
          />
          <polygon
            points="312,173 301,400 327,400"
            fill="#5BD6E6"
            fillOpacity="0.12"
          />
          {/* Subtle active carrier telemetry pulse traveling down Kiruna relay beam */}
          <line
            x1="312"
            y1="173"
            x2="314"
            y2="399"
            pathLength={1}
            className="lp-carrier-pulse"
            stroke="#EEF2F6"
            strokeWidth="2.4"
            strokeLinecap="square"
          />
        </g>

        {/* Matera beam (QS012) */}
        <g className="lp-hero-beam" style={{ animationDelay: '660ms' }}>
          <line
            x1="466"
            y1="176"
            x2="496"
            y2="420"
            stroke="#45D6A0"
            strokeWidth="1.4"
            strokeOpacity="0.85"
          />
          <polygon
            points="466,176 485,418 507,423"
            fill="#45D6A0"
            fillOpacity="0.09"
          />
        </g>

        {/* 15s Guard Tick Callouts between beams */}
        <g fontFamily="IBM Plex Mono, monospace" fontSize="10.5" fill="#E9EDF2">
          <line x1="234" y1="184" x2="234" y2="150" stroke="rgba(233,237,242,0.38)" />
          <text x="239" y="158" fill="#B2BECB">15s GUARD</text>
          <line x1="392" y1="172" x2="392" y2="140" stroke="rgba(233,237,242,0.38)" />
          <text x="397" y="148" fill="#B2BECB">15s GUARD</text>
        </g>

        {/* Satellite markers along arc */}
        <g>
          {/* Sentinel-2B at Svalbard window */}
          <rect x="164" y="195" width="8" height="8" fill="#05070A" stroke="#F0A43C" strokeWidth="1.5" />
          {/* Sentinel-2B active at Kiruna */}
          <rect x="307" y="168" width="10" height="10" fill="#5BD6E6" />
          <line x1="296" y1="173" x2="328" y2="173" stroke="#5BD6E6" strokeWidth="1" />
          {/* Sentinel-2B at Matera */}
          <rect x="462" y="172" width="8" height="8" fill="#05070A" stroke="#45D6A0" strokeWidth="1.5" />
          {/* Sentinel-2A trailing (qs011 Svalbard post-slew) */}
          <rect x="78" y="275" width="7" height="7" fill="#05070A" stroke="#9DA9B8" strokeWidth="1.2" />
          <text
            x="92"
            y="283"
            fontFamily="IBM Plex Mono, monospace"
            fontSize="10.5"
            fill="#B2BECB"
          >
            S2A · 40697 (POST-120s SLEW)
          </text>
        </g>

        <text
          x="326"
          y="162"
          fontFamily="IBM Plex Mono, monospace"
          fontSize="11.5"
          fontWeight="600"
          fill="#EEF2F6"
        >
          SENTINEL-2B · 42063
        </text>

        {/* Ground Station Markers on Earth Limb */}
        {/* Svalbard */}
        <g transform="translate(146, 424)">
          <circle cx="0" cy="0" r="4.5" fill="#F0A43C" />
          <circle cx="0" cy="0" r="10" fill="none" stroke="#F0A43C" strokeOpacity="0.45" />
          <line x1="0" y1="10" x2="0" y2="42" stroke="#F0A43C" strokeOpacity="0.5" />
          <text
            x="8"
            y="34"
            fontFamily="IBM Plex Sans, sans-serif"
            fontSize="12"
            fontWeight="600"
            fill="#EEF2F6"
          >
            Svalbard
          </text>
          <text
            x="8"
            y="50"
            fontFamily="IBM Plex Mono, monospace"
            fontSize="10.5"
            fill="#B2BECB"
          >
            78.23°N 15.41°E
          </text>
          <text
            x="8"
            y="65"
            fontFamily="IBM Plex Mono, monospace"
            fontSize="10.5"
            fill="#F0A43C"
          >
            5° mask · 120s slew
          </text>
        </g>

        {/* Kiruna */}
        <g transform="translate(314, 399)">
          <circle cx="0" cy="0" r="4.5" fill="#5BD6E6" />
          <circle cx="0" cy="0" r="10" fill="none" stroke="#5BD6E6" strokeOpacity="0.45" />
          <line x1="0" y1="10" x2="0" y2="90" stroke="#5BD6E6" strokeOpacity="0.45" />
          <text
            x="8"
            y="84"
            fontFamily="IBM Plex Sans, sans-serif"
            fontSize="12"
            fontWeight="600"
            fill="#EEF2F6"
          >
            Kiruna
          </text>
          <text
            x="8"
            y="100"
            fontFamily="IBM Plex Mono, monospace"
            fontSize="10.5"
            fill="#B2BECB"
          >
            67.86°N 20.96°E
          </text>
          <text
            x="8"
            y="115"
            fontFamily="IBM Plex Mono, monospace"
            fontSize="10.5"
            fill="#5BD6E6"
          >
            18.6° peak · 280 Mbps
          </text>
        </g>

        {/* Matera */}
        <g transform="translate(496, 420)">
          <circle cx="0" cy="0" r="4.5" fill="#45D6A0" />
          <circle cx="0" cy="0" r="10" fill="none" stroke="#45D6A0" strokeOpacity="0.45" />
          <line x1="0" y1="10" x2="0" y2="42" stroke="#45D6A0" strokeOpacity="0.5" />
          <text
            x="-112"
            y="34"
            fontFamily="IBM Plex Sans, sans-serif"
            fontSize="12"
            fontWeight="600"
            fill="#EEF2F6"
          >
            Matera
          </text>
          <text
            x="-112"
            y="50"
            fontFamily="IBM Plex Mono, monospace"
            fontSize="10.5"
            fill="#B2BECB"
          >
            40.65°N 16.70°E
          </text>
          <text
            x="-112"
            y="65"
            fontFamily="IBM Plex Mono, monospace"
            fontSize="10.5"
            fill="#45D6A0"
          >
            33.0 GB relay total
          </text>
        </g>

        {/* Bottom-left scale legend */}
        <g
          transform="translate(28, 594)"
          fontFamily="IBM Plex Mono, monospace"
          fontSize="10.5"
          fill="#8391A1"
        >
          <text x="0" y="0">
            REAL CELESTRAK SGP4 TLES · SIMULATED 62.5 GB/H INFLOW · 0 VIOLATIONS
          </text>
        </g>
      </svg>
    </div>
  );
}

export default function Hero({ data, onLaunchConsole }: HeroProps) {
  return (
    <section id="act-00" className="lp-hero">
      <div className="lp-container flex-1 flex flex-col justify-end">
        <div className="lp-hero-grid">
          {/* Left 7 columns: Bottom-aligned mission thesis */}
          <div className="pt-12 pb-12 lg:pt-16 lg:pb-14 lg:pr-12">
            <div className="lp-act-tag">
              <span className="lp-act-num">00</span>
              <span>2026-11-09 00:00 UTC · DEMO-001 · SVALBARD · KIRUNA · MATERA</span>
            </div>

            <h1 className="lp-display" style={{ color: 'var(--ink-void)' }}>
              The pass was never
              <br />
              the problem.
              <br />
              The decision was.
            </h1>

            <p className="lp-lead mt-7 max-w-[54ch]">
              Two Sentinel-2 satellites generate 3,000 GB of Earth imagery a day.
              Three European dishes share 61 overlapping passes—and lose 1,708.6 GB
              to buffer overflow when they schedule whole passes at a time.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
              <PrimaryLaunchButton onClick={onLaunchConsole}>
                Run the 24-hour scenario
              </PrimaryLaunchButton>

              <QuietActionLink href="#act-01" direction="down">
                Read the 24-hour ledger
              </QuietActionLink>
            </div>
          </div>

          {/* Right 5 columns: Cropped Earth-Limb Instrument bleeding cleanly to right edge */}
          <div className="lg:-mr-[var(--gutter)]">
            <HeroLimbInstrument />
          </div>
        </div>
      </div>

      {/* Full-bleed 6-item baseline ledger strip */}
      <LedgerStrip data={data} />
    </section>
  );
}
