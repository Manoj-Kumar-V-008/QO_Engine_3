import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import * as satellite from 'satellite.js';
import type { LandingDataBundle } from '../data/loadLandingData';
import type { AssignmentRecord, ScheduleMethod } from '../../types/engine';
import { scrollStore } from '../data/scrollStore';

interface ContactLedger3DProps {
  data: LandingDataBundle;
  mode: ScheduleMethod;
  onWebGLFailed: () => void;
}

interface InspectedCell {
  utc: string;
  satellite: string;
  station: string;
  passId: string;
  plannedGb: number;
}

const R_EARTH = 4.6;
const ALT_EXAGGERATION = 1.35; // Disclosed in caption (786 km / 6371 km * 1.35)
const SLICES_PER_DAY = 5760;
const EARTH_CENTER = new THREE.Vector3(0, -R_EARTH * 0.96, -0.55);

// True singularity-free ECEF-to-Scene spherical projection centered on Europe (60°N, 22°E).
// North points Left (-X), South points Right (+X), East points away (-Z), Local Up points (+Y),
// tilted 14° toward camera so Svalbard, Kiruna, Matera sit cleanly on the upper-front Earth limb
// while eastern Sentinel-2 passes (lon 76°E -> 39°E) sweep cleanly above the limb below the Ledger Wall.
const REF_LAT = (60 * Math.PI) / 180;
const REF_LON = (22 * Math.PI) / 180;
const TILT_X = (14 * Math.PI) / 180;

function latLonToVec3(latDeg: number, lonDeg: number, radius: number): THREE.Vector3 {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  // Standard ECEF unit vector
  const ex = Math.cos(lat) * Math.cos(lon);
  const ey = Math.cos(lat) * Math.sin(lon);
  const ez = Math.sin(lat);

  // Local ENU basis at (REF_LAT, REF_LON)
  const sinLat = Math.sin(REF_LAT);
  const cosLat = Math.cos(REF_LAT);
  const sinLon = Math.sin(REF_LON);
  const cosLon = Math.cos(REF_LON);

  const east = -sinLon * ex + cosLon * ey;
  const north = -sinLat * cosLon * ex - sinLat * sinLon * ey + cosLat * ez;
  const up = cosLat * cosLon * ex + cosLat * sinLon * ey + sinLat * ez;

  // Map: sceneX = -north (Svalbard left, Matera right), sceneY = up, sceneZ = -east (eastern orbits slightly behind dishes)
  const sx = -north * radius;
  const sy0 = up * radius;
  const sz0 = -east * radius;

  // Tilt slightly forward toward camera around X axis
  const sy = sy0 * Math.cos(TILT_X) - sz0 * Math.sin(TILT_X);
  const sz = sy0 * Math.sin(TILT_X) + sz0 * Math.cos(TILT_X);

  return new THREE.Vector3(sx, sy, sz).add(EARTH_CENTER);
}

function stationRgb(antId: string): [number, number, number] {
  if (antId === 'svalbard-1') return [240, 164, 60]; // #F0A43C
  if (antId === 'kiruna-1') return [91, 214, 230]; // #5BD6E6
  return [69, 214, 160]; // #45D6A0
}

function stationName(antId: string): string {
  if (antId === 'svalbard-1') return 'Svalbard';
  if (antId === 'kiruna-1') return 'Kiruna';
  return 'Matera';
}

