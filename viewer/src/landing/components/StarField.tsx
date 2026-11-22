/**
 * StarField — procedural animated particle background for the hero.
 * Pure CSS animation, no Three.js overhead, runs in its own canvas.
 */
import { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  r: number;
  alpha: number;
  speed: number;
  flicker: number;
  flickerOffset: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  alpha: number;
  life: number;
  maxLife: number;
  color: string;
}

const ORBIT_COLORS = ['#5bd6e6', '#f0a43c', '#45d6a0', '#eef2f6'];

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export default function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let inView = true;
    let tabVisible = !document.hidden;
    let t = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    // Build static star field
    const STAR_COUNT = 320;
    const stars: Star[] = Array.from({ length: STAR_COUNT }, () => ({
      x: rand(0, 1),
      y: rand(0, 1),
      r: rand(0.4, 1.8),
      alpha: rand(0.15, 0.85),
      speed: rand(0.00002, 0.00008),
      flicker: rand(0.4, 2.0),
      flickerOffset: rand(0, Math.PI * 2),
    }));

    // Dust particles flowing from right to left (simulating orbit motion)
    const particles: Particle[] = [];
    const spawnParticle = (w: number, h: number) => {
      const color = ORBIT_COLORS[Math.floor(Math.random() * ORBIT_COLORS.length)];
      particles.push({
        x: rand(0, w),
        y: rand(0, h),
        vx: rand(-0.08, -0.015),
        vy: rand(-0.025, 0.025),
        r: rand(0.8, 2.4),
        alpha: rand(0.1, 0.5),
        life: 0,
        maxLife: rand(120, 380),
        color,
      });
    };

    // Orbital ring params (drawn as ellipses, animated rotation)
    const RINGS = [
      { cx: 0.72, cy: 0.4, rx: 0.26, ry: 0.08, angle: -0.48, alpha: 0.07, speed: 0.00015 },
      { cx: 0.65, cy: 0.52, rx: 0.32, ry: 0.10, angle: -0.28, alpha: 0.05, speed: 0.00010 },
      { cx: 0.78, cy: 0.35, rx: 0.18, ry: 0.055, angle: -0.65, alpha: 0.09, speed: 0.00022 },
    ];

    let prevT = performance.now();

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!inView || !tabVisible) {
        prevT = now;
        return;
      }

      const dt = Math.min(32, now - prevT);
      prevT = now;
      t += dt;

      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      if (W === 0 || H === 0) return;

      ctx.clearRect(0, 0, W, H);

      // ── stars ─────────────────────────────────────────────────────────────
      for (const s of stars) {
        const flicker = 0.5 + 0.5 * Math.sin(t * 0.001 * s.flicker + s.flickerOffset);
        const a = s.alpha * (0.65 + 0.35 * flicker);
        ctx.beginPath();
        ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(238,242,246,${a.toFixed(3)})`;
        ctx.fill();
        // drift very slowly
        s.x -= s.speed * dt;
        if (s.x < -0.01) s.x = 1.01;
      }

      // ── orbital rings ─────────────────────────────────────────────────────
      for (const ring of RINGS) {
        ring.angle += ring.speed * dt;
        ctx.save();
        ctx.translate(ring.cx * W, ring.cy * H);
        ctx.rotate(ring.angle);
        ctx.beginPath();
        ctx.ellipse(0, 0, ring.rx * W, ring.ry * H, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(91,214,230,${ring.alpha})`;
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 14]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      // ── dust particles ────────────────────────────────────────────────────
      if (Math.random() < 0.18) spawnParticle(W, H);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life++;
        const lifeRatio = p.life / p.maxLife;
        const fade = lifeRatio < 0.15
          ? lifeRatio / 0.15
          : lifeRatio > 0.75
            ? 1 - (lifeRatio - 0.75) / 0.25
            : 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        // Extract hex color to rgba
        const hex = p.color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        ctx.fillStyle = `rgba(${r},${g},${b},${(p.alpha * fade).toFixed(3)})`;
        ctx.fill();

        if (p.life >= p.maxLife || p.x < -10 || p.x > W + 10 || p.y < -10 || p.y > H + 10) {
          particles.splice(i, 1);
        }
      }
    };

    raf = requestAnimationFrame(draw);

    const io = new IntersectionObserver(
      (entries) => { inView = entries[0]?.isIntersecting ?? true; },
      { rootMargin: '100px' }
    );
    io.observe(canvas);

    const onVis = () => { tabVisible = !document.hidden; };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
      io.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="q-starfield"
      aria-hidden="true"
    />
  );
}
