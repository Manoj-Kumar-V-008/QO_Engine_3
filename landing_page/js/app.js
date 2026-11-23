/**
 * Quantum Orbit Engine 3 — Satellite & Antenna Click Bursts, Magnetic Cursor, 3D Tilt & Logic
 */
(function () {
  // 1. Boot Preloader
  const preloader = document.getElementById('preloader');
  const preFill = document.getElementById('pre-fill');
  const preStatus = document.getElementById('pre-status');

  const steps = [
    { pct: 38, txt: 'SYNCING SENTINEL-2 TLE...' },
    { pct: 76, txt: 'LOCKING SVB · KIR · MAT...' },
    { pct: 100, txt: 'ORBITAL ENGINE ONLINE' }
  ];
  let stepI = 0;
  const bootTimer = setInterval(() => {
    if (stepI < steps.length) {
      if (preFill) preFill.style.width = `${steps[stepI].pct}%`;
      if (preStatus) preStatus.textContent = steps[stepI].txt;
      stepI++;
    } else {
      clearInterval(bootTimer);
      setTimeout(() => {
        if (preloader) preloader.classList.add('done');
        document.body.classList.add('ready');
      }, 160);
    }
  }, 220);

  // 2. Satellite & Antenna Animated Click Burst (Alternates Flying Satellite & Radar Dish Ping)
  const satClickSVG = `
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M13 7 9 3 5 7l4 4"/><path d="m17 11 4 4-4 4-4-4"/><path d="m8 12 4 4 6-6-4-4Z"/><path d="m16 8 3-3"/><path d="M9 21a6 6 0 0 0-6-6" stroke="#34d399"/>
    </svg>`;
  const dishClickSVG = `
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 10a7.31 7.31 0 0 0 10 10Z"/><path d="m9 15 3-3"/><path d="M17 13a6 6 0 0 0-6-6" stroke="#c084fc"/><path d="M21 13A10 10 0 0 0 11 3" stroke="#fbbf24"/>
    </svg>`;

  let clickCount = 0;
  document.addEventListener('pointerdown', (e) => {
    clickCount++;
    const wrap = document.createElement('div');
    wrap.className = 'click-burst-wrap';
    wrap.style.left = `${e.clientX}px`;
    wrap.style.top = `${e.clientY}px`;

    const r1 = document.createElement('span');
    r1.className = 'click-ring';
    const r2 = document.createElement('span');
    r2.className = 'click-ring r2';

    const icon = document.createElement('span');
    icon.className = 'click-fly-icon';
    const angle = (Math.random() * Math.PI * 0.7) - Math.PI * 0.85; // Flies upward-right or upward-left
    const dist = 42 + Math.random() * 18;
    icon.style.setProperty('--tx', `${Math.cos(angle) * dist}px`);
    icon.style.setProperty('--ty', `${Math.sin(angle) * dist}px`);
    icon.innerHTML = (clickCount % 2 === 0) ? dishClickSVG : satClickSVG;

    wrap.appendChild(r1);
    wrap.appendChild(r2);
    wrap.appendChild(icon);
    document.body.appendChild(wrap);
    setTimeout(() => wrap.remove(), 880);
  });

  // 3. Magnetic Orbital Cursor & Multi-Tone Trail
  const dot = document.getElementById('cursor-dot');
  const ring = document.getElementById('cursor-ring');
  const label = document.getElementById('cursor-label');
  const trailCanvas = document.getElementById('cursor-trail');
  const finePointer = window.matchMedia('(pointer: fine)').matches;

  if (finePointer && dot && ring && trailCanvas) {
    const tctx = trailCanvas.getContext('2d');
    const resizeTrail = () => {
      trailCanvas.width = window.innerWidth;
      trailCanvas.height = window.innerHeight;
    };
    resizeTrail();
    window.addEventListener('resize', resizeTrail);

    let mx = window.innerWidth / 2, my = window.innerHeight / 2;
    let rx = mx, ry = my;
    const trail = [];

    window.addEventListener('pointermove', (e) => {
      mx = e.clientX; my = e.clientY;
      dot.style.left = `${mx}px`;
      dot.style.top = `${my}px`;
      trail.push({ x: mx, y: my, alpha: 0.72 });
      if (trail.length > 16) trail.shift();
    });

    function animateCursor() {
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      ring.style.left = `${rx}px`;
      ring.style.top = `${ry}px`;

      tctx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
      for (let i = 1; i < trail.length; i++) {
        const p0 = trail[i - 1], p1 = trail[i];
        p1.alpha *= 0.88;
        const t = i / trail.length;
        // Smooth Amber -> Violet -> Emerald trail gradient
        const r = Math.round(251 * (1 - t) + 52 * t);
        const g = Math.round(191 * (1 - t) + 211 * t);
        const b = Math.round(36 * (1 - t) + 153 * t);
        tctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${(p1.alpha * 0.45).toFixed(3)})`;
        tctx.lineWidth = t * 2.3;
        tctx.beginPath(); tctx.moveTo(p0.x, p0.y); tctx.lineTo(p1.x, p1.y); tctx.stroke();
      }
      requestAnimationFrame(animateCursor);
    }
    requestAnimationFrame(animateCursor);

    document.querySelectorAll('[data-cursor]').forEach((el) => {
      el.addEventListener('mouseenter', () => {
        ring.classList.add('active');
        if (label) label.textContent = el.dataset.cursor;
      });
      el.addEventListener('mouseleave', () => {
        ring.classList.remove('active');
        if (label) label.textContent = '';
      });
    });

    document.querySelectorAll('.magnetic').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) * 0.2;
        const dy = (e.clientY - (r.top + r.height / 2)) * 0.2;
        el.style.transform = `translate(${dx}px, ${dy}px)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = 'translate(0px, 0px)'; });
    });
  }

  // 4. 3D Perspective Tilt + Spotlight
  document.querySelectorAll('.tilt-card').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      card.style.setProperty('--mx', `${x}px`);
      card.style.setProperty('--my', `${y}px`);
      const rotY = ((x / r.width) - 0.5) * 8;
      const rotX = -((y / r.height) - 0.5) * 8;
      card.style.transform = `perspective(900px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateY(-2px)`;
    });
    card.addEventListener('pointerleave', () => {
      card.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) translateY(0px)';
    });
  });

  // 5. Scroll Reveals & Camera Choreography
  const revealObs = new IntersectionObserver(
    (entries) => entries.forEach((en) => { if (en.isIntersecting) en.target.classList.add('visible'); }),
    { threshold: 0.14 }
  );
  document.querySelectorAll('.reveal-up').forEach((el) => revealObs.observe(el));

  const camObs = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting && window.QO3Scene) window.QO3Scene.setCameraPreset(en.target.dataset.camera);
      });
    },
    { threshold: 0.38 }
  );
  document.querySelectorAll('section[data-camera]').forEach((sec) => camObs.observe(sec));

  // 6. Live Memory Buffer Overflow Simulator
  let simMode = 'greedy', s2a = 248, s2b = 175;
  const s2aBar = document.getElementById('sim-s2a-bar');
  const s2bBar = document.getElementById('sim-s2b-bar');
  const s2aVal = document.getElementById('sim-s2a-val');
  const s2bVal = document.getElementById('sim-s2b-val');
  const simTag = document.getElementById('sim-status-tag');
  const simCap = document.getElementById('sim-caption');

  document.querySelectorAll('#problem-sim-toggle .switch-opt').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#problem-sim-toggle .switch-opt').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      simMode = btn.dataset.sim;
      if (simCap) {
        simCap.innerHTML = simMode === 'qslice'
          ? '<strong>Q-Slice mode:</strong> Both satellites hand off mid-pass at 560 Mbps, draining memory well below the 300 GB limit.'
          : '<strong>Greedy mode:</strong> S2A waits for a busy antenna, hits 300 GB, and permanently erases incoming Earth imagery.';
      }
      if (window.QO3Scene) window.QO3Scene.setMode(simMode);
    });
  });

  setInterval(() => {
    if (simMode === 'greedy') {
      s2a = Math.min(300, s2a + 4.4);
      s2b = Math.min(300, s2b + 2.9);
      if (s2a >= 300 && s2b >= 295) { s2a = 250; s2b = 175; }
    } else {
      s2a = Math.max(46, s2a - 6.8);
      s2b = Math.max(38, s2b - 5.4);
      if (s2a <= 50 && s2b <= 42) { s2a = 180; s2b = 148; }
    }
    if (s2aBar) s2aBar.style.width = `${(s2a / 300) * 100}%`;
    if (s2bBar) s2bBar.style.width = `${(s2b / 300) * 100}%`;
    if (s2aVal) s2aVal.textContent = `${Math.round(s2a)} / 300 GB`;
    if (s2bVal) s2bVal.textContent = `${Math.round(s2b)} / 300 GB`;
    if (simTag) {
      const spill = s2a >= 298 || s2b >= 298;
      simTag.textContent = spill ? 'SPILL' : 'DRAIN';
      simTag.className = `sim-state mono ${spill ? 'state-spill' : 'state-drain'}`;
    }
  }, 170);

  // 7. Q-Slice Workbench Algorithm Switcher
  const methods = {
    greedy: {
      lift: 'BASELINE · 1,708.6 GB LOST',
      desc: '<strong>Greedy Heuristic:</strong> Locks a ground dish for the entire 10-minute pass. Any overlapping pass over Svalbard, Kiruna, or Matera is completely dropped, causing heavy memory overflow.',
      del: '691.4 GB', lost: '1,708.6 GB', passes: '30 passes'
    },
    milp: {
      lift: '+4.4 GB / DAY (+0.6%)',
      desc: '<strong>Whole-Pass Binary MILP:</strong> Optimizes which full passes to keep, but still treats each pass as an indivisible block—recovering only +4.4 GB over Greedy.',
      del: '695.8 GB', lost: '1,704.2 GB', passes: '30 passes'
    },
    qslice: {
      lift: '+307.8 GB SAVED / DAY',
      desc: '<strong>How Q-Slice wins:</strong> Cuts overlapping European passes into 15-second quanta and runs a joint dynamic-programming solver. Downloads at peak <strong>560 Mbps</strong> inside the 30° sky cone while obeying real <strong>120s dish-slew</strong> and <strong>15s radio re-lock</strong> physics.',
      del: '999.2 GB', lost: '1,400.8 GB', passes: '56 slices'
    }
  };

  document.querySelectorAll('.algo-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const m = btn.dataset.method, d = methods[m];
      if (!d) return;
      document.querySelectorAll('.algo-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('qslice-lift-badge').textContent = d.lift;
      document.getElementById('method-description').innerHTML = d.desc;
      document.getElementById('m-delivered').textContent = d.del;
      document.getElementById('m-lost').textContent = d.lost;
      document.getElementById('m-passes').textContent = d.passes;
      if (window.QO3QSliceViz) window.QO3QSliceViz.setMethod(m);
      if (window.QO3Scene) window.QO3Scene.setMode(m);
    });
  });

  // 8. Constellation Hover-to-Fly & What-If Presets
  document.querySelectorAll('.interactive-node').forEach((card) => {
    const fly = () => { if (window.QO3Scene) window.QO3Scene.focusNode(card.dataset.focus); };
    card.addEventListener('mouseenter', fly);
    card.addEventListener('click', fly);
  });

  const presets = {
    base: { val: 999.2, pct: 55, over: '1,400.8 GB', lift: 'Baseline Q-Slice', ms: '118 MS SOLVE', note: 'With only 3 European dishes, satellites still cross the Pacific and Southern Hemisphere with full memory buffers.' },
    inuvik: { val: 1742.6, pct: 94, over: '112.4 GB', lift: '+743.4 GB (+74.4%)', ms: '154 MS SOLVE', note: 'Adding Inuvik (Arctic Canada) catches polar passes on the opposite side of the Arctic Circle, cutting overflow by 92%.' },
    mcmurdo: { val: 1818.0, pct: 100, over: '0.0 GB', lift: '+818.8 GB (+81.9%)', ms: '168 MS SOLVE', note: 'McMurdo (Antarctica) drains memory at the South Pole before satellites climb north—wiping out overflow completely.' },
    bengaluru: { val: 1426.5, pct: 79, over: '584.0 GB', lift: '+427.3 GB (+42.8%)', ms: '141 MS SOLVE', note: 'Bengaluru (India) breaks up the long Indo-Pacific coverage gap with mid-orbit relief over Asia.' }
  };

  let currentWiVal = 999.2;
  function tweenDelivered(target) {
    const el = document.getElementById('wi-delivered');
    if (!el) return;
    const start = currentWiVal, t0 = performance.now(), dur = 480;
    function step(now) {
      const p = Math.min(1, (now - t0) / dur);
      const ease = 1 - Math.pow(1 - p, 3);
      const v = start + (target - start) * ease;
      el.textContent = `${v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} GB`;
      if (p < 1) requestAnimationFrame(step);
      else currentWiVal = target;
    }
    requestAnimationFrame(step);
  }

  document.querySelectorAll('#whatif-presets .preset-tile').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#whatif-presets .preset-tile').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const key = btn.dataset.preset, d = presets[key];
      if (!d) return;
      tweenDelivered(d.val);
      document.getElementById('wi-bar').style.width = `${d.pct}%`;
      document.getElementById('wi-overflow').textContent = d.over;
      document.getElementById('wi-lift').textContent = d.lift;
      document.getElementById('wi-solve-time').textContent = d.ms;
      document.getElementById('wi-note').textContent = d.note;
      if (window.QO3Scene) window.QO3Scene.setExtraStation(key);
    });
  });
})();

