import * as THREE from 'three';
import * as satellite from 'satellite.js';
import earthTextureUrl from '../assets/earth-ne2.jpg';
import type { LandingDataBundle } from '../data/loadLandingData';
import type { ScheduleMethod } from '../../types/engine';

export type SceneVariant = 'hero' | 'ledger';

export interface MissionSceneOptions {
  host: HTMLElement;
  labelHost?: HTMLElement | null;
  data: LandingDataBundle;
  variant: SceneVariant;
  mode?: ScheduleMethod;
  progressRef?: { current: number };
  onWebGLFailure?: () => void;
  onFrame?: (frame: number) => void;
}

interface StationEntry {
  id: string;
  name: string;
  color: number;
  colorCss: string;
  pos: THREE.Vector3; // unit sphere, ECEF-local
  anchor: THREE.Vector3;
  pulse: THREE.Mesh;
  ring: THREE.Mesh;
  label: HTMLDivElement;
}

const TAU = Math.PI * 2;
const ORBIT_ALT = 786 / 6371;
const ORBIT_RADIUS = 1 + ORBIT_ALT;

const HERO_EARTH_CENTER = new THREE.Vector3(1.35, -4.85, -2.2);
const HERO_EARTH_SCALE = 5.35;
const LEDGER_EARTH_CENTER = new THREE.Vector3(0.15, -5.35, -2.6);
const LEDGER_EARTH_SCALE = 5.65;

const STATION_META: Record<string, { color: number; css: string; short: string }> = {
  'svalbard-1': { color: 0xf0a43c, css: '#f0a43c', short: 'SVALBARD' },
  'kiruna-1': { color: 0x5bd6e6, css: '#5bd6e6', short: 'KIRUNA' },
  'matera-1': { color: 0x45d6a0, css: '#45d6a0', short: 'MATERA' },
};

const T0 = Date.parse('2026-11-09T00:00:00Z');
const HANDOVER_START = Date.parse('2026-11-09T07:50:00Z');
const HANDOVER_END = Date.parse('2026-11-09T08:14:00Z');

function latLonToUnit(latDeg: number, lonDeg: number): THREE.Vector3 {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  return new THREE.Vector3(
    Math.cos(lat) * Math.cos(lon),
    Math.sin(lat),
    Math.cos(lat) * Math.sin(lon)
  );
}

/** Rotation that brings Europe near the top-facing limb of the globe. */
function europeQuaternion(): THREE.Quaternion {
  const europe = latLonToUnit(55, 15);
  const target = new THREE.Vector3(0.12, 0.52, 0.85).normalize();
  return new THREE.Quaternion().setFromUnitVectors(europe, target);
}

function buildEarthGeometry(radius = 1, segments = 128, rings = 64): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iy = 0; iy <= rings; iy++) {
    const v = iy / rings;
    const lat = (v - 0.5) * Math.PI;
    const cosLat = Math.cos(lat);
    const sinLat = Math.sin(lat);
    for (let ix = 0; ix <= segments; ix++) {
      const u = ix / segments;
      const lon = (u - 0.5) * TAU;
      positions.push(
        radius * cosLat * Math.cos(lon),
        radius * sinLat,
        radius * cosLat * Math.sin(lon)
      );
      uvs.push(u, v);
    }
  }

  for (let iy = 0; iy < rings; iy++) {
    for (let ix = 0; ix < segments; ix++) {
      const a = iy * (segments + 1) + ix;
      const b = a + segments + 1;
      const c = a + 1;
      const d = b + 1;
      // Counter-clockwise when viewed from outside.
      indices.push(a, b, c, b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeRadialTexture(inner: string, outer: string, size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, outer);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function makeEarthMaterial(texture: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texture },
      uSunDir: { value: new THREE.Vector3(0.55, 0.7, 0.55).normalize() },
      uRim: { value: new THREE.Color('#63d7e4') },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform vec3 uSunDir;
      uniform vec3 uRim;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vWorld;

      void main() {
        vec3 tex = texture2D(uMap, vUv).rgb;
        float lum = dot(tex, vec3(0.333));
        float ocean = smoothstep(0.035, 0.17, tex.b - tex.r * 1.05);
        float ice = smoothstep(0.58, 0.82, lum);
        float desert = smoothstep(0.16, 0.46, tex.r - tex.b * 0.35);

        vec3 oceanCol = vec3(0.0055, 0.013, 0.020);
        vec3 landCol = mix(vec3(0.028, 0.063, 0.062), vec3(0.075, 0.115, 0.100), smoothstep(0.08, 0.40, tex.g));
        landCol = mix(landCol, vec3(0.13, 0.135, 0.105), desert * 0.35);
        vec3 col = mix(landCol, oceanCol, ocean);
        col = mix(col, vec3(0.22, 0.27, 0.28), ice * 0.55);

        // 15-degree graticule, faint instrumentation, never a wireframe globe.
        float gx = fract(vUv.x * 24.0);
        float gy = fract(vUv.y * 12.0);
        float lineX = 1.0 - smoothstep(0.0, 0.020, min(gx, 1.0 - gx));
        float lineY = 1.0 - smoothstep(0.0, 0.014, min(gy, 1.0 - gy));
        float grid = max(lineX, lineY) * 0.055;
        col += vec3(0.36, 0.84, 0.89) * grid;

        vec3 N = normalize(vNormalW);
        vec3 V = normalize(cameraPosition - vWorld);
        float sun = dot(N, normalize(uSunDir));
        float day = smoothstep(-0.18, 0.55, sun);
        vec3 lit = col * (0.42 + 1.05 * day);
        lit += vec3(0.09, 0.16, 0.19) * smoothstep(0.0, 0.30, 1.0 - day);

        float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.4);
        lit += uRim * fres * 0.62;
        float terminator = 1.0 - smoothstep(0.0, 0.07, abs(sun + 0.03));
        lit += vec3(0.65, 0.42, 0.16) * terminator * 0.055;

        gl_FragColor = vec4(lit, 1.0);
      }
    `,
  });
}

function makeAtmosphere(radius: number, color: string, opacity: number): THREE.Mesh {
  const geo = new THREE.SphereGeometry(radius, 96, 64);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float rim = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0), 3.1);
        gl_FragColor = vec4(uColor, rim * uOpacity);
      }
    `,
  });
  return new THREE.Mesh(geo, mat);
}

