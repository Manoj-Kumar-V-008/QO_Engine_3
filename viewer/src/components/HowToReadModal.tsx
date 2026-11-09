import {
  AlertTriangle,
  Award,
  BookOpen,
  Eye,
  Radio,
  Satellite,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';

interface HowToReadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function HowToReadModal({ isOpen, onClose }: HowToReadModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900/95 p-6 text-slate-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-sky-400" />
            <h2 className="text-base font-mono font-bold uppercase tracking-wider text-white">
              How to Read This Scene • QO Engine 3
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-800 bg-slate-950 p-1.5 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <div className="flex items-center gap-2 font-bold text-sky-300 mb-1">
              <Satellite className="w-4 h-4" />
              1. Real SGP4 Polar Orbits
            </div>
            <p className="text-slate-400 leading-relaxed">
              Sentinel-2A (cyan) and Sentinel-2B (purple) fly real orbits propagated from CelesTrak TLEs via SGP4. Each generates <strong className="text-slate-200">+62.5 GB/h</strong> into a 300 GB onboard buffer.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <div className="flex items-center gap-2 font-bold text-emerald-300 mb-1">
              <Radio className="w-4 h-4" />
              2. Dishes & Visibility Rings
            </div>
            <p className="text-slate-400 leading-relaxed">
              Svalbard, Kiruna, and Matera each have an outer <strong className="text-slate-200">5° horizon ring</strong> (where a pass begins/ends) and an inner <strong className="text-slate-200">30° ring</strong> where downlink reaches 100% rate (560 Mbps).
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <div className="flex items-center gap-2 font-bold text-slate-200 mb-1">
              <Eye className="w-4 h-4 text-sky-400" />
              3. 61 Ghost Links vs. Live Beams
            </div>
            <p className="text-slate-400 leading-relaxed">
              Faint static lines show all 61 candidate passes over 24 hours. When a scheduled pass opens, a <strong className="text-sky-300">bright glowing beam</strong> locks from dish to satellite and drains the buffer.
            </p>
          </div>

          <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-3">
            <div className="flex items-center gap-2 font-bold text-red-300 mb-1">
              <ShieldAlert className="w-4 h-4" />
              4. Red Dashed Conflict Links
            </div>
            <p className="text-slate-400 leading-relaxed">
              When two passes clash, the dropped pass appears as a <strong className="text-red-300">red dashed beam</strong> tagged with <code className="text-red-200">same_antenna</code> (dish busy or 120s re-point gap) or <code className="text-red-200">same_satellite</code>.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <div className="flex items-center gap-2 font-bold text-amber-300 mb-1">
              <AlertTriangle className="w-4 h-4" />
              5. Buffer Gauges & Red Overflows
            </div>
            <p className="text-slate-400 leading-relaxed">
              Because all 3 stations are in Europe, long non-European orbit arcs fill the 300 GB buffers to 100%, triggering <strong className="text-red-400">OVERFLOWING</strong> alerts and lost data.
            </p>
          </div>

          <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-3">
            <div className="flex items-center gap-2 font-bold text-sky-300 mb-1">
              <Sparkles className="w-4 h-4 text-amber-400" />
              6. Greedy vs. MILP Optimizer
            </div>
            <p className="text-slate-400 leading-relaxed">
              Greedy gives conflicted slots to whichever buffer fills soonest (691 GB). The PuLP/HiGHS MILP Optimizer looks ahead across all 24h to deliver <strong className="text-emerald-300">696 GB (+4 GB)</strong>.
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3 text-[11px] font-mono text-slate-400">
          <span className="flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5 text-amber-400" />
            Note: Model result, not real Sentinel-2 operations.
          </span>
          <button
            onClick={onClose}
            className="rounded-lg bg-sky-500 px-4 py-1.5 text-xs font-bold text-slate-950 hover:bg-sky-400 transition cursor-pointer"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
}
