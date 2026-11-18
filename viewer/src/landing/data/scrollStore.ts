/**
 * Single rAF-throttled scroll store for the landing page.
 * - Exposes Act III pinned progress `p` in [0, 1] via zero-React-render subscribers
 *   (so Three.js reads continuous progress at 60fps without triggering setState).
 * - Exposes discrete active act ('00'..'05') and discrete Act III frame (0..5)
 *   only when crossing boundaries.
 */

export type ActId = '00' | '01' | '02' | '03' | '04' | '05';

export interface ScrollStateSnapshot {
  act3Progress: number;
  act3Frame: number;
  activeAct: ActId;
}

type ProgressListener = (p: number) => void;
type FrameListener = (frame: number) => void;
type ActListener = (act: ActId) => void;

const ACT_IDS: ActId[] = ['00', '01', '02', '03', '04', '05'];

export function frameForProgress(p: number): number {
  if (p < 0.14) return 0;
  if (p < 0.28) return 1;
  if (p < 0.44) return 2;
  if (p < 0.62) return 3;
  if (p < 0.80) return 4;
  return 5;
}

export const FRAME_ANCHOR_PROGRESS = [0.06, 0.21, 0.36, 0.53, 0.71, 0.90] as const;

class LandingScrollStore {
  private act3Progress = 0;
  private act3Frame = 0;
  private activeAct: ActId = '00';
  private rafId: number | null = null;
  private mounted = false;

  private progressListeners = new Set<ProgressListener>();
  private frameListeners = new Set<FrameListener>();
  private actListeners = new Set<ActListener>();

  private act3TrackEl: HTMLElement | null = null;
  private manualOverrideProgress: number | null = null;

  public registerAct3Track(el: HTMLElement | null) {
    this.act3TrackEl = el;
    this.scheduleUpdate();
  }

  public getSnapshot(): ScrollStateSnapshot {
    return {
      act3Progress: this.act3Progress,
      act3Frame: this.act3Frame,
      activeAct: this.activeAct,
    };
  }

  public setManualFrame(frameIdx: number) {
    const clamped = Math.max(0, Math.min(5, frameIdx));
    const targetP = FRAME_ANCHOR_PROGRESS[clamped];

    // On desktop pinned mode, scroll the track so scroll position matches the frame
    const el = this.act3TrackEl;
    const isDesktop = window.innerWidth >= 1024;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (el && isDesktop && !reduced) {
      const rect = el.getBoundingClientRect();
      const topBar = 56;
      const trackTopDoc = rect.top + window.scrollY;
      const scrollable = Math.max(1, el.offsetHeight - (window.innerHeight - topBar));
      const targetScrollY = trackTopDoc - topBar + targetP * scrollable;
      window.scrollTo({ top: targetScrollY, behavior: 'smooth' });
      return;
    }

    this.manualOverrideProgress = targetP;
    this.commitProgress(targetP);
  }

  public subscribeProgress(fn: ProgressListener): () => void {
    this.progressListeners.add(fn);
    fn(this.act3Progress);
    return () => this.progressListeners.delete(fn);
  }

  public subscribeFrame(fn: FrameListener): () => void {
    this.frameListeners.add(fn);
    fn(this.act3Frame);
    return () => this.frameListeners.delete(fn);
  }

  public subscribeAct(fn: ActListener): () => void {
    this.actListeners.add(fn);
    fn(this.activeAct);
    return () => this.actListeners.delete(fn);
  }

  public mount(): () => void {
    if (this.mounted) return () => {};
    this.mounted = true;

    const onScroll = () => {
      this.manualOverrideProgress = null;
      this.scheduleUpdate();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    this.scheduleUpdate();

    return () => {
      this.mounted = false;
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    };
  }

  private scheduleUpdate() {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.measure();
    });
  }

  private measure() {
    // 1. Measure active act for top bar index
    const probeY = window.innerHeight * 0.34;
    let bestAct: ActId = '00';
    for (const id of ACT_IDS) {
      const section = document.getElementById(`act-${id}`);
      if (!section) continue;
      const r = section.getBoundingClientRect();
      if (r.top <= probeY) {
        bestAct = id;
      }
    }
    if (bestAct !== this.activeAct) {
      this.activeAct = bestAct;
      for (const fn of this.actListeners) fn(bestAct);
    }

    // 2. Measure Act III pinned scroll progress
    if (this.manualOverrideProgress !== null) {
      this.commitProgress(this.manualOverrideProgress);
      return;
    }

    const el = this.act3TrackEl;
    if (!el) return;
    const isDesktop = window.innerWidth >= 1024;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!isDesktop || reduced) return;

    const topBar = 56;
    const rect = el.getBoundingClientRect();
    const scrollable = Math.max(1, el.offsetHeight - (window.innerHeight - topBar));
    const raw = (topBar - rect.top) / scrollable;
    const clamped = Math.max(0, Math.min(1, raw));
    this.commitProgress(clamped);
  }

  private commitProgress(p: number) {
    if (Math.abs(p - this.act3Progress) > 0.0005) {
      this.act3Progress = p;
      for (const fn of this.progressListeners) fn(p);
    }
    const nextFrame = frameForProgress(p);
    if (nextFrame !== this.act3Frame) {
      this.act3Frame = nextFrame;
      for (const fn of this.frameListeners) fn(nextFrame);
    }
  }
}

export const scrollStore = new LandingScrollStore();
