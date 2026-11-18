import { ChevronLeft, ChevronRight, Compass, X } from 'lucide-react';

export interface TourStep {
  title: string;
  description: string;
  badge: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    badge: 'STEP 01 / 05 // ORBITS & EUROPEAN CORRIDOR',
    title: 'True SGP4 Polar Orbits & Articulated Ground Network',
    description:
      'Sentinel-2A (cyan) and Sentinel-2B (violet) fly real CelesTrak SGP4 orbits in LVLH attitude, sweeping a 290 km MSI optical swath while Svalbard, Kiruna, and Matera project 5°, 15°, and 30° full-rate visibility rings.',
  },
  {
    badge: 'STEP 02 / 05 // LIVE RF DOWNLINK & SLEWING DISH',
    title: 'Animated X-Band Telemetry Stream & Active Buffer Drain',
    description:
      'We locked onto an active pass. Watch the parabolic dish slew in Azimuth/Elevation toward the spacecraft while telemetry pulses stream down the carrier beam and the onboard 300 GB solid-state buffer drains.',
  },
  {
    badge: 'STEP 03 / 05 // CONTENTION & CONFLICT ARCS',
    title: '63 Conflicting Pass Pairs (SAME_ANTENNA & SAME_SAT)',
    description:
      'Overlapping European footprints cause satellites to see two dishes simultaneously or two satellites to cross one dish inside its 120s slew window. Dropped passes appear as pulsing crimson contention arcs.',
  },
  {
    badge: 'STEP 04 / 05 // GREEDY VS MILP OPTIMIZER',
    title: 'Global 24h Lookahead Recovers +4.4 GB Over Greedy',
    description:
      'At this contested pass, Greedy and the PuLP/HiGHS MILP Optimizer diverge. Toggle OPTIMIZER / GREEDY in the top mission bar to watch the active RF carrier beam switch live.',
  },
  {
    badge: 'STEP 05 / 05 // WHAT-IF GEOMETRY LAB',
    title: 'Breaking the European Ground Bottleneck',
    description:
      'With all 3 baseline dishes in Europe, buffers fill to 300 GB on non-European arcs (~1,704 GB overflow). Open the What-If tab to add McMurdo or click the 3D globe to re-solve in milliseconds.',
  },
];

interface GuidedTourBarProps {
  stepIndex: number;
  onSelectStep: (idx: number) => void;
  onClose: () => void;
}

export default function GuidedTourBar({
  stepIndex,
  onSelectStep,
  onClose,
}: GuidedTourBarProps) {
  const step = TOUR_STEPS[stepIndex];

  return (
    <div className="mx-auto w-full rounded-lg hud-glass-strong hud-reticle border-sky-500/45 px-4 py-3 shadow-[0_0_30px_rgba(56,189,248,0.18)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Compass
            className="w-3.5 h-3.5 text-sky-400 animate-spin"
            style={{ animationDuration: '10s' }}
          />
          <span className="font-mono-tabular text-[10px] font-bold uppercase tracking-[0.14em] text-sky-400">
            {step.badge}
          </span>
        </div>
        <button
          onClick={onClose}
          className="hud-transition rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
          title="Exit Guided Tour"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="mt-1 font-display text-sm font-bold text-slate-50">
        {step.title}
      </div>
      <p className="mt-0.5 text-xs text-slate-300 leading-relaxed">
        {step.description}
      </p>

      <div className="mt-2.5 flex items-center justify-between border-t border-slate-800/80 pt-2">
        <div className="flex items-center gap-1.5">
          {TOUR_STEPS.map((_, idx) => (
            <button
              key={idx}
              onClick={() => onSelectStep(idx)}
              className={`hud-transition h-1.5 rounded-sm cursor-pointer ${
                idx === stepIndex
                  ? 'w-7 bg-sky-400'
                  : 'w-2 bg-slate-700 hover:bg-slate-500'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onSelectStep(Math.max(0, stepIndex - 1))}
            disabled={stepIndex === 0}
            className="hud-transition flex items-center gap-1 rounded-md border border-slate-700/70 bg-slate-900/80 px-2.5 py-1 font-mono-tabular text-[11px] text-slate-300 hover:border-slate-500 hover:text-white disabled:opacity-35 cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Prev
          </button>
          {stepIndex < TOUR_STEPS.length - 1 ? (
            <button
              onClick={() => onSelectStep(stepIndex + 1)}
              className="hud-transition flex items-center gap-1 rounded-md bg-sky-500 px-3 py-1 font-mono-tabular text-[11px] font-bold text-slate-950 hover:bg-sky-400 cursor-pointer"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={onClose}
              className="hud-transition rounded-md bg-emerald-400 px-3 py-1 font-mono-tabular text-[11px] font-bold text-slate-950 hover:bg-emerald-300 cursor-pointer"
            >
              Finish Tour
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
