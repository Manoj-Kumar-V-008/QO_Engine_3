import { ShieldAlert, SkipForward, Zap } from 'lucide-react';
import type { PassRecord, ScheduleDocument } from '../types/engine';
import { getLoserConflictInfo } from '../lib/telemetry';

interface ConflictsPanelProps {
  activePassesNow: PassRecord[];
  chosenSet: Set<string>;
  schedules: {
    greedy: ScheduleDocument;
    optimizer: ScheduleDocument;
  };
  method: 'greedy' | 'optimizer';
  passMap: Record<string, PassRecord>;
  conflictIndex: Record<
    string,
    { otherPassId: string; reason: 'same_antenna' | 'same_satellite' }[]
  >;
  currentTimeMs: number;
  conflictCountsByReason: {
    total: number;
    sameAntenna: number;
    sameSatellite: number;
  };
  diffPassesCount: number;
  onJumpToNext: (mode: 'beam' | 'diff' | 'conflict') => void;
}

export default function ConflictsPanel({
  activePassesNow,
  chosenSet,
  schedules,
  method,
  passMap,
  conflictIndex,
  currentTimeMs,
  conflictCountsByReason,
  diffPassesCount,
  onJumpToNext,
}: ConflictsPanelProps) {
  return (
    <div className="flex flex-col gap-2.5">
      {/* Quick-Jump Bar */}
      <div className="grid grid-cols-3 gap-1.5">
        <button
          onClick={() => onJumpToNext('beam')}
          className="flex items-center justify-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2 py-2 text-[11px] font-mono text-sky-300 hover:bg-slate-800 transition cursor-pointer"
        >
          <SkipForward className="w-3.5 h-3.5" />
          Next Beam
        </button>
        <button
          onClick={() => onJumpToNext('conflict')}
          className="flex items-center justify-center gap-1 rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-2 text-[11px] font-mono text-red-300 hover:bg-red-500/20 transition cursor-pointer"
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          Next Clash
        </button>
        <button
          onClick={() => onJumpToNext('diff')}
          className="flex items-center justify-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-2 text-[11px] font-mono text-amber-300 hover:bg-amber-500/20 transition cursor-pointer"
        >
          <Zap className="w-3.5 h-3.5" />
          Diff ({diffPassesCount})
        </button>
      </div>

      {/* Conflict Summary Breakdown */}
      <div className="flex items-center justify-between rounded-lg border border-slate-800/90 bg-slate-900/60 px-3 py-2 text-[11px] font-mono">
        <span className="text-slate-400">Total Conflict Pairs:</span>
        <div className="flex items-center gap-2">
          <span className="text-red-300 font-bold">
            {conflictCountsByReason.total}
          </span>
          <span className="text-slate-500">
            ({conflictCountsByReason.sameSatellite} sat •{' '}
            {conflictCountsByReason.sameAntenna} dish)
          </span>
        </div>
      </div>

      {/* Active Visibility & Clash Cards */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
            Passes In Window Right Now ({activePassesNow.length})
          </span>
        </div>

        {activePassesNow.length === 0 ? (
          <div className="rounded-lg border border-slate-800/60 bg-slate-900/40 px-3 py-5 text-xs font-mono text-slate-400 text-center">
            No passes in visibility window at this second.
            <div className="mt-2 text-[11px] text-sky-400">
              Click <strong>Next Clash</strong> above to jump straight into a 3D pass conflict.
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-[320px] overflow-y-auto pr-0.5">
            {activePassesNow.map((p) => {
              const isChosen = chosenSet.has(p.pass_id);
              const otherMethod = method === 'optimizer' ? 'greedy' : 'optimizer';
              const chosenByOther = schedules[otherMethod].assignments.some(
                (a) => a.pass_id === p.pass_id
              );
              const conflictInfo = getLoserConflictInfo(
                p,
                chosenSet,
                passMap,
                conflictIndex,
                currentTimeMs
              );

              return (
                <div
                  key={p.pass_id}
                  className={`rounded-lg border px-3 py-2 text-xs font-mono transition ${
                    isChosen
                      ? 'border-sky-500/60 bg-sky-500/10 text-white'
                      : conflictInfo
                      ? 'border-red-500/60 bg-red-950/35 text-red-200'
                      : 'border-slate-800 bg-slate-900/60 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">
                      {p.pass_id.toUpperCase()} • {p.satellite_id} → {p.antenna_id}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                        isChosen
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : conflictInfo
                          ? 'bg-red-500/25 text-red-300 border border-red-500/50'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {isChosen
                        ? 'WINNER (BEAM ON)'
                        : conflictInfo
                        ? 'CONFLICT LOSER'
                        : 'SKIPPED'}
                    </span>
                  </div>

                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-300">
                    <span>Max El: {p.max_elevation_deg}°</span>
                    <span>Expected: {p.expected_volume_gb} GB</span>
                  </div>

                  {conflictInfo && (
                    <div className="mt-1.5 rounded border border-red-500/40 bg-red-950/60 px-2 py-1 text-[10px] text-red-200">
                      <div className="font-bold text-red-300">
                        ✗ Blocked by {conflictInfo.winnerPass.pass_id.toUpperCase()} (
                        {conflictInfo.winnerPass.satellite_id} →{' '}
                        {conflictInfo.winnerPass.antenna_id})
                      </div>
                      <div className="text-red-300/90 mt-0.5">
                        Reason:{' '}
                        <code className="font-bold underline">
                          {conflictInfo.reason}
                        </code>
                        {conflictInfo.reason === 'same_antenna'
                          ? conflictInfo.isSetupGapOnly
                            ? ' (120s dish re-point setup gap)'
                            : ' (dish busy with other sat)'
                          : ' (sat cannot beam to 2 dishes)'}
                      </div>
                    </div>
                  )}

                  {isChosen !== chosenByOther && (
                    <div className="mt-1 text-[10px] text-amber-300">
                      ⚡ {isChosen ? `Chosen ONLY by ${method}` : `Chosen by ${otherMethod}`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
