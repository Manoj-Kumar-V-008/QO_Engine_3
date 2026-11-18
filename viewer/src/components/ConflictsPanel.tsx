import { ShieldAlert, SkipForward, Zap } from 'lucide-react';
import type { PassRecord, ScheduleDocument, ScheduleMethod } from '../types/engine';
import { getLoserConflictInfo } from '../lib/telemetry';
import { getSatShortName } from '../scene/constants';

interface ConflictsPanelProps {
  activePassesNow: PassRecord[];
  chosenSet: Set<string>;
  schedules: Record<ScheduleMethod, ScheduleDocument>;
  method: ScheduleMethod;
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
      {/* Quick-Jump Row */}
      <div className="grid grid-cols-3 gap-1.5">
        <button
          onClick={() => onJumpToNext('beam')}
          className="hud-transition flex items-center justify-center gap-1 rounded-md border border-slate-700/70 bg-slate-900/80 px-2 py-1.5 font-mono-tabular text-[10px] font-semibold text-sky-300 hover:border-sky-400/50 hover:bg-slate-800 cursor-pointer"
        >
          <SkipForward className="w-3 h-3" />
          Next Beam
        </button>
        <button
          onClick={() => onJumpToNext('conflict')}
          className="hud-transition flex items-center justify-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/12 px-2 py-1.5 font-mono-tabular text-[10px] font-semibold text-rose-300 hover:bg-rose-500/22 cursor-pointer"
        >
          <ShieldAlert className="w-3 h-3" />
          Next Clash
        </button>
        <button
          onClick={() => onJumpToNext('diff')}
          className="hud-transition flex items-center justify-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/12 px-2 py-1.5 font-mono-tabular text-[10px] font-semibold text-amber-300 hover:bg-amber-500/22 cursor-pointer"
        >
          <Zap className="w-3 h-3" />
          Diff ({diffPassesCount})
        </button>
      </div>

      {/* Conflict Summary Breakdown */}
      <div className="flex items-center justify-between rounded-md hud-subpanel px-2.5 py-2 font-mono-tabular text-[10px]">
        <span className="uppercase tracking-wider text-slate-400">24h Conflict Pairs</span>
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-rose-300">{conflictCountsByReason.total}</span>
          <span className="text-slate-500">
            ({conflictCountsByReason.sameSatellite} sat · {conflictCountsByReason.sameAntenna} dish)
          </span>
        </div>
      </div>

      {/* Active Visibility & Clash Cards */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="font-display text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-400">
            Active Visibility Window ({activePassesNow.length})
          </span>
        </div>

        {activePassesNow.length === 0 ? (
          <div className="rounded-md hud-subpanel px-3 py-5 text-center font-mono-tabular text-[11px] text-slate-400">
            No passes in visibility window at this UTC second.
            <div className="mt-2 text-[10px] text-sky-400">
              Select <strong className="text-rose-300">Next Clash</strong> above to inspect a live 3D contention event.
            </div>
          </div>
        ) : (
          <div className="hud-scroll flex max-h-[290px] flex-col gap-2 overflow-y-auto pr-0.5">
            {activePassesNow.map((p) => {
              const isChosen = chosenSet.has(p.pass_id);
              const otherMethod: ScheduleMethod = method === 'greedy' ? 'optimizer' : 'greedy';
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
                  className={`rounded-md border px-2.5 py-2 font-mono-tabular text-[11px] transition ${
                    isChosen
                      ? 'border-sky-500/50 bg-sky-500/10 text-white'
                      : conflictInfo
                      ? 'border-rose-500/50 bg-rose-950/35 text-rose-100'
                      : 'border-slate-800 bg-slate-950/55 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-bold truncate">
                      {p.pass_id.toUpperCase()} · {getSatShortName(p.satellite_id)} →{' '}
                      {p.antenna_id.replace('-1', '').toUpperCase()}
                    </span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                        isChosen
                          ? 'border border-emerald-500/45 bg-emerald-500/18 text-emerald-300'
                          : conflictInfo
                          ? 'border border-rose-500/45 bg-rose-500/20 text-rose-300'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {isChosen
                        ? 'LOCKED'
                        : conflictInfo
                        ? 'DROPPED'
                        : 'IDLE'}
                    </span>
                  </div>

                  <div className="mt-1 flex items-center justify-between text-[10px] text-slate-300">
                    <span>Peak El: {p.max_elevation_deg.toFixed(1)}°</span>
                    <span>Volume: {p.expected_volume_gb.toFixed(1)} GB</span>
                  </div>

                  {conflictInfo && (
                    <div className="mt-1.5 rounded border border-rose-500/35 bg-rose-950/55 px-2 py-1.5 text-[10px] text-rose-200">
                      <div className="font-bold text-rose-300">
                        Blocked by {conflictInfo.winnerPass.pass_id.toUpperCase()} (
                        {getSatShortName(conflictInfo.winnerPass.satellite_id)} →{' '}
                        {conflictInfo.winnerPass.antenna_id.replace('-1', '').toUpperCase()})
                      </div>
                      <div className="mt-0.5 text-rose-300/90">
                        Constraint:{' '}
                        <code className="font-bold text-rose-100">
                          {conflictInfo.reason.toUpperCase()}
                        </code>
                        {conflictInfo.reason === 'same_antenna'
                          ? conflictInfo.isSetupGapOnly
                            ? ' (120s dish slew gap)'
                            : ' (dish occupied)'
                          : ' (single X-band link)'}
                      </div>
                    </div>
                  )}

                  {isChosen !== chosenByOther && (
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-300">
                      <Zap className="w-3 h-3 shrink-0" />
                      {isChosen
                        ? `Selected exclusively by ${method.toUpperCase()}`
                        : `Selected by ${otherMethod.toUpperCase()} instead`}
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