function makeStarfield(count = 850): THREE.Points {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const radius = 22 + Math.random() * 22;
    const theta = Math.random() * TAU;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi) * 0.8 + 2;
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta) - 8;
    const warm = Math.random() > 0.86;
    color.set(warm ? '#d9c7a8' : '#a9c8d6');
    const brightness = 0.25 + Math.random() * 0.65;
    colors[i * 3] = color.r * brightness;
    colors[i * 3 + 1] = color.g * brightness;
    colors[i * 3 + 2] = color.b * brightness;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.055,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.9,
    vertexColors: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geo, mat);
}

function makeSatellite(accent: number): THREE.Group {
  const group = new THREE.Group();
  const bodyGeo = new THREE.BoxGeometry(0.024, 0.018, 0.036);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xdde6e8,
    emissive: new THREE.Color(accent),
    emissiveIntensity: 0.28,
    metalness: 0.65,
    roughness: 0.3,
  });
  group.add(new THREE.Mesh(bodyGeo, bodyMat));

  const wingGeo = new THREE.BoxGeometry(0.085, 0.0025, 0.026);
  const wingMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(accent),
    emissive: new THREE.Color(accent),
    emissiveIntensity: 0.55,
    metalness: 0.4,
    roughness: 0.3,
  });
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.position.x = side * 0.058;
    group.add(wing);
  }

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeRadialTexture('rgba(190,245,255,0.9)', 'rgba(91,214,230,0.25)'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.85,
    })
  );
  halo.scale.setScalar(0.17);
  group.add(halo);
  return group;
}

