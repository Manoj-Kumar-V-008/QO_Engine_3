import {
  Crosshair,
  Globe2,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { AntennaConfig, ScoreboardDocument } from '../types/engine';

export interface PresetStation {
  id: string;
  name: string;
  lat_deg: number;
  lon_deg: number;
  alt_m: number;
  tag: string;
}

export const STRATEGIC_PRESETS: PresetStation[] = [
  {
    id: 'mcmurdo-1',
    name: 'McMurdo',
    lat_deg: -77.85,
    lon_deg: 166.67,
    alt_m: 10,
    tag: 'South Pole Hub',
  },
  {
    id: 'inuvik-1',
    name: 'Inuvik',
    lat_deg: 68.36,
    lon_deg: -133.72,
    alt_m: 68,
    tag: 'Arctic Americas',
  },
  {
    id: 'bengaluru-1',
    name: 'Bengaluru',
    lat_deg: 13.03,
    lon_deg: 77.51,
    alt_m: 920,
    tag: 'ISTRAC Asia',
  },
  {
    id: 'alice-1',
    name: 'Alice Springs',
    lat_deg: -23.7,
    lon_deg: 133.88,
    alt_m: 545,
    tag: 'Australia',
  },
];

interface WhatIfPanelProps {
  isPlacingStation: boolean;
  onTogglePlacing: () => void;
  stagedAntennas: AntennaConfig[];
  appliedAntennas: AntennaConfig[];
  onAddPreset: (preset: PresetStation) => void;
  onRemoveAntenna: (id: string) => void;
  onRerunEngine: () => void;
  onResetBaseline: () => void;
  baseScoreboard: ScoreboardDocument | null;
  currentScoreboard: ScoreboardDocument | null;
  lastComputeMs: number | null;
  hasUnappliedChanges: boolean;
}

export default function WhatIfPanel({
  isPlacingStation,
  onTogglePlacing,
  stagedAntennas,
  appliedAntennas,
  onAddPreset,
  onRemoveAntenna,
  onRerunEngine,
  onResetBaseline,
  baseScoreboard,
  currentScoreboard,
  lastComputeMs,
  hasUnappliedChanges,
}: WhatIfPanelProps) {
  const baseOpt = baseScoreboard?.methods.find((m) => m.method === 'optimizer');
  const currOpt = currentScoreboard?.methods.find((m) => m.method === 'optimizer');

  const deltaDeliveredGb =
    baseOpt && currOpt ? currOpt.gb_delivered - baseOpt.gb_delivered : 0;
  const deltaOverflowGb =
    baseOpt && currOpt ? currOpt.overflow_gb - baseOpt.overflow_gb : 0;

  return (
    <div className="rounded-xl border border-amber-500/40 bg-slate-950/90 p-3 backdrop-blur-md shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Globe2 className="w-4 h-4 text-amber-400" />
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-amber-300">
            What-If Geometry Lab
          </span>
        </div>

        {appliedAntennas.length > 0 && (
          <button
            onClick={onResetBaseline}
            className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-mono text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
            title="Restore original 3-station European baseline"
          >
            <RotateCcw className="w-2.5 h-2.5" />
            Reset (3 Dishes)
          </button>
        )}
      </div>

      {/* Click-Globe Action + Re-Run Button */}
      <div className="grid grid-cols-2 gap-1.5">
        <button
          onClick={onTogglePlacing}
          className={`flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-mono font-bold transition cursor-pointer ${
            isPlacingStation
              ? 'border-amber-400 bg-amber-400 text-slate-950 shadow-[0_0_15px_rgba(251,191,36,0.4)] animate-pulse'
              : 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
          }`}
        >
          <Crosshair className="w-3.5 h-3.5" />
          {isPlacingStation ? 'Click Globe Now...' : '+ Click Globe Dish'}
        </button>

        <button
          onClick={onRerunEngine}
          disabled={stagedAntennas.length === 0 && appliedAntennas.length === 0}
          className={`flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-mono font-bold transition cursor-pointer ${
            hasUnappliedChanges
              ? 'bg-emerald-400 text-slate-950 hover:bg-emerald-300 shadow-[0_0_15px_rgba(52,211,153,0.4)]'
              : stagedAntennas.length > 0
              ? 'bg-sky-500 text-slate-950 hover:bg-sky-400'
              : 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed'
          }`}
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          Re-run Engine
        </button>
      </div>

      {/* Quick Geometry Presets */}
      <div className="mt-2">
        <div className="text-[10px] font-mono text-slate-400 mb-1">
          Or test a strategic global station preset:
        </div>
        <div className="grid grid-cols-2 gap-1">
          {STRATEGIC_PRESETS.map((preset) => {
            const exists = stagedAntennas.some((a) => a.id === preset.id);
            return (
              <button
                key={preset.id}
                onClick={() => !exists && onAddPreset(preset)}
                disabled={exists}
                className={`flex items-center justify-between rounded-md border px-2 py-1 text-[10px] font-mono transition ${
                  exists
                    ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-400 cursor-default'
                    : 'border-slate-800 bg-slate-900/80 text-slate-300 hover:border-amber-500/40 hover:text-white cursor-pointer'
                }`}
              >
                <span className="truncate font-semibold">{preset.name}</span>
                <span className="text-[9px] text-slate-400 ml-1 flex items-center gap-0.5">
                  {exists ? 'Added' : <Plus className="w-2.5 h-2.5 text-amber-400" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Added Custom Stations List */}
      {stagedAntennas.length > 0 && (
        <div className="mt-2 flex flex-col gap-1 max-h-24 overflow-y-auto pr-0.5">
          {stagedAntennas.map((ant) => {
            const isApplied = appliedAntennas.some((a) => a.id === ant.id);
            return (
              <div
                key={ant.id}
                className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/90 px-2 py-1 text-[11px] font-mono"
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isApplied ? 'bg-emerald-400' : 'bg-amber-400 animate-ping'
                    }`}
                  />
                  <span className="font-bold text-amber-200">{ant.name}</span>
                  <span className="text-[10px] text-slate-400">
                    ({ant.lat_deg.toFixed(1)}°, {ant.lon_deg.toFixed(1)}°)
                  </span>
                </div>
                <button
                  onClick={() => onRemoveAntenna(ant.id)}
                  className="text-slate-500 hover:text-red-400 cursor-pointer p-0.5"
                  title="Remove custom station"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Geometry Impact Banner (Shows once Re-run is clicked) */}
      {appliedAntennas.length > 0 && baseOpt && currOpt && (
        <div className="mt-2 rounded-lg border border-emerald-500/40 bg-emerald-950/25 px-2.5 py-2 font-mono text-[11px]">
          <div className="flex items-center justify-between text-emerald-300 font-bold">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Geometry Effect (+{appliedAntennas.length} Dish
              {appliedAntennas.length > 1 ? 'es' : ''})
            </span>
            {lastComputeMs !== null && (
              <span className="text-[10px] font-normal text-slate-400">
                Solved in {lastComputeMs}ms
              </span>
            )}
          </div>
          <div className="mt-1 grid grid-cols-2 gap-2 text-[10px]">
            <div className="rounded bg-slate-950/70 px-2 py-1 border border-slate-800">
              <div className="text-slate-400">Delivered (Optimizer)</div>
              <div className="text-xs font-bold text-white">
                {baseOpt.gb_delivered.toFixed(0)} →{' '}
                <span className="text-emerald-400">
                  {currOpt.gb_delivered.toFixed(0)} GB
                </span>{' '}
                <span className="text-emerald-300">
                  (+{deltaDeliveredGb.toFixed(0)} GB)
                </span>
              </div>
            </div>
            <div className="rounded bg-slate-950/70 px-2 py-1 border border-slate-800">
              <div className="text-slate-400">Buffer Overflow Spilled</div>
              <div className="text-xs font-bold text-white">
                {baseOpt.overflow_gb.toFixed(0)} →{' '}
                <span className="text-sky-300">
                  {currOpt.overflow_gb.toFixed(0)} GB
                </span>{' '}
                <span className="text-emerald-300">
                  ({deltaOverflowGb.toFixed(0)} GB)
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
