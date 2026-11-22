/**
 * FinalCTA — full-width, visually dramatic call-to-action section
 * before the colophon. Animated glow, orbit decoration, stats grid.
 */
import { ArrowUpRight } from './TopBar';

interface FinalCTAProps {
  onLaunchConsole: () => void;
}

const FINAL_STATS = [
  { value: '+71%', label: 'More data delivered', color: '#45d6a0' },
  { value: '0', label: 'Physics violations', color: '#5bd6e6' },
  { value: '5,760', label: '15-second slices per day', color: '#f0a43c' },
  { value: '<1ms', label: 'Schedule solved in-browser', color: '#eef2f6' },
];

export default function FinalCTA({ onLaunchConsole }: FinalCTAProps) {
  return (
    <section className="q-finalcta" aria-label="Launch mission console">
      {/* Background orbit rings decoration */}
      <svg className="q-finalcta__rings" aria-hidden="true" viewBox="0 0 1000 400" preserveAspectRatio="xMidYMid slice">
        <ellipse cx="500" cy="200" rx="420" ry="140" fill="none" stroke="rgba(91,214,230,0.07)" strokeWidth="1" strokeDasharray="8 16" />
        <ellipse cx="500" cy="200" rx="310" ry="104" fill="none" stroke="rgba(240,164,60,0.06)" strokeWidth="1" strokeDasharray="6 12" />
        <ellipse cx="500" cy="200" rx="200" ry="68" fill="none" stroke="rgba(69,214,160,0.08)" strokeWidth="1" strokeDasharray="4 10" />
        {/* Animated dot on outer ring */}
        <circle r="4" fill="#5bd6e6" fillOpacity="0.7">
          <animateMotion dur="18s" repeatCount="indefinite">
            <mpath href="#orbit-path-1" />
          </animateMotion>
        </circle>
        <ellipse id="orbit-path-1" cx="500" cy="200" rx="420" ry="140" fill="none" />
        <circle r="3.5" fill="#f0a43c" fillOpacity="0.65">
          <animateMotion dur="12s" repeatCount="indefinite" begin="-5s">
            <mpath href="#orbit-path-2" />
          </animateMotion>
        </circle>
        <ellipse id="orbit-path-2" cx="500" cy="200" rx="310" ry="104" fill="none" />
      </svg>

      <div className="q-container q-finalcta__inner">
        <div className="q-finalcta__stats">
          {FINAL_STATS.map((stat) => (
            <div key={stat.label} className="q-finalcta__stat">
              <span className="q-finalcta__stat-value" style={{ color: stat.color }}>
                {stat.value}
              </span>
              <span className="q-finalcta__stat-label">{stat.label}</span>
            </div>
          ))}
        </div>

        <div className="q-finalcta__copy">
          <p className="q-micro q-finalcta__kicker">OPEN THE MISSION CONSOLE</p>
          <h2 className="q-finalcta__heading">
            See it run. In your browser. On real orbits.
          </h2>
          <p className="q-finalcta__lead">
            No account. No install. The 24-hour scenario runs entirely in-browser using public
            CelesTrak TLEs and SGP4 propagation. Place a new ground station anywhere on Earth
            and the schedule re-solves in under a millisecond.
          </p>
          <div className="q-finalcta__actions">
            <button type="button" className="q-btn q-btn--light q-finalcta__btn" onClick={onLaunchConsole}>
              Launch 3D Mission Console <ArrowUpRight size={16} />
            </button>
            <span className="q-mono q-finalcta__note">
              Sentinel-2A · Sentinel-2B · Svalbard · Kiruna · Matera
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
