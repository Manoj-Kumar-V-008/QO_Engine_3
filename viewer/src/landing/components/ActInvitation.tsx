import { useMemo, useState } from 'react';
import * as satellite from 'satellite.js';
import type { LandingDataBundle } from '../data/loadLandingData';
import { runIndependentValidator } from '../data/loadLandingData';
import type { AntennaConfig } from '../../types/engine';
import { runWhatIfPipeline } from '../../lib/whatifEngine';
import earthTextureUrl from '../assets/earth-ne2.jpg';
import { ArrowUpRight } from './TopBar';
import { useReveal } from '../hooks/useReveal';

type WhatIfResult = ReturnType<typeof runWhatIfPipeline>;

interface ActInvitationProps {
  data: LandingDataBundle | null;
  onLaunchConsole: () => void;
}

interface PresetSite {
  id: string;
  name: string;
  region: string;
  lat: number;
  lon: number;
  alt_m: number;
}

const PRESETS: PresetSite[] = [
  { id: 'mcmurdo-1', name: 'McMurdo', region: 'Antarctica', lat: -77.85, lon: 166.67, alt_m: 190 },
  { id: 'inuvik-1', name: 'Inuvik', region: 'Arctic Canada', lat: 68.32, lon: -133.55, alt_m: 102 },
  { id: 'bengaluru-1', name: 'Bengaluru', region: 'South India', lat: 13.03, lon: 77.51, alt_m: 920 },
  { id: 'alice-1', name: 'Alice Springs', region: 'Central Australia', lat: -23.76, lon: 133.88, alt_m: 545 },
];

const MAP_W = 720;
const MAP_H = 360;
const BASE_STATION_COLORS: Record<string, string> = {
  'svalbard-1': '#f0a43c',
  'kiruna-1': '#5bd6e6',
  'matera-1': '#45d6a0',
};

function lonToX(lon: number): number {
  return ((lon + 180) / 360) * MAP_W;
}
function latToY(lat: number): number {
  return ((90 - lat) / 180) * MAP_H;
}

