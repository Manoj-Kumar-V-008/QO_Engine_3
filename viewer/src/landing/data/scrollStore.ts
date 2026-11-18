/**
 * Single rAF-throttled scroll store for the landing page.
 * - Exposes Act III pinned progress `p` in [0, 1] and full-document `pageProgress` in [0, 1]
 *   via zero-React-render subscribers (DOM refs & Three.js read at 60fps without setState).
 * - Exposes discrete active act ('00'..'05'), Act III frame (0..5), header scrolled state,
 *   and header surface ('void' | 'paper') ONLY when crossing boundaries.
 */

export type ActId = '00' | '01' | '02' | '03' | '04' | '05';
export type HeaderSurface = 'void' | 'paper';

export interface ScrollStateSnapshot {
  act3Progress: number;
  act3Frame: number;
  activeAct: ActId;
  pageProgress: number;
  scrolled: boolean;
  headerSurface: HeaderSurface;
}

type ProgressListener = (p: number) => void;
type FrameListener = (frame: number) => void;
type ActListener = (act: ActId) => void;
type ScrolledListener = (scrolled: boolean) => void;
type SurfaceListener = (surface: HeaderSurface) => void;

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

function readTopBarHeight(): number {
  const root = document.querySelector('.lp-root');
  if (root) {
    const raw = getComputedStyle(root).getPropertyValue('--topbar-h').trim();
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return window.innerWidth < 768 ? 52 : 56;
}

class LandingScrollStore {
  private act3Progress = 0;
  private act3Frame = 0;
  private activeAct: ActId = '00';
  private pageProgress = 0;
  private scrolled = false;
  private headerSurface: HeaderSurface = 'void';

  private rafId: number | null = null;
  private mounted = false;
  private cachedTopBarH = 56;

  private progressListeners = new Set<ProgressListener>();
  private pageProgressListeners = new Set<ProgressListener>();
  private frameListeners = new Set<FrameListener>();
  private actListeners = new Set<ActListener>();
  private scrolledListeners = new Set<ScrolledListener>();
  private surfaceListeners = new Set<SurfaceListener>();

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
      pageProgress: this.pageProgress,
      scrolled: this.scrolled,
      headerSurface: this.headerSurface,
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
      const topBar = this.cachedTopBarH || readTopBarHeight();
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

  public subscribePageProgress(fn: ProgressListener): () => void {
    this.pageProgressListeners.add(fn);
    fn(this.pageProgress);
    return () => this.pageProgressListeners.delete(fn);
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

  public subscribeScrolled(fn: ScrolledListener): () => void {
    this.scrolledListeners.add(fn);
    fn(this.scrolled);
    return () => this.scrolledListeners.delete(fn);
  }

  public subscribeHeaderSurface(fn: SurfaceListener): () => void {
    this.surfaceListeners.add(fn);
    fn(this.headerSurface);
    return () => this.surfaceListeners.delete(fn);
  }

  public mount(): () => void {
    if (this.mounted) return () => {};
    this.mounted = true;
    this.cachedTopBarH = readTopBarHeight();

    const onScroll = () => {
      this.manualOverrideProgress = null;
      this.scheduleUpdate();
    };
    const onResize = () => {
      this.cachedTopBarH = readTopBarHeight();
      this.manualOverrideProgress = null;
      this.scheduleUpdate();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    this.scheduleUpdate();

    return () => {
      this.mounted = false;
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
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
    const scrollY = window.scrollY;
    const innerH = window.innerHeight;
    const docH = document.documentElement.scrollHeight;
    const topBar = this.cachedTopBarH;

    // 1. Full-document progress [0, 1] (zero React re-renders)
    const maxScroll = Math.max(1, docH - innerH);
    const nextPageProgress = Math.max(0, Math.min(1, scrollY / maxScroll));
    if (Math.abs(nextPageProgress - this.pageProgress) > 0.0004) {
      this.pageProgress = nextPageProgress;
      for (const fn of this.pageProgressListeners) fn(nextPageProgress);
    }

    // 2. Scrolled threshold (emit only on transition)
    const nextScrolled = scrollY >= 24;
    if (nextScrolled !== this.scrolled) {
      this.scrolled = nextScrolled;
      for (const fn of this.scrolledListeners) fn(nextScrolled);
    }

    // 3. Measure active act & Paper surface inversion in a single read pass
    const probeY = innerH * 0.34;
    let bestAct: ActId = '00';
    let nextSurface: HeaderSurface = 'void';

    for (const id of ACT_IDS) {
      const section = document.getElementById(`act-${id}`);
      if (!section) continue;
      const r = section.getBoundingClientRect();
      if (r.top <= probeY) {
        bestAct = id;
      }
      if (id === '04' && r.top <= topBar && r.bottom > topBar) {
        nextSurface = 'paper';
      }
    }

    if (bestAct !== this.activeAct) {
      this.activeAct = bestAct;
      for (const fn of this.actListeners) fn(bestAct);
    }

    if (nextSurface !== this.headerSurface) {
      this.headerSurface = nextSurface;
      for (const fn of this.surfaceListeners) fn(nextSurface);
    }

    // 4. Measure Act III pinned scroll progress
    if (this.manualOverrideProgress !== null) {
      this.commitProgress(this.manualOverrideProgress);
      return;
    }

    const el = this.act3TrackEl;
    if (!el) return;
    const isDesktop = window.innerWidth >= 1024;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!isDesktop || reduced) return;

    const rect = el.getBoundingClientRect();
    const scrollable = Math.max(1, el.offsetHeight - (innerH - topBar));
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
