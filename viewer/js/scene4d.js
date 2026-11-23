/**
 * Quantum Orbit Engine 3 — Multi-Satellite 3D/4D WebGL Orbital Engine (Aurora Palette)
 * - Sentinel-2A (Cyan) & Sentinel-2B (Violet) + 4 extra LEO constellation satellites (Amber/Teal/Silver)
 * - Ground stations SVB (Emerald), KIR (Amber), MAT (Cyan) with animated radar rings
 * - Click-triggered orbital pulse shockwave inside the 3D scene
 * - Background 4D Tesseract in subtle violet/cyan
 */
(function () {
  const canvas = document.getElementById('orbital-canvas');
  if (!canvas || typeof THREE === 'undefined') return;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 220);
  camera.position.set(0, 0.3, 5.4);

  scene.add(new THREE.AmbientLight(0x475569, 1.35));
  const sun = new THREE.DirectionalLight(0xfffbeb, 2.35); // Warm solar sunlight
  sun.position.set(9, 4, 7);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0xc084fc, 1.25); // Violet nebula rim light
  rim.position.set(-7, -3, -5);
  scene.add(rim);

  // Multi-tint Starfield (white, warm gold, soft violet, pale cyan)
  const starGeo = new THREE.BufferGeometry();
  const starCount = 2200;
  const starPos = new Float32Array(starCount * 3);
  const starCols = new Float32Array(starCount * 3);
  const palette = [
    [0.96, 0.97, 1.0],
    [0.98, 0.78, 0.32],
    [0.75, 0.55, 0.98],
    [0.35, 0.85, 0.72]
  ];
  for (let i = 0; i < starCount; i++) {
    const r = 18 + Math.random() * 48;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    starPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    starPos[i * 3 + 1] = r * Math.cos(ph);
    starPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    const c = palette[i % palette.length];
    starCols[i * 3] = c[0]; starCols[i * 3 + 1] = c[1]; starCols[i * 3 + 2] = c[2];
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starCols, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ size: 0.08, vertexColors: true, transparent: true, opacity: 0.72 })
  );
  scene.add(stars);

  // 4D Tesseract in Deep Space (Soft Violet)
  const tVerts = [];
  for (let i = 0; i < 16; i++) tVerts.push([(i & 1) ? 1 : -1, (i & 2) ? 1 : -1, (i & 4) ? 1 : -1, (i & 8) ? 1 : -1]);
  const tEdges = [];
  for (let i = 0; i < 16; i++) {
    for (let j = i + 1; j < 16; j++) {
      let d = 0;
      for (let k = 0; k < 4; k++) if (tVerts[i][k] !== tVerts[j][k]) d++;
      if (d === 1) tEdges.push([i, j]);
    }
  }
  const tGeo = new THREE.BufferGeometry();
  tGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tEdges.length * 6), 3));
  const tesseract = new THREE.LineSegments(
    tGeo,
    new THREE.LineBasicMaterial({ color: 0xc084fc, transparent: true, opacity: 0.12 })
  );
  scene.add(tesseract);

  function updateTesseract(t) {
    const a = t * 0.24, b = t * 0.16;
    const cA = Math.cos(a), sA = Math.sin(a), cB = Math.cos(b), sB = Math.sin(b);
    const proj = tVerts.map(([x, y, z, w]) => {
      const x1 = x * cA - w * sA, w1 = x * sA + w * cA;
      const y1 = y * cB - w1 * sB, w2 = y * sB + w1 * cB;
      const sc = 3.2 / (3.4 - w2);
      return [x1 * sc * 2.55, y1 * sc * 2.55, z * sc * 2.55];
    });
    const arr = tGeo.attributes.position.array;
    let idx = 0;
    for (let e = 0; e < tEdges.length; e++) {
      const p1 = proj[tEdges[e][0]], p2 = proj[tEdges[e][1]];
      arr[idx++] = p1[0]; arr[idx++] = p1[1]; arr[idx++] = p1[2];
      arr[idx++] = p2[0]; arr[idx++] = p2[1]; arr[idx++] = p2[2];
    }
    tGeo.attributes.position.needsUpdate = true;
  }

  // Earth Group
  const worldGroup = new THREE.Group();
  worldGroup.position.set(1.25, -0.05, 0);
  scene.add(worldGroup);

  const EARTH_R = 1.62;

  function createEarthTexture() {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 512;
    const ctx = c.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#070a14');
    grad.addColorStop(0.5, '#0e1528');
    grad.addColorStop(1, '#070a14');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 512);

    ctx.strokeStyle = 'rgba(192, 132, 252, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= 1024; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke(); }
    for (let y = 0; y <= 512; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1024, y); ctx.stroke(); }

    const continents = [
      [[515, 92], [562, 70], [608, 86], [616, 146], [560, 166], [512, 144]],
      [[498, 174], [588, 174], [622, 242], [586, 350], [532, 348], [488, 242]],
      [[612, 84], [798, 92], [848, 168], [796, 248], [692, 254], [626, 196]],
      [[135, 82], [312, 92], [332, 172], [258, 218], [172, 186]],
      [[274, 234], [358, 256], [342, 378], [292, 398], [258, 306]],
      [[786, 294], [868, 300], [876, 358], [800, 362]],
      [[0, 458], [1024, 458], [1024, 512], [0, 512]]
    ];

    ctx.fillStyle = 'rgba(26, 38, 62, 0.92)';
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.45)';
    ctx.lineWidth = 1.6;
    continents.forEach((poly) => {
      ctx.beginPath();
      poly.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });

    // Warm golden city-light clusters
    [[555, 118], [568, 132], [540, 128], [720, 210], [748, 198], [795, 165], [255, 145], [285, 155], [318, 305]].forEach(([hx, hy]) => {
      const g = ctx.createRadialGradient(hx, hy, 1, hx, hy, 15);
      g.addColorStop(0, 'rgba(251, 191, 36, 0.85)');
      g.addColorStop(0.5, 'rgba(251, 191, 36, 0.22)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(hx, hy, 15, 0, Math.PI * 2); ctx.fill();
    });

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  }

  const earthMesh = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_R, 64, 64),
    new THREE.MeshPhongMaterial({
      map: createEarthTexture(),
      specular: new THREE.Color(0x312e81),
      shininess: 20,
      emissive: new THREE.Color(0x060813),
      emissiveIntensity: 0.72
    })
  );
  worldGroup.add(earthMesh);

  // Dual-Tone Aurora Fresnel Atmosphere (Cyan -> Violet)
  worldGroup.add(new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_R * 1.11, 64, 64),
    new THREE.ShaderMaterial({
      transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
      vertexShader: `varying vec3 vN; void main(){ vN=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vN;
        void main(){
          float i = pow(0.66 - dot(vN, vec3(0.,0.,1.)), 3.0);
          vec3 col = mix(vec3(0.22, 0.74, 0.97), vec3(0.75, 0.52, 0.99), clamp(vN.y * 0.5 + 0.5, 0.0, 1.0));
          gl_FragColor = vec4(col, i * 0.88);
        }
      `
    })
  ));

  function latLonToVec3(latDeg, lonDeg, radius) {
    const phi = (90 - latDeg) * (Math.PI / 180);
    const theta = (lonDeg + 180) * (Math.PI / 180);
    return new THREE.Vector3(
      -radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    );
  }

  const stations = [
    { id: 'svb', lat: 78.23, lon: 15.41, active: true, color: 0x34d399 },
    { id: 'kir', lat: 67.86, lon: 20.96, active: true, color: 0xfbbf24 },
    { id: 'mat', lat: 40.65, lon: 16.70, active: true, color: 0x38bdf8 },
    { id: 'inuvik', lat: 68.36, lon: -133.72, active: false, color: 0x34d399 },
    { id: 'mcmurdo', lat: -77.85, lon: 166.67, active: false, color: 0xfbbf24 },
    { id: 'bengaluru', lat: 12.97, lon: 77.59, active: false, color: 0xc084fc }
  ];

  const stationMeshes = {};
  const earthSurfaceGroup = new THREE.Group();
  worldGroup.add(earthSurfaceGroup);

  stations.forEach((st) => {
    const group = new THREE.Group();
    const pos = latLonToVec3(st.lat, st.lon, EARTH_R + 0.012);
    group.position.copy(pos);
    group.lookAt(pos.clone().multiplyScalar(2));

    group.add(new THREE.Mesh(
      new THREE.SphereGeometry(0.032, 16, 16),
      new THREE.MeshBasicMaterial({ color: st.color })
    ));

    [
      { r: 0.08, c: st.color, o: 0.8 },
      { r: 0.145, c: 0xfbbf24, o: 0.42 },
      { r: 0.22, c: 0x94a3b8, o: 0.25 }
    ].forEach(({ r, c, o }) => {
      group.add(new THREE.Mesh(
        new THREE.RingGeometry(r - 0.005, r, 48),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, side: THREE.DoubleSide })
      ));
    });

    const pulseRing = new THREE.Mesh(
      new THREE.RingGeometry(0.03, 0.042, 36),
      new THREE.MeshBasicMaterial({ color: st.color, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
    );
    group.add(pulseRing);

    group.visible = st.active;
    earthSurfaceGroup.add(group);
    stationMeshes[st.id] = { group, pulseRing, data: st };
  });

  function getOrbitPos(radius, incRad, angle, raan) {
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle) * Math.sin(incRad);
    const z = radius * Math.sin(angle) * Math.cos(incRad);
    return new THREE.Vector3(x, y, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), raan);
  }

  function createOrbitLine(radius, incRad, color, raan, opacity) {
    const pts = [];
    for (let i = 0; i <= 160; i++) pts.push(getOrbitPos(radius, incRad, (i / 160) * Math.PI * 2, raan));
    return new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity })
    );
  }

  function createPrimarySatellite(color) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 0.055, 0.092),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.75, roughness: 0.2 })
    ));
    g.add(new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.008, 0.056),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.62 })
    ));
    const swathGeo = new THREE.ConeGeometry(0.115, 0.36, 24, 1, true);
    swathGeo.translate(0, -0.18, 0);
    swathGeo.rotateX(Math.PI / 2);
    g.add(new THREE.Mesh(
      swathGeo,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
    ));
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.078, 0.094, 32),
      new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.62, side: THREE.DoubleSide })
    );
    g.add(halo);
    return { group: g, halo };
  }

  const ORBIT_R = EARTH_R + 0.36;
  const INC_SSO = 98.6 * (Math.PI / 180);

  worldGroup.add(createOrbitLine(ORBIT_R, INC_SSO, 0x38bdf8, 0.35, 0.36));
  worldGroup.add(createOrbitLine(ORBIT_R, INC_SSO, 0xc084fc, 0.42, 0.36));

  const s2aObj = createPrimarySatellite(0x38bdf8);
  const s2bObj = createPrimarySatellite(0xc084fc);
  worldGroup.add(s2aObj.group);
  worldGroup.add(s2bObj.group);

  // 4 Extra LEO Constellation Satellites in Multi-Tone Orbits
  const extraSats = [
    { r: EARTH_R + 0.48, inc: 53 * (Math.PI / 180), raan: 1.1, speed: 11.2, phase: 0.2, color: 0xfbbf24 },
    { r: EARTH_R + 0.54, inc: 74 * (Math.PI / 180), raan: 2.4, speed: 9.8, phase: 1.7, color: 0x34d399 },
    { r: EARTH_R + 0.44, inc: 65 * (Math.PI / 180), raan: 4.0, speed: 12.6, phase: 3.1, color: 0xc084fc },
    { r: EARTH_R + 0.62, inc: 82 * (Math.PI / 180), raan: 5.2, speed: 8.5, phase: 4.8, color: 0x38bdf8 }
  ];
  extraSats.forEach((es) => {
    worldGroup.add(createOrbitLine(es.r, es.inc, es.color, es.raan, 0.13));
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.026, 0), new THREE.MeshBasicMaterial({ color: es.color }));
    worldGroup.add(mesh);
    es.mesh = mesh;
  });

  // RF Beams + Streaming Data Packets
  function createBeamSystem(color) {
    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.88 }));
    line.visible = false;
    worldGroup.add(line);
    const packets = [];
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), new THREE.MeshBasicMaterial({ color }));
      p.visible = false;
      worldGroup.add(p);
      packets.push(p);
    }
    return { line, packets };
  }

  const beamA = createBeamSystem(0x34d399);
  const beamB = createBeamSystem(0xfbbf24);
  const clashBeam = createBeamSystem(0xfb7185);

  function updateBeamSystem(sys, p1, p2, visible, phase) {
    sys.line.visible = visible;
    sys.packets.forEach((pk, idx) => {
      pk.visible = visible;
      if (visible) pk.position.lerpVectors(p1, p2, (phase * 1.65 + idx / sys.packets.length) % 1);
    });
    if (visible) {
      const arr = sys.line.geometry.attributes.position.array;
      arr[0] = p1.x; arr[1] = p1.y; arr[2] = p1.z;
      arr[3] = p2.x; arr[4] = p2.y; arr[5] = p2.z;
      sys.line.geometry.attributes.position.needsUpdate = true;
    }
  }

  const state = {
    simTime: 0.18, mode: 'qslice',
    targetRotY: -0.5, targetRotX: 0.46, targetPosX: 1.25, targetCamZ: 5.3,
    mouseX: 0, mouseY: 0, dragging: false, prevX: 0, prevY: 0
  };

  window.addEventListener('pointermove', (e) => {
    state.mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    state.mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    if (!state.dragging) return;
    const dx = e.clientX - state.prevX, dy = e.clientY - state.prevY;
    state.prevX = e.clientX; state.prevY = e.clientY;
    state.targetRotY += dx * 0.0065;
    state.targetRotX = Math.max(-1.1, Math.min(1.2, state.targetRotX + dy * 0.0065));
  });

  canvas.addEventListener('pointerdown', (e) => {
    state.dragging = true; state.prevX = e.clientX; state.prevY = e.clientY;
    const ring = document.getElementById('cursor-ring');
    if (ring) ring.classList.add('dragging');
  });
  window.addEventListener('pointerup', () => {
    state.dragging = false;
    const ring = document.getElementById('cursor-ring');
    if (ring) ring.classList.remove('dragging');
  });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  window.QO3Scene = {
    setMode(m) { state.mode = m; },
    setCameraPreset(preset) {
      const mobile = window.innerWidth < 980;
      if (preset === 'hero') { state.targetPosX = mobile ? 0 : 1.25; state.targetCamZ = mobile ? 6.4 : 5.25; state.targetRotX = 0.46; }
      else if (preset === 'europe') { state.targetPosX = mobile ? 0 : 0.95; state.targetCamZ = 4.25; state.targetRotX = 0.98; state.targetRotY = -1.85; }
      else if (preset === 'qslice') { state.targetPosX = 0; state.targetCamZ = 5.75; state.targetRotX = 0.65; }
      else if (preset === 'constellation') { state.targetPosX = 0; state.targetCamZ = 4.55; state.targetRotX = 0.72; }
      else if (preset === 'whatif') { state.targetPosX = mobile ? 0 : -0.7; state.targetCamZ = 4.9; }
      else if (preset === 'portal') { state.targetPosX = 0; state.targetCamZ = 4.1; state.targetRotX = 0.35; }
    },
    focusNode(id) {
      if (id === 's2a' || id === 's2b') { state.targetCamZ = 3.95; state.targetRotX = 0.42; return; }
      const st = stationMeshes[id];
      if (!st) return;
      state.targetRotX = (st.data.lat * Math.PI) / 180;
      state.targetRotY = -((st.data.lon + 90) * Math.PI) / 180;
      state.targetCamZ = 4.0;
    },
    setExtraStation(id) {
      ['inuvik', 'mcmurdo', 'bengaluru'].forEach((k) => {
        if (stationMeshes[k]) stationMeshes[k].group.visible = (k === id);
      });
      if (id && id !== 'base') this.focusNode(id);
    }
  };

  let last = performance.now();
  const navRateEl = document.getElementById('nav-link-rate');

  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const elapsed = now * 0.001;

    state.simTime = (state.simTime + dt * 0.0085) % 1;

    updateTesseract(elapsed);
    tesseract.position.x = worldGroup.position.x;
    tesseract.rotation.y = elapsed * 0.07 + state.mouseX * 0.22;
    tesseract.rotation.x = elapsed * 0.045 + state.mouseY * 0.18;

    if (!state.dragging) state.targetRotY += dt * 0.048;
    worldGroup.rotation.y += (state.targetRotY + state.mouseX * 0.14 - worldGroup.rotation.y) * 0.055;
    worldGroup.rotation.x += (state.targetRotX + state.mouseY * 0.1 - worldGroup.rotation.x) * 0.055;
    worldGroup.position.x += (state.targetPosX - worldGroup.position.x) * 0.05;
    camera.position.z += (state.targetCamZ - camera.position.z) * 0.05;
    stars.rotation.y = elapsed * 0.005 + state.mouseX * 0.035;

    earthMesh.rotation.y = state.simTime * Math.PI * 2;
    earthSurfaceGroup.rotation.y = state.simTime * Math.PI * 2;

    Object.values(stationMeshes).forEach(({ group, pulseRing }, idx) => {
      if (!group.visible) return;
      const p = (elapsed * 0.78 + idx * 0.35) % 1;
      pulseRing.scale.set(1 + p * 4.5, 1 + p * 4.5, 1);
      pulseRing.material.opacity = (1 - p) * 0.55;
    });

    const angleA = state.simTime * Math.PI * 2 * 14.3;
    const angleB = angleA + Math.PI * 0.92;
    const posA = getOrbitPos(ORBIT_R, INC_SSO, angleA, 0.35);
    const posB = getOrbitPos(ORBIT_R, INC_SSO, angleB, 0.42);
    s2aObj.group.position.copy(posA); s2aObj.group.lookAt(0, 0, 0);
    s2bObj.group.position.copy(posB); s2bObj.group.lookAt(0, 0, 0);

    const haloColor = state.mode === 'greedy' ? 0xfb7185 : 0x34d399;
    s2aObj.halo.material.color.setHex(haloColor);
    s2bObj.halo.material.color.setHex(haloColor);
    const haloScale = 1 + 0.15 * Math.sin(elapsed * 4);
    s2aObj.halo.scale.set(haloScale, haloScale, 1);
    s2bObj.halo.scale.set(haloScale, haloScale, 1);

    extraSats.forEach((es) => {
      const a = state.simTime * Math.PI * 2 * es.speed + es.phase;
      es.mesh.position.copy(getOrbitPos(es.r, es.inc, a, es.raan));
    });

    const visibleStations = Object.values(stationMeshes).filter((s) => s.group.visible);
    let bestA = null, minA = 1.24;
    let bestB = null, minB = 1.24;

    visibleStations.forEach(({ group }) => {
      const stLocal = group.position.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), earthSurfaceGroup.rotation.y);
      const dA = posA.distanceTo(stLocal);
      const dB = posB.distanceTo(stLocal);
      if (dA < minA) { minA = dA; bestA = stLocal; }
      if (dB < minB) { minB = dB; bestB = stLocal; }
    });

    updateBeamSystem(beamA, posA, bestA || posA, Boolean(bestA), elapsed);
    const isClash = Boolean(bestB && bestA && state.mode === 'greedy' && bestA.distanceTo(bestB) < 0.55);
    updateBeamSystem(beamB, posB, bestB || posB, Boolean(bestB && !isClash), elapsed + 0.4);
    updateBeamSystem(clashBeam, posB, bestB || posB, isClash, elapsed * 2.0);

    if (navRateEl) {
      const activeCount = (bestA ? 1 : 0) + (bestB && !isClash ? 1 : 0);
      navRateEl.textContent = isClash
        ? 'CLASH DETECTED'
        : activeCount > 0 ? `+${activeCount * 560} MBPS LOCK` : 'OPTICAL CAPTURE';
    }

    renderer.render(scene, camera);
  }

  requestAnimationFrame(animate);
})();