function buildPassTexture(
  data: LandingDataBundle,
  mode: ScheduleMethod
): { texture: THREE.CanvasTexture; canvas: HTMLCanvasElement } {
  const canvas = document.createElement('canvas');
  canvas.width = 3072;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;

  ctx.fillStyle = '#070d13';
  ctx.fillRect(0, 0, W, H);

  const rowTopA = 44;
  const rowHeight = 176;
  const rowTopB = 268;
  const padX = 92;
  const innerW = W - padX - 22;

  // outer frame
  ctx.strokeStyle = 'rgba(238,242,246,0.20)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  // hour grid
  for (let h = 0; h <= 24; h++) {
    const x = padX + (h / 24) * innerW;
    ctx.strokeStyle = h % 6 === 0 ? 'rgba(238,242,246,0.24)' : 'rgba(238,242,246,0.09)';
    ctx.lineWidth = h % 6 === 0 ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, 22);
    ctx.lineTo(x, H - 26);
    ctx.stroke();
    if (h % 3 === 0) {
      ctx.fillStyle = 'rgba(178,190,203,0.88)';
      ctx.font = '500 22px "IBM Plex Mono", monospace';
      ctx.fillText(`${String(h).padStart(2, '0')}`, x + 5, 26);
    }
  }

  // rows
  const rows = [
    { sat: 'sentinel-2a', label: 'SENTINEL-2A', top: rowTopA },
    { sat: 'sentinel-2b', label: 'SENTINEL-2B', top: rowTopB },
  ];
  for (const row of rows) {
    ctx.fillStyle = 'rgba(238,242,246,0.035)';
    ctx.fillRect(padX, row.top, innerW, rowHeight);
    ctx.strokeStyle = 'rgba(238,242,246,0.14)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(padX, row.top, innerW, rowHeight);

    ctx.save();
    ctx.translate(28, row.top + rowHeight / 2 + 7);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = 'rgba(178,190,203,0.75)';
    ctx.font = '600 19px "IBM Plex Mono", monospace';
    ctx.fillText(row.label, 0, 0);
    ctx.restore();
  }

  const assignments = data.schedules[mode].assignments;
  for (const a of assignments) {
    const row = a.satellite_id === 'sentinel-2a' ? rows[0] : rows[1];
    const start = Date.parse(a.start_utc);
    const end = Date.parse(a.end_utc);
    const x0 = padX + ((start - T0) / 86_400_000) * innerW;
    const x1 = padX + ((end - T0) / 86_400_000) * innerW;
    const color = STATION_META[a.antenna_id]?.css ?? '#b2becb';

    ctx.fillStyle = color;
    ctx.globalAlpha = 0.88;
    ctx.fillRect(x0, row.top + 6, Math.max(2.5, x1 - x0), rowHeight - 12);

    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(x0, row.top + 6, Math.max(2.5, x1 - x0), 2.5);

    if (x1 - x0 > 18) {
      ctx.fillStyle = 'rgba(4,8,12,0.72)';
      for (let x = x0 + 4; x < x1; x += 5) {
        ctx.fillRect(x, row.top + 9, 1, rowHeight - 18);
      }
    }
  }

  // Handover chain highlight
  if (mode === 'qslice') {
    const chain = ['qs009', 'qs010', 'qs012'];
    for (const id of chain) {
      const a = assignments.find((x) => x.pass_id === id);
      if (!a) continue;
      const row = a.satellite_id === 'sentinel-2a' ? rows[0] : rows[1];
      const x0 = padX + ((Date.parse(a.start_utc) - T0) / 86_400_000) * innerW;
      const x1 = padX + ((Date.parse(a.end_utc) - T0) / 86_400_000) * innerW;
      ctx.strokeStyle = 'rgba(250,252,255,0.95)';
      ctx.lineWidth = 4;
      ctx.strokeRect(x0 - 1, row.top + 4, Math.max(3, x1 - x0 + 2), rowHeight - 8);
    }
  }

  // conflict threads for whole-pass modes
  if (mode !== 'qslice') {
    const passById = new Map(data.passesDoc.passes.map((p) => [p.pass_id, p]));
    ctx.strokeStyle = 'rgba(255,100,100,0.72)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    for (const conflict of data.passesDoc.conflicts ?? []) {
      const a = passById.get(conflict.pass_a);
      const b = passById.get(conflict.pass_b);
      if (!a || !b) continue;
      const inWindow = (p: typeof a) =>
        Date.parse(p.aos_utc) > Date.parse('2026-11-09T06:30:00Z') &&
        Date.parse(p.aos_utc) < Date.parse('2026-11-09T09:00:00Z');
      if (!inWindow(a) || !inWindow(b)) continue;
      const xA = padX + ((Date.parse(a.aos_utc) - T0) / 86_400_000) * innerW;
      const xB = padX + ((Date.parse(b.aos_utc) - T0) / 86_400_000) * innerW;
      ctx.beginPath();
      ctx.moveTo(xA, rowTopA + rowHeight);
      ctx.lineTo(xB, rowTopB);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // ground truth note in the margin
  ctx.fillStyle = 'rgba(178,190,203,0.55)';
  ctx.font = '500 17px "IBM Plex Mono", monospace';
  ctx.fillText(
    `${assignments.length} CONTACTS · 24 H · ${mode === 'qslice' ? '15 S SLICES' : 'WHOLE PASSES'}`,
    padX,
    H - 12
  );

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return { texture, canvas };
}

