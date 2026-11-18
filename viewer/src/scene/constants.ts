export const SAT_COLORS: Record<string, string> = {
  'sentinel-2a': '#38bdf8', // Ice Cyan
  'sentinel-2b': '#a78bfa', // Electric Violet
};

export const SAT_SHORT_NAMES: Record<string, string> = {
  'sentinel-2a': 'S2A',
  'sentinel-2b': 'S2B',
};

export const ANT_COLORS: Record<string, string> = {
  'svalbard-1': '#10b981', // Telemetry Emerald
  'kiruna-1': '#f59e0b',   // Signal Amber
  'matera-1': '#f472b6',   // Rose Magenta
};

export const ANT_CALLSIGNS: Record<string, string> = {
  'svalbard-1': 'GS-SVL',
  'kiruna-1': 'GS-KIR',
  'matera-1': 'GS-MAT',
  'mcmurdo-1': 'GS-MCM',
  'inuvik-1': 'GS-INV',
  'bengaluru-1': 'GS-BLR',
  'alice-1': 'GS-ASP',
};

export const CUSTOM_ANT_COLOR = '#22d3ee';
export const STAGED_ANT_COLOR = '#f59e0b';
export const CONFLICT_COLOR = '#f43f5e';
export const DIFF_COLOR = '#f59e0b';
export const LOCK_COLOR = '#10b981';

export const SPEED_OPTIONS = [1, 10, 60, 180, 300, 600];

// Sentinel-2 Multi-Spectral Instrument (MSI) physical swath width: 290 km
export const SENTINEL2_SWATH_WIDTH_M = 290_000;
export const SENTINEL2_NOMINAL_ALT_KM = 786;

export function getSatShortName(satId: string): string {
  return SAT_SHORT_NAMES[satId] ?? satId.toUpperCase();
}

export function getAntCallsign(antId: string, name: string): string {
  if (ANT_CALLSIGNS[antId]) return ANT_CALLSIGNS[antId];
  const code = name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase() || 'SIM';
  return `GS-${code}`;
}
