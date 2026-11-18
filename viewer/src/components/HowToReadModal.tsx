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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#02050d]/80 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl rounded-lg hud-glass-strong hud-reticle p-5 text-slate-100"
      >
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-sky-400" />
            <h2 className="font-display text-sm font-bold uppercase tracking-[0.14em] text-white">
              Mission Reference // Quantum Orbit Engine 3
            </h2>
          </div>
          <button
            onClick={onClose}
            className="hud-transition rounded-md border border-slate-800 bg-slate-950/80 p-1.5 text-slate-400 hover:border-slate-600 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
          <div className="rounded-md hud-subpanel p-3">
            <div className="flex items-center gap-2 font-display font-bold text-sky-300 mb-1">
              <Satellite className="w-3.5 h-3.5" />
              1. LVLH Spacecraft & 290 km MSI Swath
            </div>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              Sentinel-2A (cyan) and Sentinel-2B (violet) propagate real CelesTrak TLEs via SGP4 in LVLH nadir orientation. Their 290 km optical swaths generate{' '}
              <strong className="text-slate-200 font-mono-tabular">+62.5 GB/h</strong> into a 300 GB onboard buffer.
            </p>
          </div>

          <div className="rounded-md hud-subpanel p-3">
            <div className="flex items-center gap-2 font-display font-bold text-emerald-300 mb-1">
              <Radio className="w-3.5 h-3.5" />
              2. Slewing Dishes & Horizon Rings
            </div>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              Svalbard, Kiruna, and Matera render 3D parabolic dishes that actively slew in Azimuth/Elevation toward the linked spacecraft. Concentric rings mark{' '}
              <strong className="text-slate-200 font-mono-tabular">5°, 15°, and 30°</strong> (560 Mbps full-rate).
            </p>
          </div>

          <div className="rounded-md hud-subpanel p-3">
            <div className="flex items-center gap-2 font-display font-bold text-slate-100 mb-1">
              <Eye className="w-3.5 h-3.5 text-sky-400" />
              3. RF Carrier Streams vs Ghost Passes
            </div>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              Faint static arcs outline all 61 24h candidate passes. During a locked pass, an animated{' '}
              <strong className="text-sky-300">RF packet-pulse beam</strong> and reception cone stream telemetry from spacecraft to dish.
            </p>
          </div>

          <div className="rounded-md border border-rose-500/30 bg-rose-950/20 p-3">
            <div className="flex items-center gap-2 font-display font-bold text-rose-300 mb-1">
              <ShieldAlert className="w-3.5 h-3.5" />
              4. Crimson Contention Arcs
            </div>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              When two visibility windows collide, the dropped pass renders as a pulsing crimson arc tagged{' '}
              <code className="text-rose-200 font-mono-tabular">SAME_ANTENNA</code> (busy or 120s slew gap) or{' '}
              <code className="text-rose-200 font-mono-tabular">SAME_SAT</code>.
            </p>
          </div>

          <div className="rounded-md hud-subpanel p-3">
            <div className="flex items-center gap-2 font-display font-bold text-amber-300 mb-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              5. Buffer Saturation & Overflow
            </div>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              Because all 3 baseline stations sit in Europe, long non-European arcs fill the 300 GB buffers to saturation, triggering red overflow bands in the 24h analytics plot.
            </p>
          </div>

          <div className="rounded-md border border-emerald-500/35 bg-emerald-950/20 p-3">
            <div className="flex items-center gap-2 font-display font-bold text-emerald-300 mb-1">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              6. Q-Slice Handover vs MILP vs Greedy
            </div>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              Greedy delivers <strong className="font-mono-tabular text-slate-200">691.4 GB</strong> and whole-pass MILP delivers{' '}
              <strong className="font-mono-tabular text-sky-300">695.8 GB (+0.6%)</strong>. Q-Slice 15s dynamic handover delivers{' '}
              <strong className="font-mono-tabular text-emerald-300">999.2 GB (+44.5% / +307.8 GB)</strong> on the exact same 3 dishes.
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-slate-800/80 pt-3 font-mono-tabular text-[10px] text-slate-400">
          <div className="flex items-center gap-2">
            <Award className="w-3.5 h-3.5 text-amber-400" />
            <span>Shortcuts: Space (Play/Pause) · H (Cinematic) · ? (Help)</span>
          </div>
          <button
            onClick={onClose}
            className="hud-transition rounded-md bg-sky-500 px-4 py-1.5 font-mono-tabular text-xs font-bold text-slate-950 hover:bg-sky-400 cursor-pointer"
          >
            Acknowledge
          </button>
        </div>
      </div>
    </div>
  );
}
