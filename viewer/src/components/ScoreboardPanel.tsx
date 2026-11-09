import { Award, Info, Sparkles, TrendingUp } from 'lucide-react';
import type { ScoreboardDocument } from '../types/engine';

interface ScoreboardPanelProps {
  scoreboard: ScoreboardDocument;
  activeMethod: 'greedy' | 'optimizer';
  onSelectMethod: (method: 'greedy' | 'optimizer') => void;
}

export default function ScoreboardPanel({
  scoreboard,
  activeMethod,
  onSelectMethod,
}: ScoreboardPanelProps) {
  const gainSign = scoreboard.gain_gb >= 0 ? '+' : '';
  const gainPctSign =
    scoreboard.gain_pct !== null && scoreboard.gain_pct >= 0 ? '+' : '';

  return (
    <div className="rounded-xl border border-slate-800/90 bg-slate-950/85 p-3.5 backdrop-blur-md shadow-xl">
      {/* Header + Gain Badge */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5">
          <Award className="w-4 h-4 text-amber-400" />
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-200">
            Scoreboard ({scoreboard.generated_gb.toFixed(0)} GB Gen)
          </span>
        </div>

        <div className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-mono font-bold text-emerald-300 border border-emerald-500/40">
          <TrendingUp className="w-3 h-3" />
          {gainSign}
          {scoreboard.gain_gb.toFixed(0)} GB (
          {scoreboard.gain_pct !== null
            ? `${gainPctSign}${scoreboard.gain_pct.toFixed(1)}%`
            : 'N/A'}
          )
        </div>
      </div>

      {/* Comparison Table */}
      <div className="overflow-hidden rounded-lg border border-slate-800/90 bg-slate-900/60">
        <table className="w-full text-left font-mono text-[11px]">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/90 text-[10px] uppercase text-slate-400">
              <th className="py-1.5 pl-2.5 pr-1">Method</th>
              <th className="py-1.5 px-1 text-right">Passes</th>
              <th className="py-1.5 px-1 text-right">Delivered</th>
              <th className="py-1.5 px-1 text-right">Overflow</th>
              <th className="py-1.5 pl-1 pr-2.5 text-right">Share</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {scoreboard.methods.map((m) => {
              const isCurrent = m.method === activeMethod;
              const isOpt = m.method === 'optimizer';
              return (
                <tr
                  key={m.method}
                  onClick={() =>
                    onSelectMethod(m.method as 'greedy' | 'optimizer')
                  }
                  className={`cursor-pointer transition ${
                    isCurrent
                      ? 'bg-sky-500/15 text-white'
                      : 'text-slate-300 hover:bg-slate-800/50'
                  }`}
                >
                  <td className="py-2 pl-2.5 pr-1 font-bold uppercase">
                    <div className="flex items-center gap-1">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isCurrent ? 'bg-sky-400' : 'bg-slate-600'
                        }`}
                      />
                      <span>{m.method}</span>
                      {isOpt && (
                        <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-1 text-right text-slate-300">
                    {m.passes_used}
                  </td>
                  <td className="py-2 px-1 text-right font-bold text-emerald-300">
                    {m.gb_delivered.toFixed(0)} GB
                  </td>
                  <td className="py-2 px-1 text-right text-red-300/90">
                    {m.overflow_gb.toFixed(0)} GB{' '}
                    <span className="text-[10px] text-slate-500">
                      ({m.overflow_events})
                    </span>
                  </td>
                  <td className="py-2 pl-1 pr-2.5 text-right font-semibold text-sky-300">
                    {m.share_of_generated_pct.toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Required Plain Note Disclaimer */}
      <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-slate-800/80 bg-slate-900/50 px-2.5 py-1.5 text-[10px] font-mono text-slate-400">
        <Info className="w-3.5 h-3.5 text-sky-400 shrink-0" />
        <span>Model result, not real Sentinel-2 operations.</span>
      </div>
    </div>
  );
}