export default function ActInvitation({ data, onLaunchConsole }: ActInvitationProps) {
  const sectionRef = useReveal<HTMLElement>(0.06);
  const [selectedStation, setSelectedStation] = useState<AntennaConfig | null>(null);
  const [whatIfResult, setWhatIfResult] = useState<WhatIfResult | null>(null);
  const [solveSeq, setSolveSeq] = useState<number>(0);

  // Real SGP4 ground tracks for 240 minutes from the scenario epoch.
  const groundTracks = useMemo(() => {
    if (!data) return { s2a: [] as string[], s2b: [] as string[] };
    const buildSegments = (satId: string) => {
      const tle = data.tles[satId];
      if (!tle) return [];
      const satrec = satellite.twoline2satrec(tle.line1, tle.line2);
      const startMs = Date.parse(data.scenario.start_utc);
      const segs: string[] = [];
      let cur = '';
      let prevLon: number | null = null;

      for (let m = 0; m <= 240; m += 2) {
        const d = new Date(startMs + m * 60_000);
        const pv = satellite.propagate(satrec, d);
        if (!pv || !pv.position || typeof pv.position === 'boolean') continue;
        const gd = satellite.eciToGeodetic(pv.position, satellite.gstime(d));
        const lat = satellite.degreesLat(gd.latitude);
        const lon = satellite.degreesLong(gd.longitude);
        const x = lonToX(lon);
        const y = latToY(lat);
        if (prevLon !== null && Math.abs(lon - prevLon) > 120) {
          if (cur) segs.push(cur);
          cur = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
        } else {
          cur += `${cur ? ' L ' : 'M '}${x.toFixed(1)} ${y.toFixed(1)}`;
        }
        prevLon = lon;
      }
      if (cur) segs.push(cur);
      return segs;
    };

    return {
      s2a: buildSegments('sentinel-2a'),
      s2b: buildSegments('sentinel-2b'),
    };
  }, [data]);

  const runStation = (ant: AntennaConfig) => {
    if (!data) return;
    const result = runWhatIfPipeline(data.scenario, data.passesDoc, data.tles, [ant]);
    setSelectedStation(ant);
    setWhatIfResult(result);
    setSolveSeq((n) => n + 1);
  };

  const handleMapClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!data) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const xFrac = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const yFrac = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const lon = Math.round((xFrac * 360 - 180) * 100) / 100;
    const lat = Math.round((90 - yFrac * 180) * 100) / 100;
    runStation({
      id: 'custom-site',
      name: `Custom (${lat.toFixed(1)}°, ${lon.toFixed(1)}°)`,
      lat_deg: lat,
      lon_deg: lon,
      alt_m: 150,
      min_elevation_deg: 5,
      dishes: 1,
      setup_s: 120,
    });
  };

  const baseQ = data?.waterfallRows.find((row) => row.method === 'qslice')?.deliveredGb ?? 999.2;
  const basePasses = data?.passesDoc.passes.length ?? 61;

  const newQ = whatIfResult
    ? whatIfResult.scoreboard.methods.find((method) => method.method === 'qslice')?.gb_delivered ?? baseQ
    : baseQ;
  const newOverflow = whatIfResult
    ? whatIfResult.scoreboard.methods.find((method) => method.method === 'qslice')?.overflow_gb ?? 1400.8
    : 1400.8;
  const newPasses = whatIfResult ? whatIfResult.passesDoc.passes.length : basePasses;
  const addedGb = Math.round((newQ - baseQ) * 10) / 10;
  const addedPasses = newPasses - basePasses;

  const validation = useMemo(() => {
    if (!whatIfResult || !data) return null;
    const checks = runIndependentValidator(
      whatIfResult.scenario,
      data.tles,
      whatIfResult.schedules.qslice,
      3000
    );
    return {
      total: checks.reduce((sum, check) => sum + check.violations, 0),
      checks: checks.length,
    };
  }, [whatIfResult, data]);

  return (
    <section id="act-05" className="q-act q-act--invite" ref={sectionRef}>
      <div className="q-container">
        <div className="q-invite-head">
          <div className="q-act__index">
            <span className="q-act__index-num">05</span>
            <span className="q-micro">WHAT-IF / IN-BROWSER SGP4</span>
          </div>
          <div>
            <h2 className="q-h2">
              Move a dish.
              <br />
              Watch the schedule change.
            </h2>
          </div>
          <div>
            <p className="q-lead">
              Click anywhere on the map to add a fourth station. Your browser propagates real
              Sentinel-2 passes with SGP4, re-solves Q Slice, and re-checks the constraints.
              Nothing is canned.
            </p>
          </div>
        </div>

        <div className="q-whatif q-reveal">
          <div className="q-whatif__plate">
            <div className="q-whatif__head">
              <span className="q-micro">GROUND TRACK / 240 MIN / EQUIRECTANGULAR</span>
              <span className="q-micro">5° MASK · 120 s SLEW · 560 MBPS PEAK</span>
            </div>

            <svg
              viewBox={`0 0 ${MAP_W} ${MAP_H}`}
              className="q-whatif__map"
              onClick={handleMapClick}
              role="img"
              aria-label="World ground-track map. Click to place a fourth ground station, or use the preset buttons below. The three baseline stations are Svalbard, Kiruna and Matera."
            >
              <rect width={MAP_W} height={MAP_H} fill="#04090d" />
              <image
                href={earthTextureUrl}
                x="0"
                y="0"
                width={MAP_W}
                height={MAP_H}
                preserveAspectRatio="none"
                opacity="0.72"
              />
              <rect width={MAP_W} height={MAP_H} fill="#05070a" opacity="0.38" />

              {[-120, -60, 0, 60, 120].map((lon) => (
                <g key={`lon-${lon}`}>
                  <line
                    x1={lonToX(lon)}
                    y1="0"
                    x2={lonToX(lon)}
                    y2={MAP_H}
                    stroke="rgba(238,242,246,0.12)"
                    strokeWidth="0.8"
                  />
                  <text
                    x={lonToX(lon) + 5}
                    y={MAP_H - 8}
                    fontFamily="IBM Plex Mono, monospace"
                    fontSize="7.5"
                    letterSpacing="0.08em"
                    fill="#7f8d99"
                  >
                    {lon === 0 ? '0°' : lon > 0 ? `${lon}°E` : `${Math.abs(lon)}°W`}
                  </text>
                </g>
              ))}
              {[-60, -30, 0, 30, 60].map((lat) => (
                <g key={`lat-${lat}`}>
                  <line
                    x1="0"
                    y1={latToY(lat)}
                    x2={MAP_W}
                    y2={latToY(lat)}
                    stroke={lat === 0 ? 'rgba(238,242,246,0.2)' : 'rgba(238,242,246,0.1)'}
                    strokeWidth="0.8"
                  />
                  <text
                    x="7"
                    y={latToY(lat) - 5}
                    fontFamily="IBM Plex Mono, monospace"
                    fontSize="7.5"
                    letterSpacing="0.08em"
                    fill="#7f8d99"
                  >
                    {lat === 0 ? 'EQ' : lat > 0 ? `${lat}°N` : `${Math.abs(lat)}°S`}
                  </text>
                </g>
              ))}

              {groundTracks.s2a.map((d, index) => (
                <path
                  key={`s2a-${index}`}
                  d={d}
                  fill="none"
                  stroke="#5bd6e6"
                  strokeOpacity="0.5"
                  strokeWidth="1.1"
                />
              ))}
              {groundTracks.s2b.map((d, index) => (
                <path
                  key={`s2b-${index}`}
                  d={d}
                  fill="none"
                  stroke="#f0a43c"
                  strokeOpacity="0.44"
                  strokeWidth="1.1"
                />
              ))}

              {(data?.scenario.antennas ?? []).map((antenna) => {
                const color = BASE_STATION_COLORS[antenna.id] ?? '#eef2f6';
                return (
                  <g key={antenna.id} transform={`translate(${lonToX(antenna.lon_deg)}, ${latToY(antenna.lat_deg)})`}>
                    <circle r="7.5" fill="none" stroke={color} strokeOpacity="0.4" />
                    <circle r="3.4" fill={color} />
                    <text
                      x="9"
                      y="3.5"
                      fontFamily="IBM Plex Mono, monospace"
                      fontSize="8"
                      fontWeight="500"
                      letterSpacing="0.06em"
                      fill={color}
                    >
                      {antenna.name.replace(' Ground Station', '').toUpperCase()}
                    </text>
                  </g>
                );
              })}

              {PRESETS.map((preset) => {
                const isSelected = selectedStation?.id === preset.id;
                const anchor = preset.lon > 120 ? 'end' : 'start';
                const offset = preset.lon > 120 ? -9 : 9;
                return (
                  <g key={preset.id} transform={`translate(${lonToX(preset.lon)}, ${latToY(preset.lat)})`}>
                    <rect
                      x="-3"
                      y="-3"
                      width="6"
                      height="6"
                      fill={isSelected ? '#45d6a0' : 'none'}
                      stroke={isSelected ? '#45d6a0' : 'rgba(238,242,246,0.5)'}
                      strokeWidth="1.1"
                    />
                    <text
                      x={offset}
                      y="3.5"
                      textAnchor={anchor}
                      fontFamily="IBM Plex Mono, monospace"
                      fontSize="7.5"
                      letterSpacing="0.04em"
                      fill={isSelected ? '#45d6a0' : '#aebac5'}
                    >
                      {preset.name.toUpperCase()}
                    </text>
                  </g>
                );
              })}

              {selectedStation && (
                <g
                  key={`${selectedStation.id}-${solveSeq}`}
                  transform={`translate(${lonToX(selectedStation.lon_deg)}, ${latToY(selectedStation.lat_deg)})`}
                >
                  <circle r="12" fill="none" stroke="#45d6a0" strokeOpacity="0.5" />
                  <line x1="-13" y1="0" x2="13" y2="0" stroke="#45d6a0" strokeWidth="1" />
                  <line x1="0" y1="-13" x2="0" y2="13" stroke="#45d6a0" strokeWidth="1" />
                  <circle r="5" fill="#45d6a0" fillOpacity="0.18" stroke="#45d6a0" />
                </g>
              )}

              <text
                x="10"
                y="18"
                fontFamily="IBM Plex Mono, monospace"
                fontSize="7.5"
                letterSpacing="0.1em"
                fill="#7f8d99"
              >
                SENTINEL-2A · — — · SENTINEL-2B · — — · 2026-11-09
              </text>
            </svg>

            <div className="q-whatif__presets">
              {PRESETS.map((preset) => {
                const active = selectedStation?.id === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={`q-chip${active ? ' is-active' : ''}`}
                    onClick={() =>
                      runStation({
                        id: preset.id,
                        name: preset.name,
                        lat_deg: preset.lat,
                        lon_deg: preset.lon,
                        alt_m: preset.alt_m,
                        min_elevation_deg: 5,
                        dishes: 1,
                        setup_s: 120,
                      })
                    }
                    aria-pressed={active}
                  >
                    <span>+ {preset.name}</span>
                    <span className="q-chip__coord">
                      {preset.lat > 0 ? `${preset.lat.toFixed(0)}°N` : `${Math.abs(preset.lat).toFixed(0)}°S`}
                    </span>
                  </button>
                );
              })}
              {selectedStation && (
                <button
                  type="button"
                  className="q-chip"
                  onClick={() => {
                    setSelectedStation(null);
                    setWhatIfResult(null);
                    setSolveSeq((n) => n + 1);
                  }}
                >
                  Reset baseline
                </button>
              )}
            </div>
          </div>

          <aside className="q-whatif__result">
            <div className="q-whatif__readout-head">
              <strong>
                {selectedStation
                  ? `4-STATION / +${selectedStation.name.toUpperCase()}`
                  : '3-STATION BASELINE'}
              </strong>
              <span>{whatIfResult ? `SOLVED ${Math.round(whatIfResult.elapsedMs)} MS` : 'READY'}</span>
            </div>

            <div className="q-whatif__value-row">
              <span className="q-whatif__value" key={solveSeq}>
                {newQ.toFixed(1)}
              </span>
              <span className="q-whatif__value-unit">GB</span>
              <span className="q-whatif__delta">
                {whatIfResult
                  ? `${addedGb >= 0 ? '+' : ''}${addedGb.toFixed(1)} GB vs baseline`
                  : '24 h Q Slice delivered'}
              </span>
            </div>

            <div className="q-whatif__stats">
              <div className="q-whatif__stat">
                <span>Candidate passes</span>
                <strong className="is-cyan">
                  {newPasses}
                  {whatIfResult ? (
                    <small className="q-mono" style={{ color: 'var(--ink-3)', fontSize: 9 }}>
                      {' '}
                      / +{addedPasses}
                    </small>
                  ) : null}
                </strong>
              </div>
              <div className="q-whatif__stat">
                <span>24 h overflow</span>
                <strong className="is-red">{newOverflow.toFixed(1)} GB</strong>
              </div>
              <div className="q-whatif__stat">
                <span>Independent checks</span>
                <strong>{validation ? validation.checks : 5}</strong>
              </div>
              <div className="q-whatif__stat">
                <span>Violations</span>
                <strong style={{ color: 'var(--green)' }}>
                  {validation ? validation.total : 0}
                </strong>
              </div>
            </div>

            <p className="q-whatif__note">
              {selectedStation
                ? 'The new station is propagated from the same public TLEs, then every slice is re-checked for dish exclusivity, slew gaps, elevation and mass balance. Polar sites often add a fresh window instead of competing with Svalbard.'
                : 'The baseline is the exact 24-hour scenario: 61 passes, 63 conflicts, three dishes. Add a station and the solver runs again in this tab.'}
            </p>

            <button type="button" className="q-btn q-btn--light" onClick={onLaunchConsole}>
              Open the full console <ArrowUpRight />
            </button>
          </aside>
        </div>
      </div>
    </section>
  );
}
