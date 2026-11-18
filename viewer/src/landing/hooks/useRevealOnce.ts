import { useEffect, useState, type RefObject } from 'react';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * One-shot viewport reveal hook.
 * - Initializes synchronously to `true` when `prefers-reduced-motion: reduce` is active
 *   so charts and checkmarks never flash blank.
 * - Uses a single IntersectionObserver that disconnects immediately on first intersection.
 */
export function useRevealOnce<T extends Element>(
  ref: RefObject<T | null>,
  threshold = 0.22
): boolean {
  const [revealed, setRevealed] = useState<boolean>(() => prefersReducedMotion());

  useEffect(() => {
    if (revealed) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setRevealed(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setRevealed(true);
          io.disconnect();
        }
      },
      { threshold }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [ref, threshold, revealed]);

  return revealed;
}