/* =========================================================
   V5: 2-SECOND IDLE CURSOR -> MINI EARTH + REVOLVING SATELLITES
   ========================================================= */
(function () {
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  const dot = document.getElementById('cursor-dot');
  const ring = document.getElementById('cursor-ring');
  if (!finePointer || !dot || !ring) return;

  let idleTimeout = null;
  let pointerInWindow = true;

  function clearIdleEarth() {
    dot.classList.remove('idle-earth');
    ring.classList.remove('idle-earth');
    if (idleTimeout) clearTimeout(idleTimeout);
    if (pointerInWindow) {
      idleTimeout = setTimeout(() => {
        if (!ring.classList.contains('dragging')) {
          dot.classList.add('idle-earth');
          ring.classList.add('idle-earth');
        }
      }, 2000);
    }
  }

  window.addEventListener('pointermove', () => {
    pointerInWindow = true;
    clearIdleEarth();
  });
  window.addEventListener('pointerdown', clearIdleEarth);
  window.addEventListener('scroll', clearIdleEarth, { passive: true });
  document.addEventListener('mouseleave', () => {
    pointerInWindow = false;
    dot.classList.remove('idle-earth');
    ring.classList.remove('idle-earth');
    if (idleTimeout) clearTimeout(idleTimeout);
  });

  // Start initial 2s timer in case user lands and pauses immediately
  clearIdleEarth();
})();

