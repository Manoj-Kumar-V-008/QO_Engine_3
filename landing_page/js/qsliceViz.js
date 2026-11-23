/**
 * Interactive Temporal Slicing Canvas (Multi-Color Aurora Palette)
 */
(function () {
  const canvas = document.getElementById('qslice-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let currentMethod = 'qslice';
  let phase = 0;
  let hoverX = null;

  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    hoverX = ((e.clientX - rect.left) / rect.width) * canvas.width;
  });
  canvas.addEventListener('pointerleave', () => { hoverX = null; });

  const lanes = [
    { label: 'SVB  Svalbard', y: 62, color: '#34d399' },
    { label: 'KIR  Kiruna', y: 146, color: '#fbbf24' },
    { label: 'MAT  Matera', y: 230, color: '#38bdf8' }
  ];

  const schedules = {
    greedy: [
      { lane: 0, s: 0.06, e: 0.42, sat: 'S2A', type: 'lock', txt: 'S2A LOCKED (WHOLE PASS)' },
      { lane: 0, s: 0.28, e: 0.62, sat: 'S2B', type: 'clash', txt: 'DROPPED · SAME_ANTENNA' },
      { lane: 1, s: 0.14, e: 0.45, sat: 'S2A', type: 'clash', txt: 'DROPPED · SAME_SAT' },
      { lane: 1, s: 0.56, e: 0.88, sat: 'S2B', type: 'lock', txt: 'S2B LOCKED' },
      { lane: 2, s: 0.22, e: 0.54, sat: 'S2A', type: 'clash', txt: 'DROPPED · OVERLAP' },
      { lane: 2, s: 0.64, e: 0.92, sat: 'S2A', type: 'lock', txt: 'S2A LOCKED' }
    ],
    milp: [
      { lane: 0, s: 0.06, e: 0.42, sat: 'S2A', type: 'lock', txt: 'S2A ATOMIC BLOCK' },
      { lane: 0, s: 0.28, e: 0.62, sat: 'S2B', type: 'clash', txt: 'DROPPED · CANNOT SPLIT' },
      { lane: 1, s: 0.30, e: 0.64, sat: 'S2B', type: 'lock', txt: 'S2B ATOMIC BLOCK (+0.6%)' },
      { lane: 2, s: 0.22, e: 0.54, sat: 'S2A', type: 'clash', txt: 'DROPPED · SAME_SAT' },
      { lane: 2, s: 0.64, e: 0.92, sat: 'S2A', type: 'lock', txt: 'S2A ATOMIC BLOCK' }
    ],
    qslice: [
      { lane: 0, s: 0.06, e: 0.28, sat: 'S2A', type: 'slice', txt: 'S2A 15s SLICES (>30° PEAK)' },
      { lane: 0, s: 0.35, e: 0.62, sat: 'S2B', type: 'slice', txt: 'HANDOVER → S2B (120s SLEW)' },
      { lane: 1, s: 0.30, e: 0.48, sat: 'S2A', type: 'slice', txt: 'S2A MID-PASS HANDOFF' },
      { lane: 1, s: 0.64, e: 0.88, sat: 'S2B', type: 'slice', txt: 'S2B 15s SLICES' },
      { lane: 2, s: 0.50, e: 0.68, sat: 'S2A', type: 'slice', txt: 'S2A 560 MBPS CORE' },
      { lane: 2, s: 0.72, e: 0.95, sat: 'S2A', type: 'slice', txt: 'S2A BUFFER DRAINED' }
    ]
  };

  function render() {
    phase += 0.0038;
    const W = canvas.width, H = canvas.height;
    const padL = 156, padR = 26, span = W - padL - padR;

    ctx.clearRect(0, 0, W, H);

    const steps = 44;
    for (let i = 0; i <= steps; i++) {
      const x = padL + (i / steps) * span;
      ctx.strokeStyle = currentMethod === 'qslice' ? 'rgba(52, 211, 153, 0.1)' : 'rgba(255, 255, 255, 0.045)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, 26); ctx.lineTo(x, H - 22); ctx.stroke();
    }

    ctx.fillStyle = '#78849a';
    ctx.font = '500 11px "JetBrains Mono", monospace';
    ctx.fillText('GROUND DISH', 20, 24);
    ctx.fillText(
      currentMethod === 'qslice'
        ? '15-SECOND Q-SLICE TIMELINE — MOVE CURSOR TO INSPECT HANDOVERS'
        : 'WHOLE-PASS TIMELINE — OVERLAPPING PASSES COLLIDE & DROP',
      padL, 24
    );

    lanes.forEach((ln) => {
      ctx.fillStyle = ln.color;
      ctx.font = '500 12px "JetBrains Mono", monospace';
      ctx.fillText(ln.label, 20, ln.y + 26);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(padL, ln.y, span, 44, 9); ctx.fill(); ctx.stroke();
    });

    const items = schedules[currentMethod] || schedules.qslice;
    items.forEach((b) => {
      const ln = lanes[b.lane];
      const x = padL + b.s * span;
      const w = (b.e - b.s) * span;
      const y = ln.y + 6, h = 32;

      if (b.type === 'clash') {
        const pulse = 0.2 + 0.14 * Math.sin(phase * 14);
        ctx.fillStyle = `rgba(251, 113, 133, ${pulse})`;
        ctx.strokeStyle = '#fb7185';
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.roundRect(x, y, w, h, 7); ctx.fill(); ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#fecdd3';
        ctx.font = '500 10px "JetBrains Mono", monospace';
        ctx.fillText(b.txt, x + 9, y + 20);
      } else if (b.type === 'slice') {
        const count = Math.max(5, Math.floor(w / 14));
        const sw = w / count;
        const rgb = b.sat === 'S2A' ? [56, 189, 248] : [192, 132, 252];

        for (let i = 0; i < count; i++) {
          const sx = x + i * sw + 1;
          const elev = Math.sin(((i + 0.5) / count) * Math.PI);
          const a = 0.3 + elev * 0.56;
          ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a.toFixed(2)})`;
          ctx.beginPath(); ctx.roundRect(sx, y, Math.max(4, sw - 2.6), h, 3); ctx.fill();
        }
        ctx.strokeStyle = b.sat === 'S2A' ? '#38bdf8' : '#c084fc';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(x, y, w, h, 7); ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.font = '500 10px "JetBrains Mono", monospace';
        ctx.fillText(b.txt, x + 9, y + 20);
      } else {
        const isA = b.sat === 'S2A';
        ctx.fillStyle = isA ? 'rgba(56, 189, 248, 0.22)' : 'rgba(192, 132, 252, 0.22)';
        ctx.strokeStyle = isA ? '#38bdf8' : '#c084fc';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.roundRect(x, y, w, h, 7); ctx.fill(); ctx.stroke();

        ctx.fillStyle = '#f1f5f9';
        ctx.font = '500 10px "JetBrains Mono", monospace';
        ctx.fillText(b.txt, x + 9, y + 20);
      }
    });

    const playX = (hoverX !== null && hoverX >= padL && hoverX <= W - padR)
      ? hoverX
      : padL + ((phase * 0.42) % 1) * span;

    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(playX, 34); ctx.lineTo(playX, H - 16); ctx.stroke();

    requestAnimationFrame(render);
  }

  window.QO3QSliceViz = { setMethod(m) { currentMethod = m; } };
  requestAnimationFrame(render);
})();