function buildLedgerTexture(
  assignments: AssignmentRecord[],
  startMs: number
): THREE.DataTexture {
  // 2880 x 2 RGBA texture (each texel = 30s, representing 5,760 15s slices cleanly without exceeding WebGL MAX_TEXTURE_SIZE on low-end GPUs)
  const W = 2880;
  const H = 2;
  const buf = new Uint8Array(W * H * 4);

  // Base faint dark cell grid
  for (let i = 0; i < W * H; i++) {
    buf[i * 4 + 0] = 16;
    buf[i * 4 + 1] = 24;
    buf[i * 4 + 2] = 34;
    buf[i * 4 + 3] = 220;
  }

  for (const a of assignments) {
    const row = a.satellite_id === 'sentinel-2a' ? 1 : 0; // top row S2A, bottom row S2B
    const sIdx = Math.max(
      0,
      Math.min(W - 1, Math.floor((Date.parse(a.start_utc) - startMs) / 30_000))
    );
    const eIdx = Math.max(
      sIdx + 1,
      Math.min(W, Math.ceil((Date.parse(a.end_utc) - startMs) / 30_000))
    );
    const [r, g, b] = stationRgb(a.antenna_id);
    for (let x = sIdx; x < eIdx; x++) {
      const idx = (row * W + x) * 4;
      buf[idx + 0] = r;
      buf[idx + 1] = g;
      buf[idx + 2] = b;
      buf[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(buf, W, H, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// 6 camera keyframes mapped to scroll progress p in [0, 1]
const CAM_POS_KEYS = [
  new THREE.Vector3(0.0, 1.35, 5.45), // 01 Three stations wide across European limb
  new THREE.Vector3(-1.35, 1.55, 4.45), // 02 Conflict geometry over Svalbard/Kiruna
  new THREE.Vector3(1.05, 1.45, 4.55), // 03 Binary ceiling view
  new THREE.Vector3(0.0, 2.05, 4.15), // 04 Ledger wall elevation close-up
  new THREE.Vector3(-0.25, 1.15, 3.85), // 05 Handover baton qs009->qs010->qs012
  new THREE.Vector3(0.0, 1.48, 5.15), // 06 Full ledger + verified constellation
];

const CAM_LOOK_KEYS = [
  new THREE.Vector3(0.0, 0.72, -0.2),
  new THREE.Vector3(-0.45, 0.65, 0.15),
  new THREE.Vector3(0.25, 0.65, 0.15),
  new THREE.Vector3(0.0, 1.85, -1.6),
  new THREE.Vector3(0.05, 0.68, 0.25),
  new THREE.Vector3(0.0, 1.05, -0.55),
];

export default function ContactLedger3D({
  data,
  mode,
  onWebGLFailed,
}: ContactLedger3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<ScheduleMethod>(mode);
  const ledgerMatRef = useRef<THREE.ShaderMaterial | null>(null);
  const ledgerTexRef = useRef<THREE.DataTexture | null>(null);
  const [inspected, setInspected] = useState<InspectedCell | null>(null);

  // Sync mode changes into live 3D texture without rebuilding WebGL context
  useEffect(() => {
    modeRef.current = mode;
    if (!ledgerMatRef.current) return;
    const startMs = Date.parse(data.scenario.start_utc);
    const nextTex = buildLedgerTexture(data.schedules[mode].assignments, startMs);
    const prevTex = ledgerTexRef.current;
    ledgerTexRef.current = nextTex;
    ledgerMatRef.current.uniforms.uLedger.value = nextTex;
    if (prevTex) prevTex.dispose();
  }, [mode, data]);

  useEffect(() => {
    const container = hostRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch {
      onWebGLFailed();
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(container.clientWidth || 720, container.clientHeight || 480);
    renderer.setClearColor(0x05070a, 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      onWebGLFailed();
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      40,
      (container.clientWidth || 720) / Math.max(1, container.clientHeight || 480),
      0.1,
      100
    );
    camera.position.copy(CAM_POS_KEYS[0]);

    // Clean three-point aerospace lighting (no bloom soup)
    scene.add(new THREE.AmbientLight(0x88a4bc, 0.55));
    const sunLight = new THREE.DirectionalLight(0xfff4e0, 1.35);
    sunLight.position.set(6, 7, 5);
    scene.add(sunLight);
    const rimLight = new THREE.DirectionalLight(0x5bd6e6, 0.5);
    rimLight.position.set(-6, 3, -4);
    scene.add(rimLight);

    const disposables: { dispose: () => void }[] = [];

    // 1. Curved Earth Limb + Subtle Graticule + BackSide Fresnel Atmosphere Rim
    const earthCenter = EARTH_CENTER.clone();
    const earthGeo = new THREE.SphereGeometry(R_EARTH, 96, 64);
    const earthMat = new THREE.MeshStandardMaterial({
      color: 0x0a1117,
      roughness: 0.92,
      metalness: 0.08,
    });
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    earthMesh.position.copy(earthCenter);
    scene.add(earthMesh);
    disposables.push(earthGeo, earthMat);

    // Subtle wire graticule on Earth limb
    const gratGeo = new THREE.SphereGeometry(R_EARTH * 1.002, 36, 24);
    const gratMat = new THREE.MeshBasicMaterial({
      color: 0x9da9b8,
      wireframe: true,
      transparent: true,
      opacity: 0.06,
    });
    const gratMesh = new THREE.Mesh(gratGeo, gratMat);
    gratMesh.position.copy(earthCenter);
    scene.add(gratMesh);
    disposables.push(gratGeo, gratMat);

    // BackSide Fresnel Atmosphere Rim (#5BD6E6, capped alpha <= 0.35)
    const atmoGeo = new THREE.SphereGeometry(R_EARTH * 1.028, 84, 56);
    const atmoMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: new THREE.Color('#5BD6E6') },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewPos;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vViewPos = -mvPos.xyz;
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying vec3 vNormal;
        varying vec3 vViewPos;
        void main() {
          float ndotv = clamp(dot(normalize(-vNormal), normalize(vViewPos)), 0.0, 1.0);
          float fresnel = pow(1.0 - ndotv, 3.2);
          gl_FragColor = vec4(uColor, min(0.35, fresnel * 0.52));
        }
      `,
    });
    const atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
    atmoMesh.position.copy(earthCenter);
    scene.add(atmoMesh);
    disposables.push(atmoGeo, atmoMat);

    // 2. Three Ground Stations at real European coordinates + 120s slew rings
    const stationPositions: Record<string, THREE.Vector3> = {};
    const stationSlewRings: Record<string, THREE.Mesh> = {};
    const dishHeads: Record<string, THREE.Group> = {};

    const pedestalGeo = new THREE.CylinderGeometry(0.045, 0.068, 0.13, 12);
    const dishGeo = new THREE.ConeGeometry(0.13, 0.068, 18, 1, true);
    const ringGeo = new THREE.RingGeometry(0.17, 0.20, 36);
    disposables.push(pedestalGeo, dishGeo, ringGeo);

    for (const ant of data.scenario.antennas) {
      const pos = latLonToVec3(ant.lat_deg, ant.lon_deg, R_EARTH + 0.015);
      stationPositions[ant.id] = pos;

      const normal = pos.clone().sub(earthCenter).normalize();
      const stationGroup = new THREE.Group();
      stationGroup.position.copy(pos);
      stationGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);

      const [r, g, b] = stationRgb(ant.id);
      const col = new THREE.Color(r / 255, g / 255, b / 255);

      const pedMat = new THREE.MeshStandardMaterial({
        color: 0x1b2734,
        metalness: 0.4,
        roughness: 0.5,
      });
      const ped = new THREE.Mesh(pedestalGeo, pedMat);
      ped.position.y = 0.045;
      stationGroup.add(ped);
      disposables.push(pedMat);

      const headGroup = new THREE.Group();
      headGroup.position.y = 0.095;
      const dishMat = new THREE.MeshStandardMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: 0.35,
        side: THREE.DoubleSide,
        roughness: 0.35,
        metalness: 0.5,
      });
      const dish = new THREE.Mesh(dishGeo, dishMat);
      dish.rotation.x = Math.PI;
      headGroup.add(dish);
      stationGroup.add(headGroup);
      dishHeads[ant.id] = headGroup;
      disposables.push(dishMat);

      // 5-degree mask & 120s slew ring
      const ringMat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.01;
      stationGroup.add(ring);
      stationSlewRings[ant.id] = ring;
      disposables.push(ringMat);

      scene.add(stationGroup);
    }

    // 3. Real SGP4 Orbit Tracks & Spacecraft Meshes (07:48–08:22 UTC European pass cluster)
    const s2bRec = satellite.twoline2satrec(
      data.tles['sentinel-2b'].line1,
      data.tles['sentinel-2b'].line2
    );
    const s2aRec = satellite.twoline2satrec(
      data.tles['sentinel-2a'].line1,
      data.tles['sentinel-2a'].line2
    );

    const orbitRadius = R_EARTH * (1 + (786 / 6371) * ALT_EXAGGERATION);
    const sampleSatVec3 = (satrec: satellite.SatRec, timeMs: number): THREE.Vector3 => {
      const date = new Date(timeMs);
      const pv = satellite.propagate(satrec, date);
      if (!pv || !pv.position || typeof pv.position === 'boolean') {
        return new THREE.Vector3(0, 1.2, 0);
      }
      const gmst = satellite.gstime(date);
      const gd = satellite.eciToGeodetic(pv.position, gmst);
      const latDeg = satellite.degreesLat(gd.latitude);
      const lonDeg = satellite.degreesLong(gd.longitude);
      return latLonToVec3(latDeg, lonDeg, orbitRadius);
    };

    const winStartMs = Date.parse('2026-11-09T07:50:00Z');
    const winEndMs = Date.parse('2026-11-09T08:18:00Z');

    const buildOrbitRibbon = (satrec: satellite.SatRec, colorHex: number, opacity: number) => {
      const pts: THREE.Vector3[] = [];
      for (let t = winStartMs; t <= winEndMs; t += 20_000) {
        pts.push(sampleSatVec3(satrec, t));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity,
      });
      disposables.push(geo, mat);
      return new THREE.Line(geo, mat);
    };

    scene.add(buildOrbitRibbon(s2bRec, 0x5bd6e6, 0.55));
    scene.add(buildOrbitRibbon(s2aRec, 0x9da9b8, 0.28));

    // Spacecraft procedural bus + solar wing assembly (cleanly scaled for limb framing)
    const buildSpacecraft = (accentHex: number) => {
      const grp = new THREE.Group();
      const busGeo = new THREE.BoxGeometry(0.11, 0.11, 0.16);
      const busMat = new THREE.MeshStandardMaterial({
        color: 0xe9edf2,
        emissive: accentHex,
        emissiveIntensity: 0.25,
        metalness: 0.6,
        roughness: 0.25,
      });
      grp.add(new THREE.Mesh(busGeo, busMat));

      const wingGeo = new THREE.BoxGeometry(0.46, 0.016, 0.11);
      const wingMat = new THREE.MeshStandardMaterial({
        color: accentHex,
        emissive: accentHex,
        emissiveIntensity: 0.5,
        metalness: 0.4,
        roughness: 0.25,
      });
      const wing = new THREE.Mesh(wingGeo, wingMat);
      wing.position.x = 0.22;
      grp.add(wing);

      disposables.push(busGeo, busMat, wingGeo, wingMat);
      return grp;
    };

    const s2bMesh = buildSpacecraft(0x5bd6e6);
    const s2aMesh = buildSpacecraft(0xf0a43c);
    scene.add(s2bMesh, s2aMesh);

    // 4. The 24-Hour Contact Ledger Wall (floating instrument backdrop behind orbit)
    const startMs = Date.parse(data.scenario.start_utc);
    const ledgerTex = buildLedgerTexture(data.schedules[modeRef.current].assignments, startMs);
    ledgerTexRef.current = ledgerTex;

    const wallW = 5.4;
    const wallH = 0.72;
    const wallGeo = new THREE.PlaneGeometry(wallW, wallH, 1, 1);
    const wallMat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uLedger: { value: ledgerTex },
        uFill: { value: 1.0 },
        uDim: { value: 0.92 },
        uPlayhead: { value: 0.33 },
        uHoverU: { value: -1.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uLedger;
        uniform float uFill;
        uniform float uDim;
        uniform float uPlayhead;
        uniform float uHoverU;
        varying vec2 vUv;
        void main() {
          vec4 cell = texture2D(uLedger, vec2(vUv.x, vUv.y));
          // Center divider hairline between S2A (top) and S2B (bottom)
          float midLine = smoothstep(0.018, 0.004, abs(vUv.y - 0.5));
          // Vertical hour ticks (24 divisions)
          float hourTick = step(0.96, fract(vUv.x * 24.0)) * 0.16;
          // Border frame
          float border = step(vUv.x, 0.004) + step(0.996, vUv.x) + step(vUv.y, 0.025) + step(0.975, vUv.y);
          // Active playhead cursor
          float cursor = smoothstep(0.005, 0.001, abs(vUv.x - uPlayhead));
          // Hover slice highlight
          float hover = uHoverU >= 0.0 ? smoothstep(0.006, 0.001, abs(vUv.x - uHoverU)) : 0.0;

          float reveal = step(vUv.x, uFill);
          vec3 baseCol = mix(vec3(0.04, 0.06, 0.09), cell.rgb, reveal);
          baseCol += vec3(hourTick);
          baseCol = mix(baseCol, vec3(0.91, 0.93, 0.95), clamp(midLine * 0.35 + border * 0.25, 0.0, 1.0));
          baseCol = mix(baseCol, vec3(0.94, 0.64, 0.24), cursor);
          baseCol = mix(baseCol, vec3(1.0), hover * 0.85);
          gl_FragColor = vec4(baseCol, uDim);
        }
      `,
    });
    ledgerMatRef.current = wallMat;

    const wallMesh = new THREE.Mesh(wallGeo, wallMat);
    wallMesh.position.set(0, 2.08, -1.65);
    scene.add(wallMesh);
    disposables.push(wallGeo, wallMat);

    // 5. Dynamic RF Downlink Link Ribbons (S2B active relay + S2A post-slew link + conflict ghost)
    const linkPoints = 32;
    const makeBeamLine = (colorHex: number) => {
      const arr = new Float32Array(linkPoints * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      const mat = new THREE.LineBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.95,
      });
      disposables.push(geo, mat);
      const line = new THREE.Line(geo, mat);
      scene.add(line);
      return { line, geo, mat };
    };

    const primaryBeam = makeBeamLine(0x5bd6e6);
    const secondaryBeam = makeBeamLine(0xf0a43c);
    const conflictBeam = makeBeamLine(0xff6464);

    // Packet pulse marker traveling down the active RF link
    const packetGeo = new THREE.BoxGeometry(0.085, 0.085, 0.085);
    const packetMat = new THREE.MeshBasicMaterial({ color: 0xe9edf2 });
    const packetMesh = new THREE.Mesh(packetGeo, packetMat);
    scene.add(packetMesh);
    disposables.push(packetGeo, packetMat);

    const updateCurveBeam = (
      beam: { geo: THREE.BufferGeometry; line: THREE.Line },
      from: THREE.Vector3,
      to: THREE.Vector3,
      arcLift: number
    ) => {
      const mid = from.clone().lerp(to, 0.5);
      mid.y += arcLift;
      const posAttr = beam.geo.getAttribute('position') as THREE.BufferAttribute;
      const tmp = new THREE.Vector3();
      for (let i = 0; i < linkPoints; i++) {
        const u = i / (linkPoints - 1);
        const inv = 1 - u;
        tmp.set(
          inv * inv * from.x + 2 * inv * u * mid.x + u * u * to.x,
          inv * inv * from.y + 2 * inv * u * mid.y + u * u * to.y,
          inv * inv * from.z + 2 * inv * u * mid.z + u * u * to.z
        );
        posAttr.setXYZ(i, tmp.x, tmp.y, tmp.z);
      }
      posAttr.needsUpdate = true;
      beam.line.visible = true;
    };

    // Camera spline + damped user drag nudge (±18° yaw, ±6° pitch, 4s snap-back)
    const camPosCurve = new THREE.CatmullRomCurve3(CAM_POS_KEYS);
    const camLookCurve = new THREE.CatmullRomCurve3(CAM_LOOK_KEYS);

    let targetP = scrollStore.getSnapshot().act3Progress;
    let smoothP = targetP;
    const unsubProgress = scrollStore.subscribeProgress((p) => {
      targetP = p;
    });

    let dragActive = false;
    let lastPtrX = 0;
    let lastPtrY = 0;
    let yawOffset = 0;
    let pitchOffset = 0;
    let lastDragEndMs = 0;

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    const inspectAtPointer = (clientX: number, clientY: number, commitClick: boolean) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObject(wallMesh);
      if (hits.length === 0 || !hits[0].uv) {
        wallMat.uniforms.uHoverU.value = -1.0;
        if (commitClick) setInspected(null);
        return;
      }
      const uv = hits[0].uv;
      wallMat.uniforms.uHoverU.value = uv.x;
      const sliceIdx = Math.floor(uv.x * SLICES_PER_DAY);
      const tMs = startMs + sliceIdx * 15_000;
      const satId = uv.y >= 0.5 ? 'sentinel-2a' : 'sentinel-2b';
      const activeList = data.schedules[modeRef.current].assignments;
      const match = activeList.find(
        (a) =>
          a.satellite_id === satId &&
          tMs >= Date.parse(a.start_utc) &&
          tMs <= Date.parse(a.end_utc)
      );
      if (match) {
        setInspected({
          utc: new Date(tMs).toISOString().slice(11, 19) + ' UTC',
          satellite: satId === 'sentinel-2a' ? 'Sentinel-2A' : 'Sentinel-2B',
          station: stationName(match.antenna_id),
          passId: match.pass_id.toUpperCase(),
          plannedGb: match.planned_gb,
        });
      } else if (commitClick) {
        setInspected({
          utc: new Date(tMs).toISOString().slice(11, 19) + ' UTC',
          satellite: satId === 'sentinel-2a' ? 'Sentinel-2A' : 'Sentinel-2B',
          station: 'Idle / No contact',
          passId: '—',
          plannedGb: 0,
        });
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      dragActive = true;
      lastPtrX = e.clientX;
      lastPtrY = e.clientY;
      inspectAtPointer(e.clientX, e.clientY, true);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (dragActive) {
        const dx = e.clientX - lastPtrX;
        const dy = e.clientY - lastPtrY;
        lastPtrX = e.clientX;
        lastPtrY = e.clientY;
        const maxYaw = (18 * Math.PI) / 180;
        const maxPitch = (6 * Math.PI) / 180;
        yawOffset = Math.max(-maxYaw, Math.min(maxYaw, yawOffset + dx * 0.0032));
        pitchOffset = Math.max(-maxPitch, Math.min(maxPitch, pitchOffset + dy * 0.002));
      } else {
        inspectAtPointer(e.clientX, e.clientY, false);
      }
    };
    const onPointerUp = () => {
      if (dragActive) {
        dragActive = false;
        lastDragEndMs = performance.now();
      }
    };
    const onPointerLeave = () => {
      dragActive = false;
      wallMat.uniforms.uHoverU.value = -1.0;
    };

    const onResetCamera = () => {
      yawOffset = 0;
      pitchOffset = 0;
      setInspected(null);
    };
    window.addEventListener('qoe3-ledger-reset', onResetCamera);

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);

    // ResizeObserver
    const ro = new ResizeObserver(() => {
      if (!container) return;
      const w = container.clientWidth || 720;
      const h = Math.max(1, container.clientHeight || 480);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(container);

    // Pause rAF automatically when offscreen or tab hidden
    let inView = true;
    let tabVisible = !document.hidden;
    const io = new IntersectionObserver(
      (entries) => {
        inView = entries[0]?.isIntersecting ?? true;
      },
      { rootMargin: '120px' }
    );
    io.observe(container);

    const onVisChange = () => {
      tabVisible = !document.hidden;
    };
    document.addEventListener('visibilitychange', onVisChange);

    // Animation loop using performance.now() (zero THREE.Clock!)
    let rafId = 0;
    let prevNow = performance.now();
    const tmpPos = new THREE.Vector3();
    const tmpLook = new THREE.Vector3();
    const packetPos = new THREE.Vector3();

    const animate = (now: number) => {
      rafId = requestAnimationFrame(animate);
      if (!inView || !tabVisible) {
        prevNow = now;
        return;
      }

      const dt = Math.min(0.05, Math.max(0.001, (now - prevNow) / 1000));
      prevNow = now;
      const damp = 1 - Math.exp(-dt * 8);

      smoothP += (targetP - smoothP) * damp;

      // 4-second snap-back after drag release
      if (!dragActive && now - lastDragEndMs > 4000) {
        yawOffset *= 1 - Math.min(1, dt * 2.5);
        pitchOffset *= 1 - Math.min(1, dt * 2.5);
      }

      camPosCurve.getPoint(Math.max(0, Math.min(1, smoothP)), tmpPos);
      camLookCurve.getPoint(Math.max(0, Math.min(1, smoothP)), tmpLook);

      // Apply bounded yaw/pitch nudge around look target
      const offset = tmpPos.clone().sub(tmpLook);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), yawOffset);
      offset.applyAxisAngle(new THREE.Vector3(1, 0, 0), pitchOffset);
      camera.position.copy(tmpLook).add(offset);
      camera.lookAt(tmpLook);

      // Map smoothP into the canonical 07:52:45–08:13:00 UTC European pass window
      // Frame 4 (p=0.62..0.80) scrubs right through qs009 -> qs010 -> qs012!
      const batonFrac = Math.max(0, Math.min(1, (smoothP - 0.12) / 0.78));
      const simMs =
        Date.parse('2026-11-09T07:53:00Z') +
        batonFrac * (Date.parse('2026-11-09T08:12:00Z') - Date.parse('2026-11-09T07:53:00Z'));

      const s2bPos = sampleSatVec3(s2bRec, simMs);
      const s2aPos = sampleSatVec3(s2aRec, simMs);
      s2bMesh.position.copy(s2bPos);
      s2aMesh.position.copy(s2aPos);
      s2bMesh.lookAt(earthCenter);
      s2aMesh.lookAt(earthCenter);

      // Update ledger wall uniforms
      wallMat.uniforms.uFill.value = smoothP < 0.35 ? 0.45 + smoothP * 1.55 : 1.0;
      wallMat.uniforms.uPlayhead.value = (simMs - startMs) / (24 * 3600 * 1000);

      // Active beam & handover baton logic grounded in exact timestamps
      const svalPos = stationPositions['svalbard-1'];
      const kirPos = stationPositions['kiruna-1'];
      const matPos = stationPositions['matera-1'];

      primaryBeam.line.visible = false;
      secondaryBeam.line.visible = false;
      conflictBeam.line.visible = false;
      packetMesh.visible = false;

      const pulseU = ((now * 0.0014) % 1);
      const currentMode = modeRef.current;

      if (currentMode === 'qslice') {
        // Exact Q Slice relay: qs009 Svalbard (<08:01:00) -> qs010 Kiruna (08:01:15..08:06:15) -> qs012 Matera (08:06:30..08:12:30)
        let activeStationPos: THREE.Vector3 | null = null;
        let activeColor = 0xf0a43c;

        if (simMs <= Date.parse('2026-11-09T08:01:00Z')) {
          activeStationPos = svalPos;
          activeColor = 0xf0a43c;
        } else if (
          simMs >= Date.parse('2026-11-09T08:01:15Z') &&
          simMs <= Date.parse('2026-11-09T08:06:15Z')
        ) {
          activeStationPos = kirPos;
          activeColor = 0x5bd6e6;
        } else if (simMs >= Date.parse('2026-11-09T08:06:30Z')) {
          activeStationPos = matPos;
          activeColor = 0x45d6a0;
        }

        if (activeStationPos) {
          primaryBeam.mat.color.setHex(activeColor);
          updateCurveBeam(primaryBeam, s2bPos, activeStationPos, 0.12);
          packetPos.lerpVectors(s2bPos, activeStationPos, pulseU);
          packetMesh.position.copy(packetPos);
          packetMesh.visible = true;
        }

        // Concurrent qs011: Svalbard acquires Sentinel-2A at 08:03:00 after exact 120s slew!
        if (simMs >= Date.parse('2026-11-09T08:03:00Z') && svalPos) {
          secondaryBeam.mat.color.setHex(0xf0a43c);
          updateCurveBeam(secondaryBeam, s2aPos, svalPos, 0.1);
        }
      } else {
        // Greedy / MILP whole-pass: p012 Kiruna for S2B (07:56:09..08:06:18) + p013 Svalbard for S2A (08:02:58..08:13:46)
        if (
          simMs >= Date.parse('2026-11-09T07:56:09Z') &&
          simMs <= Date.parse('2026-11-09T08:06:18Z') &&
          kirPos
        ) {
          primaryBeam.mat.color.setHex(0x5bd6e6);
          updateCurveBeam(primaryBeam, s2bPos, kirPos, 0.12);
          packetPos.lerpVectors(s2bPos, kirPos, pulseU);
          packetMesh.position.copy(packetPos);
          packetMesh.visible = true;
        }
        // Show red conflict ghost where p011 Svalbard was dropped!
        if (simMs <= Date.parse('2026-11-09T08:03:29Z') && svalPos) {
          conflictBeam.mat.color.setHex(0xff6464);
          updateCurveBeam(conflictBeam, s2bPos, svalPos, 0.08);
        }
        if (simMs >= Date.parse('2026-11-09T08:02:58Z') && svalPos) {
          secondaryBeam.mat.color.setHex(0xf0a43c);
          updateCurveBeam(secondaryBeam, s2aPos, svalPos, 0.1);
        }
      }

      // Gently animate station slew rings during 08:01:00–08:03:00 (120s Svalbard slew)
      const isSvalbardSlewing =
        simMs > Date.parse('2026-11-09T08:01:00Z') &&
        simMs < Date.parse('2026-11-09T08:03:00Z');
      if (stationSlewRings['svalbard-1']) {
        const s = isSvalbardSlewing ? 1.0 + 0.25 * Math.sin(now * 0.008) : 1.0;
        stationSlewRings['svalbard-1'].scale.set(s, s, 1);
      }

      // Point dishes subtly toward active spacecraft
      if (dishHeads['svalbard-1']) {
        dishHeads['svalbard-1'].rotation.y = isSvalbardSlewing ? now * 0.0025 : 0.3;
      }

      renderer.render(scene, camera);
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      unsubProgress();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisChange);
      window.removeEventListener('qoe3-ledger-reset', onResetCamera);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      if (ledgerTexRef.current) {
        ledgerTexRef.current.dispose();
        ledgerTexRef.current = null;
      }
      for (const d of disposables) d.dispose();
      renderer.dispose();
    };
  }, [data, onWebGLFailed]);

  return (
    <div className="relative w-full h-full min-h-[380px] lg:min-h-0 bg-[#05070A]">
      <div
        ref={hostRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        aria-label="Interactive 3D Contact Ledger showing curved Earth limb, Sentinel-2 orbits, European ground dishes, and 24-hour slice ledger wall"
      />

      {/* Top-left subtle instrument caption */}
      <div
        className="pointer-events-none absolute top-3 left-4 right-4 flex flex-wrap items-center justify-between gap-2"
      >
        <span className="lp-micro" style={{ color: 'var(--ink-void-2)' }}>
          3D CONTACT LEDGER · REAL SGP4 · ALTITUDE 1.35× · DRAG TO NUDGE · CLICK WALL TO INSPECT
        </span>
        <span className="lp-micro" style={{ color: 'var(--ink-void-3)' }}>
          SVALBARD · KIRUNA · MATERA
        </span>
      </div>

      {/* Hover / Click Ledger Cell Inspector */}
      {inspected && (
        <div
          className="absolute bottom-3 left-4 p-3 lp-plate max-w-[320px]"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center justify-between gap-4 pb-1.5 mb-1.5" style={{ borderBottom: '1px solid var(--rule-void)' }}>
            <span className="lp-micro" style={{ color: 'var(--amber)' }}>
              SLICE INSPECTOR · {inspected.utc}
            </span>
            <button
              type="button"
              onClick={() => setInspected(null)}
              className="lp-micro cursor-pointer bg-transparent border-0 p-0"
              style={{ color: 'var(--ink-void-3)' }}
            >
              [ESC]
            </button>
          </div>
          <div className="lp-mono text-[12px] grid grid-cols-2 gap-x-4 gap-y-1">
            <span style={{ color: 'var(--ink-void-3)' }}>Spacecraft</span>
            <span style={{ color: 'var(--ink-void)' }}>{inspected.satellite}</span>
            <span style={{ color: 'var(--ink-void-3)' }}>Station</span>
            <span style={{ color: 'var(--cyan)' }}>{inspected.station}</span>
            <span style={{ color: 'var(--ink-void-3)' }}>Assignment</span>
            <span style={{ color: 'var(--ink-void)' }}>
              {inspected.passId} ({inspected.plannedGb.toFixed(1)} GB)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