function makeWallMaterial(texture: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    uniforms: {
      uMap: { value: texture },
      uFill: { value: 1 },
      uOpacity: { value: 1 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform float uFill;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        vec3 col = texture2D(uMap, vUv).rgb;
        float reveal = smoothstep(uFill - 0.012, uFill + 0.005, vUv.x);
        col = mix(col * 1.12, col * 0.38, reveal);
        float cursor = 1.0 - smoothstep(0.0, 0.0022, abs(vUv.x - uFill));
        col = mix(col, vec3(0.98, 0.98, 0.94), cursor * 0.8);
        float edge = smoothstep(0.0, 0.015, vUv.x) * smoothstep(1.0, 0.985, vUv.x);
        gl_FragColor = vec4(col, uOpacity * (0.92 + 0.08 * edge));
      }
    `,
  });
}

export class MissionScene {
  private host: HTMLElement;
  private data: LandingDataBundle;
  private variant: SceneVariant;
  private progressRef?: { current: number };
  private onFrame?: (frame: number) => void;
  private onWebGLFailure?: () => void;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private earthGroup = new THREE.Group();
  private earthMesh!: THREE.Mesh;
  private wallMesh?: THREE.Mesh;
  private wallMat?: THREE.ShaderMaterial;
  private wallTexture?: THREE.CanvasTexture;
  private mode: ScheduleMethod;
  private lastMode: ScheduleMethod;

  private stations: StationEntry[] = [];
  private s2a?: THREE.Group;
  private s2b?: THREE.Group;
  private s2aRec: satellite.SatRec;
  private s2bRec: satellite.SatRec;
  private beam?: THREE.Line;
  private beamMat?: THREE.LineBasicMaterial;
  private ghostBeam?: THREE.Line;
  private ghostMat?: THREE.LineBasicMaterial;
  private packet?: THREE.Mesh;
  private batonDot?: THREE.Mesh;
  private satLabel?: HTMLDivElement;
  private labelHost: HTMLElement | null;

  private smoothProgress = 0;
  private lastStationId = '';
  private lastPulseAt = 0;
  private raf = 0;
  private disposed = false;
  private inView = true;
  private tabVisible = true;
  private prevNow = performance.now();
  private pointer = new THREE.Vector2(0, 0);
  private pointerSmooth = new THREE.Vector2(0, 0);
  private resizeObserver: ResizeObserver;
  private intersectionObserver: IntersectionObserver;
  private disposables: Array<{ dispose: () => void }> = [];
  private tempVec = new THREE.Vector3();
  private tempNormal = new THREE.Vector3();
  private cameraLook = new THREE.Vector3();
  private cameraBase = new THREE.Vector3();
  private beamPoints = 40;
  private stationById: Record<string, StationEntry> = {};

  constructor(options: MissionSceneOptions) {
    this.host = options.host;
    this.data = options.data;
    this.variant = options.variant;
    this.progressRef = options.progressRef;
    this.onFrame = options.onFrame;
    this.onWebGLFailure = options.onWebGLFailure;
    this.mode = options.mode ?? 'qslice';
    this.lastMode = this.mode;
    this.labelHost = options.labelHost ?? null;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(this.host.clientWidth || 720, this.host.clientHeight || 520);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.host.appendChild(this.renderer.domElement);

    const onLost = (event: Event) => {
      event.preventDefault();
      this.onWebGLFailure?.();
    };
    this.renderer.domElement.addEventListener('webglcontextlost', onLost);
    this.disposables.push({
      dispose: () => this.renderer.domElement.removeEventListener('webglcontextlost', onLost),
    });

    this.camera = new THREE.PerspectiveCamera(
      this.variant === 'hero' ? 39 : 38,
      (this.host.clientWidth || 720) / Math.max(1, this.host.clientHeight || 520),
      0.1,
      120
    );

    this.scene.add(new THREE.AmbientLight(0x9db8c8, 1.15));
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
    sun.position.set(4, 8, 7);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x5bd6e6, 1.1);
    rim.position.set(-7, 2, -4);
    this.scene.add(rim);

    this.scene.add(makeStarfield(this.variant === 'hero' ? 850 : 480));

    const earthCenter =
      this.variant === 'hero' ? HERO_EARTH_CENTER : LEDGER_EARTH_CENTER;
    const earthScale =
      this.variant === 'hero' ? HERO_EARTH_SCALE : LEDGER_EARTH_SCALE;

    this.earthGroup.position.copy(earthCenter);
    this.earthGroup.scale.setScalar(earthScale);
    this.earthGroup.quaternion.copy(europeQuaternion());
    this.scene.add(this.earthGroup);

    const tex = new THREE.TextureLoader().load(earthTextureUrl);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.disposables.push({ dispose: () => tex.dispose() });

    const earthGeo = buildEarthGeometry();
    const earthMat = makeEarthMaterial(tex);
    this.earthMesh = new THREE.Mesh(earthGeo, earthMat);
    this.earthMesh.rotation.y = Math.PI; // texture longitude 0 at +X vs. ECEF +X; keep Europe aligned
    // NOTE: UVs are ECEF aligned in the geometry; no mesh rotation is required.
    this.earthMesh.rotation.y = 0;
    this.earthGroup.add(this.earthMesh);
    this.disposables.push({ dispose: () => earthGeo.dispose() }, { dispose: () => earthMat.dispose() });

    const atmosphere = makeAtmosphere(1.026, '#63d7e4', 0.6);
    this.earthGroup.add(atmosphere);
    this.disposables.push({ dispose: () => atmosphere.geometry.dispose() }, { dispose: () => (atmosphere.material as THREE.Material).dispose() });

    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeRadialTexture('rgba(50,130,145,0.26)', 'rgba(35,85,105,0.10)'),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    halo.scale.setScalar(2.7);
    halo.position.set(0, 0.15, -0.8);
    this.earthGroup.add(halo);

    this.s2aRec = satellite.twoline2satrec(
      this.data.tles['sentinel-2a'].line1,
      this.data.tles['sentinel-2a'].line2
    );
    this.s2bRec = satellite.twoline2satrec(
      this.data.tles['sentinel-2b'].line1,
      this.data.tles['sentinel-2b'].line2
    );

    this.createStations();
    this.createOrbits();
    this.createBeam();
    if (this.variant === 'ledger') this.createLedgerWall();

    this.updateCamera(0, 0, true);
    this.scene.updateMatrixWorld(true);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);

    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        this.inView = entries[0]?.isIntersecting ?? true;
      },
      { rootMargin: '180px' }
    );
    this.intersectionObserver.observe(this.host);

    const onVisibility = () => {
      this.tabVisible = !document.hidden;
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.disposables.push({
      dispose: () => document.removeEventListener('visibilitychange', onVisibility),
    });

    const onPointerMove = (event: PointerEvent) => {
      if (this.variant !== 'hero') return;
      const rect = this.host.getBoundingClientRect();
      this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    this.disposables.push({
      dispose: () => window.removeEventListener('pointermove', onPointerMove),
    });

    this.raf = requestAnimationFrame(this.animate);
  }

  private createStations() {
    const ringGeo = new THREE.RingGeometry(0.019, 0.025, 40);
    const dotGeo = new THREE.SphereGeometry(0.008, 14, 10);
    const mastGeo = new THREE.CylinderGeometry(0.0014, 0.0014, 0.11, 5);
    const pulseGeo = new THREE.RingGeometry(0.024, 0.029, 48);
    this.disposables.push(
      { dispose: () => ringGeo.dispose() },
      { dispose: () => dotGeo.dispose() },
      { dispose: () => mastGeo.dispose() },
      { dispose: () => pulseGeo.dispose() }
    );

    for (const antenna of this.data.scenario.antennas) {
      const meta = STATION_META[antenna.id] ?? {
        color: 0xe9edf2,
        css: '#e9edf2',
        short: antenna.name.toUpperCase(),
      };
      const pos = latLonToUnit(antenna.lat_deg, antenna.lon_deg);
      const normal = pos.clone().normalize();

      const dotMat = new THREE.MeshBasicMaterial({ color: meta.color });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.copy(pos).addScaledVector(normal, 0.004);
      this.earthGroup.add(dot);

      const ringMat = new THREE.MeshBasicMaterial({
        color: meta.color,
        transparent: true,
        opacity: 0.82,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(pos).addScaledVector(normal, 0.005);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      this.earthGroup.add(ring);

      const mastMat = new THREE.MeshBasicMaterial({
        color: meta.color,
        transparent: true,
        opacity: 0.62,
      });
      const mast = new THREE.Mesh(mastGeo, mastMat);
      const mastPos = pos.clone().addScaledVector(normal, 0.055);
      mast.position.copy(mastPos);
      mast.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      this.earthGroup.add(mast);

      const pulseMat = new THREE.MeshBasicMaterial({
        color: meta.color,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const pulse = new THREE.Mesh(pulseGeo, pulseMat);
      pulse.position.copy(pos).addScaledVector(normal, 0.006);
      pulse.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      this.earthGroup.add(pulse);

      this.disposables.push(
        { dispose: () => dotMat.dispose() },
        { dispose: () => ringMat.dispose() },
        { dispose: () => mastMat.dispose() },
        { dispose: () => pulseMat.dispose() }
      );

      let label: HTMLDivElement | null = null;
      if (this.labelHost) {
        label = document.createElement('div');
        label.className = `q-scene-label q-scene-label--${antenna.id.replace('-1', '')}`;
        label.innerHTML = `<span class="q-scene-label__dot" style="background:${meta.css}"></span><span class="q-scene-label__name">${meta.short}</span><span class="q-scene-label__coord">${antenna.lat_deg.toFixed(2)}°N ${antenna.lon_deg.toFixed(2)}°E</span>`;
        this.labelHost.appendChild(label);
      }

      this.stations.push({
        id: antenna.id,
        name: antenna.name,
        color: meta.color,
        colorCss: meta.css,
        pos,
        anchor: pos.clone().addScaledVector(normal, 0.14),
        pulse,
        ring,
        label: label!,
      });
      this.stationById[antenna.id] = this.stations[this.stations.length - 1];
    }
  }

  private sampleSatUnit(rec: satellite.SatRec, ms: number): THREE.Vector3 | null {
    const pv = satellite.propagate(rec, new Date(ms));
    if (!pv || !pv.position || typeof pv.position === 'boolean') return null;
    const gmst = satellite.gstime(new Date(ms));
    const geo = satellite.eciToGeodetic(pv.position, gmst);
    return latLonToUnit(satellite.degreesLat(geo.latitude), satellite.degreesLong(geo.longitude));
  }

  private createOrbits() {
    const build = (
      rec: satellite.SatRec,
      startMs: number,
      color: number,
      opacity: number
    ) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 180; i++) {
        const unit = this.sampleSatUnit(rec, startMs + i * 35_000);
        if (unit) pts.push(unit.multiplyScalar(ORBIT_RADIUS));
      }
      if (pts.length < 2) return;
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
      });
      this.earthGroup.add(new THREE.Line(geo, mat));
      this.disposables.push({ dispose: () => geo.dispose() }, { dispose: () => mat.dispose() });
    };

    build(this.s2aRec, Date.parse('2026-11-09T06:40:00Z'), 0xd8e2e6, this.variant === 'hero' ? 0.20 : 0.12);
    build(this.s2bRec, Date.parse('2026-11-09T06:55:00Z'), 0x5bd6e6, this.variant === 'hero' ? 0.38 : 0.20);

    this.s2a = makeSatellite(0xd8e2e6);
    this.s2b = makeSatellite(0x5bd6e6);
    this.earthGroup.add(this.s2a, this.s2b);
  }

  private createBeam() {
    const makeLine = (color: number, opacity: number) => {
      const arr = new Float32Array(this.beamPoints * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      const mat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const line = new THREE.Line(geo, mat);
      line.visible = false;
      this.earthGroup.add(line);
      this.disposables.push({ dispose: () => geo.dispose() }, { dispose: () => mat.dispose() });
      return { line, geo, mat };
    };

    const primary = makeLine(0x5bd6e6, 0.95);
    this.beam = primary.line;
    this.beamMat = primary.mat;
    this.beamGeo = primary.geo;

    const ghost = makeLine(0xff6464, 0.45);
    this.ghostBeam = ghost.line;
    this.ghostMat = ghost.mat;
    this.ghostGeo = ghost.geo;

    const packetMat = new THREE.MeshBasicMaterial({ color: 0xf7fdff });
    this.packet = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 12, 8), packetMat);
    this.packet.visible = false;
    this.earthGroup.add(this.packet);

    const batonMat = new THREE.MeshBasicMaterial({ color: 0xf0a43c });
    this.batonDot = new THREE.Mesh(new THREE.SphereGeometry(0.0095, 14, 10), batonMat);
    this.batonDot.visible = false;
    this.earthGroup.add(this.batonDot);

    this.disposables.push(
      { dispose: () => packetMat.dispose() },
      { dispose: () => this.packet!.geometry.dispose() },
      { dispose: () => batonMat.dispose() },
      { dispose: () => this.batonDot!.geometry.dispose() }
    );
  }

  private beamGeo?: THREE.BufferGeometry;
  private ghostGeo?: THREE.BufferGeometry;

  private createLedgerWall() {
    const geo = new THREE.PlaneGeometry(10.4, 1.75, 1, 1);
    const { texture } = buildPassTexture(this.data, this.mode);
    this.wallTexture = texture;
    const mat = makeWallMaterial(texture);
    this.wallMat = mat;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0.2, 2.45, -4.2);
    mesh.rotation.x = -0.09;
    this.scene.add(mesh);
    this.wallMesh = mesh;
    this.disposables.push(
      { dispose: () => geo.dispose() },
      { dispose: () => mat.dispose() },
      { dispose: () => texture.dispose() }
    );

    const frameGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(10.46, 1.81));
    const frameMat = new THREE.LineBasicMaterial({
      color: 0x93a4ad,
      transparent: true,
      opacity: 0.28,
    });
    const frame = new THREE.LineSegments(frameGeo, frameMat);
    frame.position.copy(mesh.position);
    frame.rotation.copy(mesh.rotation);
    frame.position.z -= 0.002;
    this.scene.add(frame);
    this.disposables.push({ dispose: () => frameGeo.dispose() }, { dispose: () => frameMat.dispose() });

    if (this.labelHost) {
      const satLabel = document.createElement('div');
      satLabel.className = 'q-scene-label q-scene-label--sat';
      satLabel.innerHTML = `<span class="q-scene-label__dot" style="background:#5bd6e6"></span><span class="q-scene-label__name">S-2B</span>`;
      this.labelHost.appendChild(satLabel);
      this.satLabel = satLabel;
    }
  }

  private updateBeamCurve(
    geo: THREE.BufferGeometry,
    from: THREE.Vector3,
    to: THREE.Vector3,
    lift: number
  ) {
    const mid = from.clone().lerp(to, 0.5);
    mid.multiplyScalar(1 + lift);
    const attr = geo.getAttribute('position') as THREE.BufferAttribute;
    const tmp = new THREE.Vector3();
    for (let i = 0; i < this.beamPoints; i++) {
      const u = i / (this.beamPoints - 1);
      const inv = 1 - u;
      tmp.set(
        inv * inv * from.x + 2 * inv * u * mid.x + u * u * to.x,
        inv * inv * from.y + 2 * inv * u * mid.y + u * u * to.y,
        inv * inv * from.z + 2 * inv * u * mid.z + u * u * to.z
      );
      attr.setXYZ(i, tmp.x, tmp.y, tmp.z);
    }
    attr.needsUpdate = true;
  }

  private updateCamera(progress: number, now: number, immediate = false) {
    const target = this.tempVec;
    if (this.variant === 'hero') {
      this.cameraBase.set(0.1, 1.05, 9.0);
      target.set(1.25, 0.1, -1.0);
      if (!immediate) {
        this.pointerSmooth.lerp(this.pointer, 0.05);
      }
      this.camera.position.copy(this.cameraBase);
      this.camera.position.x += this.pointerSmooth.x * 0.28;
      this.camera.position.y -= this.pointerSmooth.y * 0.14;
      this.cameraLook.copy(target);
      this.camera.lookAt(this.cameraLook);
      return;
    }

    const keys = [
      { p: 0.0, pos: [0.1, 1.15, 9.2], look: [0.2, 1.05, -1.4] },
      { p: 0.22, pos: [0.35, 0.55, 8.2], look: [0.3, 0.15, -0.6] },
      { p: 0.47, pos: [-0.15, 1.45, 8.8], look: [0.2, 1.75, -2.4] },
      { p: 0.7, pos: [-0.55, 0.25, 7.4], look: [0.35, 0.25, -0.2] },
      { p: 1.0, pos: [0.05, 1.25, 9.7], look: [0.2, 1.0, -1.6] },
    ];
    let a = keys[0];
    let b = keys[1];
    for (let i = 0; i < keys.length - 1; i++) {
      if (progress >= keys[i].p && progress <= keys[i + 1].p) {
        a = keys[i];
        b = keys[i + 1];
        break;
      }
    }
    const local = Math.max(0, Math.min(1, (progress - a.p) / Math.max(0.0001, b.p - a.p)));
    const eased = local * local * (3 - 2 * local);
    this.cameraBase.set(
      a.pos[0] + (b.pos[0] - a.pos[0]) * eased,
      a.pos[1] + (b.pos[1] - a.pos[1]) * eased,
      a.pos[2] + (b.pos[2] - a.pos[2]) * eased
    );
    this.camera.position.copy(this.cameraBase);
    target.set(
      a.look[0] + (b.look[0] - a.look[0]) * eased,
      a.look[1] + (b.look[1] - a.look[1]) * eased,
      a.look[2] + (b.look[2] - a.look[2]) * eased
    );
    this.cameraLook.copy(target);
    this.camera.lookAt(this.cameraLook);
  }

  private updateLabel(
    label: HTMLDivElement | null,
    localAnchor: THREE.Vector3,
    visible: boolean
  ) {
    if (!label || !this.labelHost) return;
    if (!visible) {
      label.style.opacity = '0';
      return;
    }
    const world = this.earthGroup.localToWorld(localAnchor.clone());
    const projected = world.project(this.camera);
    const x = (projected.x * 0.5 + 0.5) * 100;
    const y = (-projected.y * 0.5 + 0.5) * 100;
    const onScreen = projected.z < 1 && x > 2 && x < 98 && y > 2 && y < 98;
    label.style.opacity = onScreen ? '1' : '0';
    label.style.left = `${x}%`;
    label.style.top = `${y}%`;
    label.style.transform = 'translate(-50%, -100%)';
  }

  private activeStationAt(ms: number, mode: ScheduleMethod): StationEntry | null {
    if (mode === 'qslice') {
      if (ms >= Date.parse('2026-11-09T07:52:45Z') && ms < Date.parse('2026-11-09T08:01:00Z')) {
        return this.stationById['svalbard-1'] ?? null;
      }
      if (ms >= Date.parse('2026-11-09T08:01:15Z') && ms <= Date.parse('2026-11-09T08:06:15Z')) {
        return this.stationById['kiruna-1'] ?? null;
      }
      if (ms >= Date.parse('2026-11-09T08:06:30Z') && ms <= Date.parse('2026-11-09T08:12:30Z')) {
        return this.stationById['matera-1'] ?? null;
      }
      return null;
    }
    if (ms >= Date.parse('2026-11-09T07:56:09Z') && ms <= Date.parse('2026-11-09T08:06:18Z')) {
      return this.stationById['kiruna-1'] ?? null;
    }
    return null;
  }

  private animate = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.animate);
    if (!this.inView || !this.tabVisible) {
      this.prevNow = now;
      return;
    }
    const dt = Math.min(0.05, Math.max(0.001, (now - this.prevNow) / 1000));
    this.prevNow = now;

    const rawProgress = this.variant === 'hero' ? 0 : (this.progressRef?.current ?? 0);
    this.smoothProgress += (rawProgress - this.smoothProgress) * (1 - Math.exp(-dt * 5.2));
    const progress = this.smoothProgress;

    this.updateCamera(progress, now);

    let simMs: number;
    if (this.variant === 'hero') {
      const loop = 26 * 60 * 1000;
      simMs = Date.parse('2026-11-09T07:48:00Z') + ((now * 0.55) % loop);
    } else {
      simMs = HANDOVER_START + progress * (HANDOVER_END - HANDOVER_START);
    }

    const s2aPos = this.sampleSatUnit(this.s2aRec, simMs);
    const s2bPos = this.sampleSatUnit(this.s2bRec, simMs);

    const placeSat = (group: THREE.Group | undefined, unit: THREE.Vector3 | null) => {
      if (!group) return;
      if (!unit) {
        group.visible = false;
        return;
      }
      group.visible = true;
      group.position.copy(unit).multiplyScalar(ORBIT_RADIUS);
      group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), unit.clone().normalize());
    };
    placeSat(this.s2a, s2aPos);
    placeSat(this.s2b, s2bPos);

    // Earth shimmer: extremely slow rotation of the graticule only, not the planet.
    const mat = this.earthMesh.material as THREE.ShaderMaterial;
    mat.uniforms.uTime.value = now * 0.001;

    const activeStation = this.activeStationAt(simMs, this.mode);
    const s2bUnit = s2bPos ? s2bPos.clone().multiplyScalar(ORBIT_RADIUS) : null;

    if (this.beam && this.beamMat && this.beamGeo && this.packet && s2bUnit) {
      if (activeStation) {
        this.beam.visible = true;
        this.beamMat.color.setHex(activeStation.color);
        this.updateBeamCurve(this.beamGeo, s2bUnit, activeStation.pos, 0.28);
        const pulseU = (now * 0.00055) % 1;
        this.packet.visible = true;
        this.packet.position.lerpVectors(s2bUnit, activeStation.pos, pulseU);
        this.packet.position.multiplyScalar(1 + Math.sin(pulseU * Math.PI) * 0.16);
      } else {
        this.beam.visible = false;
        this.packet.visible = false;
      }
    }

    // Conflict ghost in whole-pass modes: the dropped Svalbard pass.
    if (
      this.ghostBeam &&
      this.ghostGeo &&
      this.ghostMat &&
      s2bUnit &&
      this.mode !== 'qslice' &&
      simMs < Date.parse('2026-11-09T08:03:29Z')
    ) {
      const sval = this.stationById['svalbard-1'];
      if (sval) {
        this.ghostBeam.visible = true;
        this.updateBeamCurve(this.ghostGeo, s2bUnit, sval.pos, 0.22);
      }
    } else if (this.ghostBeam) {
      this.ghostBeam.visible = false;
    }

    // Station pulse on handover / active acquisition.
    const activeId = activeStation?.id ?? '';
    if (activeId && activeId !== this.lastStationId) {
      this.lastStationId = activeId;
      this.lastPulseAt = now;
    }
    for (const station of this.stations) {
      const active = station.id === activeId;
      const pulseAge = (now - this.lastPulseAt) / 1000;
      const pulseActive = active && pulseAge < 1.4;
      station.pulse.visible = pulseActive;
      if (pulseActive) {
        const t = pulseAge / 1.4;
        station.pulse.scale.setScalar(1 + t * 2.4);
        (station.pulse.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.8;
      }
      (station.ring.material as THREE.MeshBasicMaterial).opacity = active ? 1 : 0.7;
      station.ring.scale.setScalar(active ? 1.35 : 1);
      this.updateLabel(
        station.label,
        station.anchor,
        this.variant === 'ledger' ? true : true
      );
    }

    if (this.satLabel && this.s2b && this.s2b.visible && s2bPos) {
      const anchor = s2bPos.clone().multiplyScalar(ORBIT_RADIUS + 0.045);
      this.updateLabel(this.satLabel, anchor, true);
    }

    if (this.wallMesh && this.wallMat) {
      const fill =
        this.mode === 'qslice'
          ? Math.max(0.12, Math.min(1, 0.1 + progress * 1.1))
          : Math.max(0.45, Math.min(0.72, 0.45 + progress * 0.4));
      this.wallMat.uniforms.uFill.value = fill;
    }

    if (this.variant === 'ledger' && this.onFrame) {
      const frames = 5;
      this.onFrame(Math.min(frames - 1, Math.floor(progress * frames + 0.0001)));
    }

    this.scene.updateMatrixWorld();
    this.renderer.render(this.scene, this.camera);
  };

  public setMode(mode: ScheduleMethod) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (this.variant !== 'ledger' || !this.wallMat) return;
    const { texture } = buildPassTexture(this.data, mode);
    const previous = this.wallTexture;
    this.wallTexture = texture;
    this.wallMat.uniforms.uMap.value = texture;
    previous?.dispose();
  }

  public resetCamera() {
    this.smoothProgress = 0;
  }

  private resize() {
    if (this.disposed) return;
    const w = this.host.clientWidth || 720;
    const h = Math.max(1, this.host.clientHeight || 520);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    for (const d of this.disposables) {
      try {
        d.dispose();
      } catch {
        /* noop */
      }
    }
    this.stations.forEach((station) => station.label?.remove());
    this.satLabel?.remove();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
