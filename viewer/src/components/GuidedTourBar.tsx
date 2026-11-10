import { ChevronLeft, ChevronRight, Compass, X } from 'lucide-react';

export interface TourStep {
  title: string;
  description: string;
  badge: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    badge: 'Step 1 of 5 • Orbits & Ground Stations',
    title: 'Real SGP4 Polar Orbits & European Dish Cluster',
    description:
      'Sentinel-2A (cyan) and Sentinel-2B (purple) fly real orbits from CelesTrak TLEs. Svalbard, Kiruna, and Matera have 5° horizon rings and inner 30° full-rate (560 Mbps) rings.',
  },
  {
    badge: 'Step 2 of 5 • Active Downlink Beams',
    title: 'Elevation-Stepped Downlink & Live Buffer Drain',
    description:
      'We jumped to an active pass! Watch the glowing laser beam lock from dish to satellite while the Data Trail counter ticks up and the onboard buffer drains.',
  },
  {
    badge: 'Step 3 of 5 • Pass Conflicts in 3D',
    title: 'Why 63 Pass Pairs Clash (same_antenna & same_satellite)',
    description:
      'Because the 3 European stations have overlapping footprints, satellites often see 2 dishes at once or 2 satellites cross 1 dish. The dropped pass is shown as a crimson red dashed link.',
  },
  {
    badge: 'Step 4 of 5 • Greedy vs. MILP Optimizer',
    title: 'Global Lookahead Delivers +4 GB More Data',
    description:
      'At this pass, Greedy and the PuLP/HiGHS MILP Optimizer make different choices. Toggle between Greedy and Optimizer in the Scoreboard tab to watch the beam switch live.',
  },
  {
    badge: 'Step 5 of 5 • What-If Geometry Lab',
    title: 'Breaking the European Bottleneck',
    description:
      'Because all 3 baseline dishes are in Europe, buffers overflow during non-European orbit arcs (1,704 GB lost). Use the What-If tab to add McMurdo or click the globe to slash overflows!',
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
    <div className="mx-auto mb-2 w-full max-w-2xl rounded-xl border border-sky-500/50 bg-slate-950/95 px-4 py-3 backdrop-blur-md shadow-[0_0_25px_rgba(56,189,248,0.2)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-sky-400 animate-spin" style={{ animationDuration: '8s' }} />
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-sky-400">
            {step.badge}
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
          title="Exit Guided Tour"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="mt-1 text-sm font-mono font-bold text-white">
        {step.title}
      </div>
      <p className="mt-0.5 text-xs font-mono text-slate-300 leading-relaxed">
        {step.description}
      </p>

      <div className="mt-2.5 flex items-center justify-between border-t border-slate-800/80 pt-2">
        <div className="flex items-center gap-1">
          {TOUR_STEPS.map((_, idx) => (
            <button
              key={idx}
              onClick={() => onSelectStep(idx)}
              className={`h-1.5 rounded-full transition cursor-pointer ${
                idx === stepIndex
                  ? 'w-6 bg-sky-400'
                  : 'w-2 bg-slate-700 hover:bg-slate-500'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onSelectStep(Math.max(0, stepIndex - 1))}
            disabled={stepIndex === 0}
            className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs font-mono text-slate-300 hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Prev
          </button>
          {stepIndex < TOUR_STEPS.length - 1 ? (
            <button
              onClick={() => onSelectStep(stepIndex + 1)}
              className="flex items-center gap-1 rounded-lg bg-sky-500 px-3 py-1 text-xs font-mono font-bold text-slate-950 hover:bg-sky-400 cursor-pointer"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={onClose}
              className="rounded-lg bg-emerald-400 px-3 py-1 text-xs font-mono font-bold text-slate-950 hover:bg-emerald-300 cursor-pointer"
            >
              Finish Tour
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
