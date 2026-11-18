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
    tag: 'South Pole',
  },
  {
    id: 'inuvik-1',
    name: 'Inuvik',
    lat_deg: 68.36,
    lon_deg: -133.72,
    alt_m: 68,
    tag: 'Arctic West',
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
  const baseBest =
    baseScoreboard?.methods.find((m) => m.method === 'qslice') ??
    baseScoreboard?.methods.find((m) => m.method === 'optimizer');
  const currBest =
    currentScoreboard?.methods.find((m) => m.method === 'qslice') ??
    currentScoreboard?.methods.find((m) => m.method === 'optimizer');

  const deltaDeliveredGb =
    baseBest && currBest ? currBest.gb_delivered - baseBest.gb_delivered : 0;
  const deltaOverflowGb =
    baseBest && currBest ? currBest.overflow_gb - baseBest.overflow_gb : 0;

  return (
    <div className="flex flex-col gap-2.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Globe2 className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-display text-[10px] font-bold uppercase tracking-[0.12em] text-amber-300">
            Ground Network Lab
          </span>
        </div>

        {appliedAntennas.length > 0 && (
          <button
            onClick={onResetBaseline}
            className="hud-transition flex items-center gap-1 rounded border border-slate-700 bg-slate-900/90 px-2 py-0.5 font-mono-tabular text-[10px] text-slate-300 hover:border-slate-500 hover:text-white cursor-pointer"
            title="Restore original 3-station European baseline"
          >
            <RotateCcw className="w-2.5 h-2.5" />
            Reset Baseline
          </button>
        )}
      </div>

      {/* Primary Controls */}
      <div className="grid grid-cols-2 gap-1.5">
        <button
          onClick={onTogglePlacing}
          className={`hud-transition flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 font-mono-tabular text-[10px] font-bold uppercase tracking-wider cursor-pointer ${
            isPlacingStation
              ? 'border-amber-400 bg-amber-400 text-slate-950 shadow-[0_0_16px_rgba(245,158,11,0.4)] animate-pulse'
              : 'border-amber-500/40 bg-amber-500/12 text-amber-300 hover:bg-amber-500/22'
          }`}
        >
          <Crosshair className="w-3.5 h-3.5" />
          {isPlacingStation ? 'Pick Globe...' : '+ Place Dish'}
        </button>

        <button
          onClick={onRerunEngine}
          disabled={stagedAntennas.length === 0 && appliedAntennas.length === 0}
          className={`hud-transition flex items-center justify-center gap-1.5 rounded-md px-2 py-2 font-mono-tabular text-[10px] font-bold uppercase tracking-wider cursor-pointer ${
            hasUnappliedChanges
              ? 'bg-emerald-400 text-slate-950 hover:bg-emerald-300 shadow-[0_0_14px_rgba(16,185,129,0.4)]'
              : stagedAntennas.length > 0
              ? 'bg-sky-500 text-slate-950 hover:bg-sky-400'
              : 'border border-slate-800 bg-slate-950/60 text-slate-600 cursor-not-allowed'
          }`}
        >
          <Play className="w-3 h-3 fill-current" />
          Solve 24h
        </button>
      </div>

      {/* Strategic Presets */}
      <div className="rounded-md hud-subpanel p-2">
        <div className="mb-1.5 font-mono-tabular text-[9px] uppercase tracking-wider text-slate-400">
          Strategic Global Site Presets
        </div>
        <div className="grid grid-cols-2 gap-1">
          {STRATEGIC_PRESETS.map((preset) => {
            const exists = stagedAntennas.some((a) => a.id === preset.id);
            return (
              <button
                key={preset.id}
                onClick={() => !exists && onAddPreset(preset)}
                disabled={exists}
                className={`hud-transition flex items-center justify-between rounded border px-2 py-1.5 font-mono-tabular text-[10px] ${
                  exists
                    ? 'border-emerald-500/35 bg-emerald-950/35 text-emerald-300 cursor-default'
                    : 'border-slate-800 bg-slate-950/70 text-slate-300 hover:border-amber-500/45 hover:text-white cursor-pointer'
                }`}
              >
                <span className="truncate font-semibold">{preset.name}</span>
                <span className="ml-1 text-[9px] text-slate-400">
                  {exists ? 'OK' : <Plus className="w-3 h-3 text-amber-400" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Staged / Applied Custom Stations */}
      {stagedAntennas.length > 0 && (
        <div className="hud-scroll flex max-h-28 flex-col gap-1 overflow-y-auto pr-0.5">
          {stagedAntennas.map((ant) => {
            const isApplied = appliedAntennas.some((a) => a.id === ant.id);
            return (
              <div
                key={ant.id}
                className="flex items-center justify-between rounded border border-slate-800 bg-slate-950/80 px-2 py-1.5 font-mono-tabular text-[10px]"
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isApplied ? 'bg-emerald-400' : 'bg-amber-400 animate-ping'
                    }`}
                  />
                  <span className="font-bold text-slate-100">{ant.name}</span>
                  <span className="text-slate-400">
                    ({ant.lat_deg.toFixed(1)}°, {ant.lon_deg.toFixed(1)}°)
                  </span>
                </div>
                <button
                  onClick={() => onRemoveAntenna(ant.id)}
                  className="p-0.5 text-slate-500 hover:text-rose-400 cursor-pointer"
                  title="Remove custom station"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Geometry Impact Readout */}
      {appliedAntennas.length > 0 && baseBest && currBest && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-950/25 p-2.5 font-mono-tabular text-[10px]">
          <div className="flex items-center justify-between font-bold text-emerald-300">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-400" />
              Q-Slice Impact (+{appliedAntennas.length} Site
              {appliedAntennas.length > 1 ? 's' : ''})
            </span>
            {lastComputeMs !== null && (
              <span className="font-normal text-slate-400">{lastComputeMs}ms</span>
            )}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <div className="rounded hud-subpanel px-2 py-1.5">
              <div className="text-[9px] uppercase text-slate-400">Delivered</div>
              <div className="mt-0.5 font-bold text-white">
                {currBest.gb_delivered.toFixed(0)} GB{' '}
                <span className="text-emerald-300">
                  (+{deltaDeliveredGb.toFixed(0)})
                </span>
              </div>
            </div>
            <div className="rounded hud-subpanel px-2 py-1.5">
              <div className="text-[9px] uppercase text-slate-400">Overflow</div>
              <div className="mt-0.5 font-bold text-white">
                {currBest.overflow_gb.toFixed(0)} GB{' '}
                <span className="text-sky-300">({deltaOverflowGb.toFixed(0)})</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