/* =========================================================
   V5: AMBIENT HEADER & WEBPAGE COMETS + ROAMING SATELLITES
   ========================================================= */
(function () {
  const canvas = document.getElementById('ambient-cosmos-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W = window.innerWidth;
  let H = window.innerHeight;
  const resize = () => {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  };
  resize();
  window.addEventListener('resize', resize);

  const cometPalette = [
    { head: '#fef3c7', tail: '251, 191, 36' },  // Solar Gold
    { head: '#e0f2fe', tail: '56, 189, 248' },  // Orbital Cyan
    { head: '#f3e8ff', tail: '192, 132, 252' }, // Ion Violet
    { head: '#d1fae5', tail: '52, 211, 153' }   // Signal Emerald
  ];

  const comets = [];

  function spawnComet(nearHeader) {
    const col = cometPalette[Math.floor(Math.random() * cometPalette.length)];
    const fromLeft = Math.random() > 0.35;
    let x, y, vx, vy;

    if (nearHeader) {
      // Skims gracefully across the header zone
      x = fromLeft ? -40 : W + 40;
      y = 14 + Math.random() * 88;
      const speed = 3.2 + Math.random() * 2.8;
      vx = fromLeft ? speed : -speed;
      vy = (Math.random() - 0.42) * 0.65;
    } else {
      // Streaks diagonally across random regions of the webpage
      x = fromLeft ? -40 : W + 40;
      y = Math.random() * H * 0.78;
      const speed = 4.2 + Math.random() * 3.8;
      vx = fromLeft ? speed : -speed;
      vy = 0.8 + Math.random() * 2.1;
    }

    comets.push({
      x, y, vx, vy,
      len: nearHeader ? 68 + Math.random() * 44 : 88 + Math.random() * 64,
      size: nearHeader ? 1.8 : 2.2,
      col,
      alpha: 0,
      life: 0,
      maxLife: 240
    });
  }

  // Roaming Micro-Satellites (2 gliding near header, 2 cruising across webpage)
  const roamers = [
    { x: W * 0.15, y: 54, vx: 0.55, vy: 0.08, angle: 0.15, color: '#38bdf8', zone: 'header', trail: [] },
    { x: W * 0.82, y: 82, vx: -0.48, vy: -0.05, angle: -0.1, color: '#c084fc', zone: 'header', trail: [] },
    { x: W * 0.25, y: H * 0.42, vx: 0.42, vy: -0.18, angle: -0.35, color: '#fbbf24', zone: 'page', trail: [] },
    { x: W * 0.75, y: H * 0.72, vx: -0.38, vy: -0.14, angle: 0.3, color: '#34d399', zone: 'page', trail: [] }
  ];

  // Initial welcome comet across the header
  setTimeout(() => spawnComet(true), 900);
  setInterval(() => {
    if (comets.length < 4) spawnComet(Math.random() < 0.52);
  }, 2400);

  function drawMicroSatellite(s, t) {
    // Faint dashed orbital wake
    if (s.trail.length > 2) {
      ctx.save();
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(s.trail[0].x, s.trail[0].y);
      for (let i = 1; i < s.trail.length; i++) ctx.lineTo(s.trail[i].x, s.trail[i].y);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(Math.atan2(s.vy, s.vx) + Math.sin(t * 1.4) * 0.08);

    // Solar panels
    ctx.fillStyle = s.color;
    ctx.globalAlpha = 0.78;
    ctx.fillRect(-9, -2, 5.5, 4);
    ctx.fillRect(3.5, -2, 5.5, 4);

    // Spacecraft core bus
    ctx.fillStyle = '#f8fafc';
    ctx.globalAlpha = 0.95;
    ctx.fillRect(-2.5, -2.5, 5, 5);

    // Blinking transponder beacon
    const blink = 0.45 + 0.55 * Math.sin(t * 5.5 + s.x * 0.02);
    ctx.beginPath();
    ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = s.color;
    ctx.globalAlpha = blink * 0.22;
    ctx.fill();

    ctx.restore();
  }

  function tick(now) {
    requestAnimationFrame(tick);
    const t = now * 0.001;
    ctx.clearRect(0, 0, W, H);

    // Update & draw comets
    for (let i = comets.length - 1; i >= 0; i--) {
      const c = comets[i];
      c.x += c.vx;
      c.y += c.vy;
      c.life++;
      c.alpha = Math.min(1, c.life / 18) * Math.max(0, 1 - c.life / c.maxLife);

      const speed = Math.hypot(c.vx, c.vy) || 1;
      const tailX = c.x - (c.vx / speed) * c.len;
      const tailY = c.y - (c.vy / speed) * c.len;

      const grad = ctx.createLinearGradient(c.x, c.y, tailX, tailY);
      grad.addColorStop(0, `rgba(${c.col.tail}, ${(c.alpha * 0.92).toFixed(3)})`);
      grad.addColorStop(0.45, `rgba(${c.col.tail}, ${(c.alpha * 0.35).toFixed(3)})`);
      grad.addColorStop(1, `rgba(${c.col.tail}, 0)`);

      ctx.strokeStyle = grad;
      ctx.lineWidth = c.size;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();

      // Bright comet coma head
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.size * 1.15, 0, Math.PI * 2);
      ctx.fillStyle = c.col.head;
      ctx.globalAlpha = c.alpha;
      ctx.fill();
      ctx.globalAlpha = 1;

      if (c.life >= c.maxLife || c.x < -160 || c.x > W + 160 || c.y < -120 || c.y > H + 120) {
        comets.splice(i, 1);
      }
    }

    // Update & draw roaming micro-satellites
    roamers.forEach((s) => {
      s.x += s.vx;
      s.y += s.vy + Math.sin(t * 0.9 + s.x * 0.008) * 0.14;

      if (s.zone === 'header') {
        if (s.x > W + 30) { s.x = -30; s.y = 24 + Math.random() * 76; s.trail = []; }
        if (s.x < -30) { s.x = W + 30; s.y = 24 + Math.random() * 76; s.trail = []; }
        s.y = Math.max(16, Math.min(115, s.y));
      } else {
        if (s.x > W + 30) { s.x = -30; s.y = 140 + Math.random() * (H - 220); s.trail = []; }
        if (s.x < -30) { s.x = W + 30; s.y = 140 + Math.random() * (H - 220); s.trail = []; }
        if (s.y < 120) s.vy = Math.abs(s.vy);
        if (s.y > H - 60) s.vy = -Math.abs(s.vy);
      }

      if (Math.floor(now / 50) % 2 === 0) {
        s.trail.push({ x: s.x, y: s.y });
        if (s.trail.length > 26) s.trail.shift();
      }

      drawMicroSatellite(s, t);
    });
  }

  requestAnimationFrame(tick);
})();
