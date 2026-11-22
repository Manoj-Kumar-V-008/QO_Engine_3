interface LedgerFallbackProps {
  step: number;
  mode: 'qslice' | 'greedy';
}

const STATIONS = [
  { name: 'Svalbard', x: 248, y: 496, color: '#f0a43c', coord: '78.23 N' },
  { name: 'Kiruna', x: 462, y: 520, color: '#5bd6e6', coord: '67.86 N' },
  { name: 'Matera', x: 672, y: 552, color: '#45d6a0', coord: '40.65 N' },
];

/**
 * Static, non-WebGL version of the Contact Ledger. It is the design reference for the
 * 3D scene and the fallback when WebGL, data or motion is unavailable.
 */
export default function LedgerFallback({ step, mode }: LedgerFallbackProps) {
  const active = step <= 1 ? 0 : step === 2 ? 1 : 2;
  const showAll = step >= 3;
  const ledgerFill = step >= 4 ? 1 : step === 2 ? 0.45 : step === 1 ? 0.28 : 0.12;

  return (
    <svg
      viewBox="0 0 900 620"
      className="q-ledger-fallback"
      role="img"
      aria-label="Schematic contact ledger: three ground stations on the Earth limb, a Sentinel-2 spacecraft, and a 24-hour ledger of 15-second contact slices."
    >
      <defs>
        <linearGradient id="fbAtmo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5bd6e6" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#5bd6e6" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="fbEarth" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#0a1a20" />
          <stop offset="100%" stopColor="#03070a" />
        </linearGradient>
        <pattern id="fbLost" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="rgba(255,100,100,0.08)" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,100,100,0.5)" strokeWidth="1" />
        </pattern>
        <filter id="fbGlow">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect width="900" height="620" fill="#04080b" />

      {/* ledger wall */}
      <g transform="translate(44 42)">
        <rect width="812" height="146" fill="#080f15" stroke="rgba(238,242,246,0.18)" />
        <text x="14" y="20" fill="#8b9aa4" fontFamily="IBM Plex Mono, monospace" fontSize="9" letterSpacing="1.4">
          24 H CONTACT LEDGER · 15 S CELLS
        </text>
        {[0, 1, 2, 3, 4, 5, 6].map((h) => (
          <line
            key={h}
            x1={36 + (h / 6) * 760}
            y1="30"
            x2={36 + (h / 6) * 760}
            y2="132"
            stroke="rgba(238,242,246,0.08)"
          />
        ))}
        {[0, 1].map((row) => (
          <g key={row}>
            <text x="8" y={row === 0 ? 66 : 114} fill="#7f8d97" fontFamily="IBM Plex Mono, monospace" fontSize="8">
              S-2{row === 0 ? 'B' : 'A'}
            </text>
            <rect x="36" y={row === 0 ? 36 : 86} width="760" height="40" fill="rgba(238,242,246,0.03)" stroke="rgba(238,242,246,0.08)" />
          </g>
        ))}
        {Array.from({ length: 22 }).map((_, i) => {
          const x = 36 + (i / 22) * 760;
          const w = 12 + ((i * 17) % 26);
          const color = i % 5 === 0 ? '#45d6a0' : i % 3 === 0 ? '#5bd6e6' : '#f0a43c';
          return (
            <rect
              key={i}
              x={x}
              y={i % 2 === 0 ? 38 : 88}
              width={Math.min(w, 760 - (x - 36))}
              height="36"
              fill={color}
              opacity={mode === 'greedy' ? 0.7 : 0.85}
            />
          );
        })}
        <rect x={36 + ledgerFill * 760} y="28" width="1.5" height="106" fill="#f7fdff" opacity="0.85" />
        <text x="14" y="146" fill="#7f8d97" fontFamily="IBM Plex Mono, monospace" fontSize="8">
          00:00
        </text>
        <text x="808" y="146" fill="#7f8d97" fontFamily="IBM Plex Mono, monospace" fontSize="8" textAnchor="end">
          24:00
        </text>
      </g>

      {/* orbit */}
      <path d="M 60 390 Q 430 220 860 374" fill="none" stroke="rgba(91,214,230,0.22)" strokeDasharray="3 6" />
      <path d="M 40 360 Q 430 170 880 330" fill="none" stroke="rgba(91,214,230,0.55)" strokeWidth="1.4" />

      {/* satellite */}
      <g transform="translate(610 236)" filter="url(#fbGlow)">
        <rect x="-12" y="-7" width="24" height="14" fill="#e8eff2" />
        <rect x="-46" y="-4" width="30" height="8" fill="#5bd6e6" opacity="0.9" />
        <rect x="16" y="-4" width="30" height="8" fill="#5bd6e6" opacity="0.9" />
        <circle cx="0" cy="0" r="18" fill="none" stroke="#5bd6e6" strokeOpacity="0.25" />
        <text x="26" y="-16" fill="#c7d2d9" fontFamily="IBM Plex Mono, monospace" fontSize="10">
          SENTINEL-2B
        </text>
      </g>

      {/* link beams */}
      {STATIONS.map((station, index) => {
        const isActive = showAll || index === active;
        const color = station.color;
        return (
          <g key={station.name} opacity={isActive ? 1 : 0.16}>
            <line
              x1="610"
              y1="236"
              x2={station.x}
              y2={station.y}
              stroke={color}
              strokeWidth={isActive ? 1.8 : 1}
              strokeDasharray={isActive ? 'none' : '4 7'}
            />
            {isActive && <circle cx={station.x} cy={station.y} r="9" fill="none" stroke={color} strokeOpacity="0.5" />}
          </g>
        );
      })}

      {/* Earth limb */}
      <path d="M -80 700 A 640 640 0 0 1 980 700 Z" fill="url(#fbEarth)" />
      <path d="M -80 700 A 640 640 0 0 1 980 700" fill="none" stroke="#5bd6e6" strokeWidth="1.4" strokeOpacity="0.85" />
      <path d="M -80 680 A 640 640 0 0 1 980 680" fill="none" stroke="url(#fbAtmo)" strokeWidth="34" opacity="0.35" />

      {STATIONS.map((station) => (
        <g key={station.name}>
          <circle cx={station.x} cy={station.y} r="4.5" fill={station.color} />
          <circle cx={station.x} cy={station.y} r="11" fill="none" stroke={station.color} strokeOpacity="0.4" />
          <line x1={station.x} y1={station.y + 11} x2={station.x} y2={station.y + 28} stroke={station.color} strokeOpacity="0.45" />
          <text x={station.x + 7} y={station.y + 26} fill="#e8eff2" fontFamily="IBM Plex Sans, sans-serif" fontSize="10" fontWeight="600">
            {station.name}
          </text>
          <text x={station.x + 7} y={station.y + 38} fill="#7f8d97" fontFamily="IBM Plex Mono, monospace" fontSize="8">
            {station.coord}
          </text>
        </g>
      ))}

      <text x="44" y="604" fill="#7f8d97" fontFamily="IBM Plex Mono, monospace" fontSize="9" letterSpacing="1.2">
        {mode === 'greedy' ? 'WHOLE-PASS LOCK · 691.4 GB DELIVERED' : 'Q SLICE · 15 S DECISIONS · 999.2 GB DELIVERED'}
      </text>
      <text x="856" y="604" fill="#7f8d97" fontFamily="IBM Plex Mono, monospace" fontSize="9" textAnchor="end" letterSpacing="1.2">
        STATIC SCHEMATIC · WEBGL OFFLINE
      </text>
    </svg>
  );
}
