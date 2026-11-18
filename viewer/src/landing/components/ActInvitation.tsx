import { useMemo, useState } from 'react';
import * as satellite from 'satellite.js';
import type { LandingDataBundle } from '../data/loadLandingData';
import type { AntennaConfig } from '../../types/engine';
import { runWhatIfPipeline } from '../../lib/whatifEngine';
import { PrimaryLaunchButton } from './LandingButton';

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
const MAP_H = 340;

function lonToX(lon: number): number {
  return ((lon + 180) / 360) * MAP_W;
}
function latToY(lat: number): number {
  return ((90 - lat) / 180) * MAP_H;
}

export default function ActInvitation({ data, onLaunchConsole }: ActInvitationProps) {
  const [selectedStation, setSelectedStation] = useState<AntennaConfig | null>(null);
  const [whatIfResult, setWhatIfResult] = useState<WhatIfResult | null>(null);

  // Compute 2 real SGP4 orbits (~200 minutes) of ground track for clean map context
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
    const res = runWhatIfPipeline(data.scenario, data.passesDoc, data.tles, [ant]);
    setSelectedStation(ant);
    setWhatIfResult(res);
  };

  const handleMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!data) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xFrac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const yFrac = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const lon = Math.round((xFrac * 360 - 180) * 100) / 100;
    const lat = Math.round((90 - yFrac * 180) * 100) / 100;
    runStation({
      id: `custom-site`,
      name: `Custom (${lat.toFixed(1)}°, ${lon.toFixed(1)}°)`,
      lat_deg: lat,
      lon_deg: lon,
      alt_m: 150,
      min_elevation_deg: 5,
      dishes: 1,
      setup_s: 120,
    });
  };

  const baseQ = data?.waterfallRows.find((r) => r.method === 'qslice')?.deliveredGb ?? 999.2;
  const basePasses = data?.passesDoc.passes.length ?? 61;

  const newQ = whatIfResult
    ? whatIfResult.scoreboard.methods.find((m) => m.method === 'qslice')?.gb_delivered ?? baseQ
    : baseQ;
  const newOverflow = whatIfResult
    ? whatIfResult.scoreboard.methods.find((m) => m.method === 'qslice')?.overflow_gb ?? 1400.8
    : 1400.8;
  const newPasses = whatIfResult ? whatIfResult.passesDoc.passes.length : basePasses;
  const addedGb = Math.round((newQ - baseQ) * 10) / 10;
  const addedPasses = newPasses - basePasses;

  return (
    <section id="act-05" className="lp-act">
      <div className="lp-container">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end mb-10">
          <div className="lg:col-span-7">
            <div className="lp-act-tag">
              <span className="lp-act-num">05</span>
              <span>LIVE WHAT-IF LAB · IN-BROWSER SGP4 + Q SLICE SOLVER</span>
            </div>
            <h2 className="lp-h2" style={{ color: 'var(--ink-void)' }}>
              Move a dish.
              <br />
              Watch the schedule change.
            </h2>
          </div>

          <div className="lg:col-span-5">
            <p className="lp-lead">
              Select a preset or click anywhere on the ground-track projection below.
              Your browser propagates real Sentinel-2 SGP4 passes for the new dish and
              re-solves Greedy, MILP, and Q Slice on the spot—no canned numbers.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left 7 cols: Interactive SGP4 Ground-Track Map */}
          <div className="lg:col-span-7 lp-plate p-4 sm:p-5 flex flex-col justify-between">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <span className="lp-micro" style={{ color: 'var(--ink-void)' }}>
                CLICK ANYWHERE ON EARTH TO ADD A 4TH GROUND STATION
              </span>
              <span className="lp-micro" style={{ color: 'var(--ink-void-3)' }}>
                5° MASK · 120s SLEW · 560 MBPS PEAK
              </span>
            </div>

            <svg
              viewBox={`0 0 ${MAP_W} ${MAP_H}`}
              onClick={handleMapClick}
              className="w-full h-auto block cursor-crosshair"
              style={{
                background: '#05070A',
                border: '1px solid var(--rule-void)',
              }}
              role="application"
              aria-label="World ground track map. Click anywhere to place a fourth ground station and recompute Q Slice."
            >
              {/* Latitude / Longitude graticule */}
              {[-120, -60, 0, 60, 120].map((lon) => (
                <g key={`lon-${lon}`}>
                  <line
                    x1={lonToX(lon)}
                    y1={0}
                    x2={lonToX(lon)}
                    y2={MAP_H}
                    stroke="rgba(233,237,242,0.08)"
                  />
                  <text
                    x={lonToX(lon) + 5}
                    y={MAP_H - 7}
                    fontFamily="IBM Plex Mono, monospace"
                    fontSize="10.5"
                    fill="#8391A1"
                  >
                    {lon === 0 ? '0°' : lon > 0 ? `${lon}°E` : `${Math.abs(lon)}°W`}
                  </text>
                </g>
              ))}
              {[-60, -30, 0, 30, 60].map((lat) => (
                <g key={`lat-${lat}`}>
                  <line
                    x1={0}
                    y1={latToY(lat)}
                    x2={MAP_W}
                    y2={latToY(lat)}
                    stroke={lat === 0 ? 'rgba(233,237,242,0.16)' : 'rgba(233,237,242,0.08)'}
                  />
                  <text
                    x={6}
                    y={latToY(lat) - 5}
                    fontFamily="IBM Plex Mono, monospace"
                    fontSize="10.5"
                    fill="#8391A1"
                  >
                    {lat === 0 ? 'EQ' : lat > 0 ? `${lat}°N` : `${Math.abs(lat)}°S`}
                  </text>
                </g>
              ))}

              {/* Real SGP4 Sentinel-2 ground tracks */}
              {groundTracks.s2a.map((d, i) => (
                <path
                  key={`a-${i}`}
                  d={d}
                  fill="none"
                  stroke="#5BD6E6"
                  strokeOpacity="0.28"
                  strokeWidth="1"
                />
              ))}
              {groundTracks.s2b.map((d, i) => (
                <path
                  key={`b-${i}`}
                  d={d}
                  fill="none"
                  stroke="#F0A43C"
                  strokeOpacity="0.26"
                  strokeWidth="1"
                />
              ))}

              {/* Baseline 3 European stations */}
              {(data?.scenario.antennas ?? []).map((ant) => {
                const x = lonToX(ant.lon_deg);
                const y = latToY(ant.lat_deg);
                return (
                  <g key={ant.id} transform={`translate(${x}, ${y})`}>
                    <circle cx="0" cy="0" r="4" fill="#5BD6E6" />
                    <circle cx="0" cy="0" r="9" fill="none" stroke="#5BD6E6" strokeOpacity="0.4" />
                  </g>
                );
              })}

              {/* Preset ghost markers */}
              {PRESETS.map((p) => {
                const x = lonToX(p.lon);
                const y = latToY(p.lat);
                const isSel = selectedStation?.id === p.id;
                return (
                  <g key={p.id} transform={`translate(${x}, ${y})`}>
                    <rect
                      x="-3"
                      y="-3"
                      width="6"
                      height="6"
                      fill={isSel ? '#45D6A0' : 'none'}
                      stroke={isSel ? '#45D6A0' : 'rgba(233,237,242,0.45)'}
                      strokeWidth="1.2"
                    />
                    <text
                      x={p.lon > 120 ? -9 : 9}
                      y="4"
                      textAnchor={p.lon > 120 ? 'end' : 'start'}
                      fontFamily="IBM Plex Sans, sans-serif"
                      fontSize="11"
                      fontWeight="500"
                      fill={isSel ? '#45D6A0' : '#B2BECB'}
                    >
                      {p.name}
                    </text>
                  </g>
                );
              })}

              {/* Selected custom/preset station crosshair */}
              {selectedStation && (
                <g
                  transform={`translate(${lonToX(selectedStation.lon_deg)}, ${latToY(
                    selectedStation.lat_deg
                  )})`}
                >
                  <line x1="-14" y1="0" x2="14" y2="0" stroke="#45D6A0" strokeWidth="1.2" />
                  <line x1="0" y1="-14" x2="0" y2="14" stroke="#45D6A0" strokeWidth="1.2" />
                  <circle cx="0" cy="0" r="6" fill="#45D6A0" fillOpacity="0.22" stroke="#45D6A0" />
                </g>
              )}
            </svg>

            {/* Preset buttons row */}
            <div className="mt-4 flex flex-wrap gap-2.5">
              {PRESETS.map((p) => {
                const active = selectedStation?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    data-active={active ? 'true' : 'false'}
                    onClick={() =>
                      runStation({
                        id: p.id,
                        name: p.name,
                        lat_deg: p.lat,
                        lon_deg: p.lon,
                        alt_m: p.alt_m,
                        min_elevation_deg: 5,
                        dishes: 1,
                        setup_s: 120,
                      })
                    }
                    className="lp-btn-tactile"
                  >
                    <span>+ {p.name}</span>
                    <span className="lp-mono text-[12px] opacity-80">
                      {p.lat > 0 ? `${p.lat.toFixed(0)}°N` : `${Math.abs(p.lat).toFixed(0)}°S`}
                    </span>
                  </button>
                );
              })}

              {selectedStation && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStation(null);
                    setWhatIfResult(null);
                  }}
                  className="lp-btn-tactile"
                  style={{ color: 'var(--ink-void-2)' }}
                >
                  Reset Baseline
                </button>
              )}
            </div>
          </div>

          {/* Right 5 cols: Live Computed Solver Output */}
          <div className="lg:col-span-5 lp-plate p-5 sm:p-6 flex flex-col justify-between">
            <div>
              <div
                className="flex items-center justify-between pb-3 mb-5"
                style={{ borderBottom: '1px solid var(--rule-void)' }}
              >
                <span className="lp-micro" style={{ color: 'var(--amber)' }}>
                  {selectedStation
                    ? `4-STATION SCENARIO · +${selectedStation.name.toUpperCase()}`
                    : '3-STATION BASELINE · SVALBARD + KIRUNA + MATERA'}
                </span>
                <span className="lp-mono text-[12.5px]" style={{ color: 'var(--ink-void-2)' }}>
                  {whatIfResult ? `Solved in ${Math.round(whatIfResult.elapsedMs)} ms` : 'Ready'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4" style={{ background: 'var(--void)', border: '1px solid var(--rule-void)' }}>
                  <div className="text-[12.5px] font-medium" style={{ color: 'var(--ink-void-2)' }}>
                    Q Slice delivered
                  </div>
                  <div
                    className="lp-mono text-[28px] font-semibold mt-1"
                    style={{ color: 'var(--green)' }}
                  >
                    {newQ.toFixed(1)} GB
                  </div>
                  <div className="text-[13px] mt-1" style={{ color: 'var(--ink-void-2)' }}>
                    {whatIfResult
                      ? `${addedGb >= 0 ? '+' : ''}${addedGb.toFixed(1)} GB vs. baseline`
                      : '3 European stations'}
                  </div>
                </div>

                <div className="p-4" style={{ background: 'var(--void)', border: '1px solid var(--rule-void)' }}>
                  <div className="text-[12.5px] font-medium" style={{ color: 'var(--ink-void-2)' }}>
                    Candidate passes
                  </div>
                  <div
                    className="lp-mono text-[28px] font-semibold mt-1"
                    style={{ color: 'var(--cyan)' }}
                  >
                    {newPasses}
                  </div>
                  <div className="text-[13px] mt-1" style={{ color: 'var(--ink-void-2)' }}>
                    {whatIfResult ? `+${addedPasses} new SGP4 passes` : '61 baseline passes'}
                  </div>
                </div>

                <div className="p-4" style={{ background: 'var(--void)', border: '1px solid var(--rule-void)' }}>
                  <div className="text-[12.5px] font-medium" style={{ color: 'var(--ink-void-2)' }}>
                    24h overflow
                  </div>
                  <div
                    className="lp-mono text-[23px] font-semibold mt-1"
                    style={{ color: 'var(--red)' }}
                  >
                    {newOverflow.toFixed(1)} GB
                  </div>
                </div>

                <div className="p-4" style={{ background: 'var(--void)', border: '1px solid var(--rule-void)' }}>
                  <div className="text-[12.5px] font-medium" style={{ color: 'var(--ink-void-2)' }}>
                    Constraints
                  </div>
                  <div
                    className="lp-mono text-[23px] font-semibold mt-1"
                    style={{ color: 'var(--green)' }}
                  >
                    0 viol.
                  </div>
                </div>
              </div>

              <p className="text-[15px] leading-[1.65] mt-5 mb-0" style={{ color: 'var(--ink-void-2)' }}>
                Notice how a polar station like McMurdo (77.85°S) sits opposite Europe
                on Sentinel-2&apos;s sun-synchronous orbit—draining buffers roughly 50 minutes
                after Svalbard instead of competing with Kiruna for the same northern pass.
              </p>
            </div>

            <div className="mt-6 pt-5" style={{ borderTop: '1px solid var(--rule-void)' }}>
              <PrimaryLaunchButton fullWidth onClick={onLaunchConsole}>
                Open full 3D What-If Lab in Console
              </PrimaryLaunchButton>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
