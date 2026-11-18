import type { ReactNode } from 'react';

interface PrimaryLaunchButtonProps {
  children: ReactNode;
  onClick: () => void;
  fullWidth?: boolean;
  className?: string;
}

export function ArrowRightIcon({ className = 'lp-btn-arrow' }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2.5 8H13M9 3.75L13.25 8L9 12.25"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="square"
      />
    </svg>
  );
}

export function ArrowVerticalIcon({
  direction = 'down',
}: {
  direction?: 'down' | 'up';
}) {
  return (
    <svg
      className={direction === 'down' ? 'lp-quiet-arrow-down' : 'lp-quiet-arrow-up'}
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      {direction === 'down' ? (
        <path
          d="M8 2.5V13M3.75 9L8 13.25L12.25 9"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="square"
        />
      ) : (
        <path
          d="M8 13.5V3M3.75 7L8 2.75L12.25 7"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="square"
        />
      )}
    </svg>
  );
}

/**
 * Tactile Split-Chamber Aerospace Command Button
 * Two-chamber hardware switchgear: precision-beveled command plate + recessed sliding arrow cell.
 */
export function PrimaryLaunchButton({
  children,
  onClick,
  fullWidth = false,
  className = '',
}: PrimaryLaunchButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`lp-btn-primary ${fullWidth ? 'w-full' : ''} ${className}`}
    >
      <span className="lp-btn-label">{children}</span>
      <span className="lp-btn-cell" aria-hidden="true">
        <ArrowRightIcon />
      </span>
    </button>
  );
}

interface QuietActionLinkProps {
  href?: string;
  onClick?: () => void;
  direction?: 'down' | 'up' | 'right';
  children: ReactNode;
}

export function QuietActionLink({
  href,
  onClick,
  direction = 'down',
  children,
}: QuietActionLinkProps) {
  const icon =
    direction === 'right' ? (
      <ArrowRightIcon className="lp-quiet-arrow-right" />
    ) : (
      <ArrowVerticalIcon direction={direction} />
    );

  if (href) {
    return (
      <a href={href} className="lp-btn-quiet">
        <span>{children}</span>
        {icon}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} className="lp-btn-quiet">
      <span>{children}</span>
      {icon}
    </button>
  );
}
