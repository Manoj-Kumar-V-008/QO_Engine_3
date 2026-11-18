interface RollingNumberProps {
  /** Pre-formatted exact string e.g. "999.2", "+44.5%", "56", "1,400.8" */
  value: string;
  className?: string;
}

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/**
 * GPU-composited tabular digit reel (zero React re-renders per frame, zero blur,
 * exact landing on JSON numbers, zero horizontal jitter via tabular-nums).
 */
export function RollingNumber({ value, className = '' }: RollingNumberProps) {
  const chars = value.split('');

  return (
    <span className={`lp-mono lp-roll ${className}`} aria-label={value}>
      <span aria-hidden="true" className="lp-roll-inner">
        {chars.map((ch, idx) => {
          // Key from right so decimal places stay aligned even when digit count changes
          const rightKey = chars.length - 1 - idx;
          if (ch >= '0' && ch <= '9') {
            const digit = Number(ch);
            return (
              <span key={`d-r${rightKey}`} className="lp-roll-slot">
                <span
                  className="lp-roll-reel"
                  style={{ transform: `translate3d(0, -${digit * 10}%, 0)` }}
                >
                  {DIGITS.map((n) => (
                    <span key={n} className="lp-roll-digit">
                      {n}
                    </span>
                  ))}
                </span>
              </span>
            );
          }

          return (
            <span key={`c-r${rightKey}-${ch}`} className="lp-roll-static">
              {ch === ' ' ? '\u00A0' : ch}
            </span>
          );
        })}
      </span>
    </span>
  );
}
