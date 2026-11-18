import { Award, Sparkles, TrendingUp } from 'lucide-react';
import type { ScheduleMethod, ScoreboardDocument } from '../types/engine';

interface ScoreboardPanelProps {
  scoreboard: ScoreboardDocument;
  activeMethod: ScheduleMethod;
  onSelectMethod: (method: ScheduleMethod) => void;
}

const METHOD_META: Record<
  string,
  { label: string; subtitle: string; bar: string; ring: string; dot: string }
> = {
  qslice: {
    label: 'Q-Slice Handover',
    subtitle: '15s multi-station DP',
    bar: 'bg-emerald-400',
    ring: 'border-emerald-400/60 bg-emerald-500/12',
    dot: 'bg-emerald-400',
  },
  optimizer: {
    label: 'Binary MILP',
    subtitle: 'Whole-pass PuLP/HiGHS',
    bar: 'bg-sky-400',
    ring: 'border-sky-400/60 bg-sky-500/12',
    dot: 'bg-sky-400',
  },
  greedy: {
    label: 'Greedy Baseline',
    subtitle: 'Urgency-first heuristic',
    bar: 'bg-amber-400',
    ring: 'border-amber-400/60 bg-amber-500/12',
    dot: 'bg-amber-400',
  },
};

export default function ScoreboardPanel({
  scoreboard,
  activeMethod,
  onSelectMethod,
}: ScoreboardPanelProps) {
  const greedy = scoreboard.methods.find((m) => m.method === 'greedy');
  const active =
    scoreboard.methods.find((m) => m.method === activeMethod) ??
    scoreboard.methods[scoreboard.methods.length - 1];

  const deltaGb = greedy && active ? active.gb_delivered - greedy.gb_delivered : 0;
  const deltaPct =
    greedy && active && greedy.gb_delivered > 0
      ? ((active.gb_delivered - greedy.gb_delivered) / greedy.gb_delivered) * 100
      : 0;
  const overflowAvoided = greedy && active ? greedy.overflow_gb - active.overflow_gb : 0;

  const maxDelivered = Math.max(
    1,
    ...scoreboard.methods.map((m) => m.gb_delivered)
  );

  const orderedMethods = [...scoreboard.methods].sort((a, b) => {
    const order = { qslice: 0, optimizer: 1, greedy: 2 };
    return (order[a.method as ScheduleMethod] ?? 9) - (order[b.method as ScheduleMethod] ?? 9);
  });

  const activeTitle =
    activeMethod === 'qslice'
      ? 'Q-Slice vs Greedy'
      : activeMethod === 'optimizer'
      ? 'Binary MILP vs Greedy'
      : 'Greedy Baseline';

  return (
    <div className="flex flex-col gap-2.5">
      {/* Dynamic Hero Callout reflecting the CURRENTLY SELECTED Scheduler */}
      <div className="rounded-md border border-emerald-500/35 bg-emerald-950/25 p-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-display text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-300">
            <Award className="w-3.5 h-3.5 text-emerald-400" />
            {activeTitle}
          </span>
          <span className="font-mono-tabular text-[10px] text-slate-400">
            {scoreboard.generated_gb.toFixed(0)}G Gen
          </span>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <div className="rounded hud-subpanel px-2 py-1.5">
            <div className="font-mono-tabular text-[9px] uppercase tracking-wider text-slate-400">
              {activeMethod === 'greedy' ? 'Delivered' : 'Gain'}
            </div>
            <div className="mt-0.5 flex items-center gap-0.5 whitespace-nowrap font-mono-tabular text-[12px] font-bold text-emerald-300">
              {activeMethod === 'greedy' ? (
                <span>{active?.gb_delivered.toFixed(1)}G</span>
              ) : (
                <>
                  <TrendingUp className="w-3 h-3 shrink-0" />
                  {deltaGb >= 0 ? '+' : ''}
                  {deltaGb.toFixed(1)}G
                </>
              )}
            </div>
          </div>

          <div className="rounded hud-subpanel px-2 py-1.5">
            <div className="font-mono-tabular text-[9px] uppercase tracking-wider text-slate-400">
              Spill Cut
            </div>
            <div className="mt-0.5 whitespace-nowrap font-mono-tabular text-[12px] font-bold text-sky-300">
              {activeMethod === 'greedy'
                ? '0.0G'
                : overflowAvoided >= 0
                ? `−${overflowAvoided.toFixed(1)}G`
                : `+${Math.abs(overflowAvoided).toFixed(1)}G`}
            </div>
          </div>

          <div className="rounded hud-subpanel px-2 py-1.5">
            <div className="font-mono-tabular text-[9px] uppercase tracking-wider text-slate-400">
              Lift
            </div>
            <div className="mt-0.5 whitespace-nowrap font-mono-tabular text-[12px] font-bold text-white">
              {activeMethod === 'greedy'
                ? 'BASE'
                : `${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%`}
            </div>
          </div>
        </div>
      </div>

      {/* 3-Method Bullet Comparison */}
      <div className="rounded-md hud-subpanel p-2 flex flex-col gap-1.5">
        <div className="flex items-center justify-between font-display text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-400 px-0.5">
          <span>24h Scheduler Benchmark</span>
          <span className="font-mono-tabular text-[9px] text-slate-500">Click to switch</span>
        </div>

        {orderedMethods.map((m) => {
          const isCurrent = m.method === activeMethod;
          const meta = METHOD_META[m.method] ?? METHOD_META.optimizer;
          const barWidth = Math.max(8, (m.gb_delivered / maxDelivered) * 100);
          const mLiftPct =
            greedy && greedy.gb_delivered > 0
              ? ((m.gb_delivered - greedy.gb_delivered) / greedy.gb_delivered) * 100
              : 0;

          return (
            <button
              key={m.method}
              onClick={() => onSelectMethod(m.method as ScheduleMethod)}
              className={`hud-transition w-full rounded-md border p-2 text-left cursor-pointer ${
                isCurrent
                  ? meta.ring
                  : 'border-slate-800/80 bg-slate-950/60 hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between font-mono-tabular text-[11px]">
                <span className="flex items-center gap-1.5 font-bold text-slate-100">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isCurrent ? meta.dot : 'bg-slate-600'
                    }`}
                  />
                  {meta.label}
                  {m.method === 'qslice' && (
                    <Sparkles className="w-3 h-3 text-emerald-400" />
                  )}
                </span>
                <span className="font-bold text-emerald-300">
                  {m.gb_delivered.toFixed(1)}G{' '}
                  <span className="text-[10px] font-normal text-slate-400">
                    {m.method === 'greedy'
                      ? '(Base)'
                      : `(+${mLiftPct.toFixed(1)}%)`}
                  </span>
                </span>
              </div>

              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-sm bg-slate-950 border border-slate-800/80">
                <div
                  style={{ width: `${barWidth}%` }}
                  className={`h-full ${meta.bar}`}
                />
              </div>

              <div className="mt-1 flex items-center justify-between font-mono-tabular text-[9px] text-slate-400">
                <span>
                  {meta.subtitle} · {m.passes_used} slots
                </span>
                <span className="text-rose-300/90">
                  Spill: {m.overflow_gb.toFixed(0)}G
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
