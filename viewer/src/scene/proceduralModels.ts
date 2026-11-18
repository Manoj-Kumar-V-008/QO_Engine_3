import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

export interface ProceduralAssetUrls {
  satellites: Record<string, string>;
  groundDishes: Record<string, string>;
}

const blobUrlCache = new Map<string, string>();
const inFlightCache = new Map<string, Promise<string>>();

/**
 * Generates a procedural crinkled gold Kapton MLI texture (albedo + micro-facet roughness feel).
 */
function createKaptonTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#c88d22';
  ctx.fillRect(0, 0, size, size);

  // Deterministic pseudo-random crinkled foil facets
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < 420; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 6 + rand() * 18;
    const shade = rand();
    ctx.fillStyle =
      shade > 0.62
        ? 'rgba(255, 224, 130, 0.24)'
        : shade < 0.35
        ? 'rgba(110, 62, 8, 0.25)'
        : 'rgba(218, 158, 38, 0.20)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * r * 2, y + (rand() - 0.5) * r * 2);
    ctx.lineTo(x + (rand() - 0.5) * r * 2, y + (rand() - 0.5) * r * 2);
    ctx.closePath();
    ctx.fill();
  }

  // Subtle thermal blanket seam lines
  ctx.strokeStyle = 'rgba(72, 42, 6, 0.45)';
  ctx.lineWidth = 2;
  for (let step = 64; step < size; step += 64) {
    ctx.beginPath();
    ctx.moveTo(step, 0);
    ctx.lineTo(step, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, step);
    ctx.lineTo(size, step);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Generates a realistic deep-sapphire photovoltaic solar array cell grid texture.
 */
function createSolarArrayTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Deep silicon indigo gradient
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#0a193d');
  grad.addColorStop(0.5, '#12295c');
  grad.addColorStop(1, '#0b1c44');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Cell rows & columns
  const cols = 16;
  const rows = 8;
  const cw = w / cols;
  const ch = h / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const shade = ((r * 7 + c * 13) % 5) * 4;
      ctx.fillStyle = `rgba(${24 + shade}, ${58 + shade}, ${135 + shade}, 0.45)`;
      ctx.fillRect(c * cw + 2, r * ch + 2, cw - 4, ch - 4);
    }
  }

  // Crisp silver busbars
  ctx.strokeStyle = 'rgba(186, 214, 245, 0.55)';
  ctx.lineWidth = 1.2;
  for (let c = 0; c <= cols; c++) {
    ctx.beginPath();
    ctx.moveTo(c * cw, 0);
    ctx.lineTo(c * cw, h);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(148, 185, 228, 0.35)';
  ctx.lineWidth = 1;
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * ch);
    ctx.lineTo(w, r * ch);
    ctx.stroke();
  }

  // Gold hinge strips between the 3 solar sub-panels
  ctx.fillStyle = '#d49b2a';
  ctx.fillRect(w / 3 - 2, 0, 4, h);
  ctx.fillRect((2 * w) / 3 - 2, 0, 4, h);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Generates radial RF panel seams for the white parabolic ground-station reflector.
 */
function createDishReflectorTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#e5ebf2';
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(100, 116, 139, 0.32)';
  ctx.lineWidth = 1.5;
  for (let y = 32; y < size; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  for (let x = 32; x < size; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function exportGroupToGlbBlobUrl(group: THREE.Group): Promise<string> {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      group,
      (result) => {
        if (result instanceof ArrayBuffer) {
          const blob = new Blob([result], { type: 'model/gltf-binary' });
          resolve(URL.createObjectURL(blob));
        } else {
          const json = JSON.stringify(result);
          const blob = new Blob([json], { type: 'model/gltf+json' });
          resolve(URL.createObjectURL(blob));
        }
      },
      (err) => reject(err),
      { binary: true }
    );
  });
}

function disposeGroupResources(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if ('map' in m && m.map instanceof THREE.Texture) {
          m.map.dispose();
        }
        m.dispose();
      }
    }
  });
}

/**
 * Builds an aerospace-proportioned Sentinel-2 spacecraft GLB in Three.js glTF space:
 *  - +X = Along-track orbital velocity
 *  - -Y = Nadir (Earth-facing MSI optical telescope & X-band downlink dish)
 *  - +Z = Cross-track asymmetric 3-panel deployable solar wing
 */
export async function getSentinel2GlbUrl(accentHex: string): Promise<string> {
  const cacheKey = `sentinel2:${accentHex}`;
  const existing = blobUrlCache.get(cacheKey);
  if (existing) return existing;
  const inflight = inFlightCache.get(cacheKey);
  if (inflight) return inflight;

  const task = (async () => {
    const root = new THREE.Group();
    root.name = 'sentinel2_root';

    const kaptonTex = createKaptonTexture();
    const solarTex = createSolarArrayTexture();
    const accentColor = new THREE.Color(accentHex);

    const goldMliMat = new THREE.MeshStandardMaterial({
      map: kaptonTex,
      color: 0xf4c452,
      metalness: 0.86,
      roughness: 0.30,
    });

    const radiatorMat = new THREE.MeshStandardMaterial({
      color: 0xdbe5f0,
      metalness: 0.72,
      roughness: 0.24,
    });

    const titaniumMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.78,
      roughness: 0.36,
    });

    const carbonBaffleMat = new THREE.MeshStandardMaterial({
      color: 0x0b101a,
      metalness: 0.12,
      roughness: 0.85,
    });

    const solarMat = new THREE.MeshStandardMaterial({
      map: solarTex,
      color: 0xffffff,
      metalness: 0.42,
      roughness: 0.18,
      side: THREE.DoubleSide,
    });

    const accentBeaconMat = new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 1.5,
      metalness: 0.2,
      roughness: 0.3,
    });

    const dishMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.28,
      roughness: 0.35,
      side: THREE.DoubleSide,
    });

    // 1. Main spacecraft bus (octagonal-inspired beveled aerospace core: 3.4m x 2.0m x 1.8m)
    const busGroup = new THREE.Group();
    busGroup.name = 'bus';

    const mainCore = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.9, 1.8), goldMliMat);
    busGroup.add(mainCore);

    // Chamfered forward avionics nose cone (+X velocity facing)
    const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 1.12, 0.85, 6), goldMliMat);
    nose.rotation.z = -Math.PI / 2;
    nose.position.set(2.12, 0, 0);
    busGroup.add(nose);

    // Optical Solar Radiator (OSR) silver louvers on zenith (+Y) & anti-sun (-Z) faces
    const zenithRadiator = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 1.45), radiatorMat);
    zenithRadiator.position.set(0.1, 0.99, 0);
    busGroup.add(zenithRadiator);

    const sideRadiator = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.35, 0.08), radiatorMat);
    sideRadiator.position.set(0, 0.1, -0.94);
    busGroup.add(sideRadiator);

    // Star-tracker optical hoods on zenith deck
    const starTracker1 = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 0.38, 12), titaniumMat);
    starTracker1.position.set(0.9, 1.18, -0.35);
    starTracker1.rotation.z = -0.35;
    busGroup.add(starTracker1);

    const starTracker2 = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 0.38, 12), titaniumMat);
    starTracker2.position.set(0.9, 1.18, 0.35);
    starTracker2.rotation.z = 0.25;
    starTracker2.rotation.x = 0.3;
    busGroup.add(starTracker2);

    // Laser Optical Communication Payload (OCP) dome on zenith aft
    const ocpBase = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.35, 16), radiatorMat);
    ocpBase.position.set(-1.05, 1.15, 0);
    busGroup.add(ocpBase);
    const ocpOptic = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), carbonBaffleMat);
    ocpOptic.position.set(-1.05, 1.35, 0);
    busGroup.add(ocpOptic);

    // Subtle spacecraft ID telemetry accent rail along bus flank
    const beaconStripTop = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.1, 0.09), accentBeaconMat);
    beaconStripTop.position.set(0, 0.85, 0.92);
    busGroup.add(beaconStripTop);
    const beaconStripSide = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.1, 0.09), accentBeaconMat);
    beaconStripSide.position.set(0, 0.85, -0.92);
    busGroup.add(beaconStripSide);

    root.add(busGroup);

    // 2. Nadir-Pointing Multi-Spectral Instrument (MSI) Optical Baffle (-Y facing Earth!)
    const msiGroup = new THREE.Group();
    msiGroup.name = 'msi_baffle';
    const msiHousing = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.72, 1.25), radiatorMat);
    msiHousing.position.set(0.55, -1.25, 0);
    msiGroup.add(msiHousing);

    const msiAperture = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.24, 0.92), carbonBaffleMat);
    msiAperture.position.set(0.55, -1.56, 0);
    msiGroup.add(msiAperture);

    // Optical glass lens subtle tint
    const lensMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      emissive: 0x0284c7,
      emissiveIntensity: 0.35,
      metalness: 0.9,
      roughness: 0.1,
    });
    const msiLens = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 20), lensMat);
    msiLens.position.set(0.55, -1.66, 0);
    msiGroup.add(msiLens);
    root.add(msiGroup);

    // 3. Nadir-Canted X-Band RF Downlink Parabolic Horn (-Y aft)
    const dishGroup = new THREE.Group();
    dishGroup.name = 'downlink_dish';
    const dishPts: THREE.Vector2[] = [];
    for (let i = 0; i <= 10; i++) {
      const r = (i / 10) * 0.62;
      const y = r * r * 0.48;
      dishPts.push(new THREE.Vector2(r, y));
    }
    const xBandDish = new THREE.Mesh(new THREE.LatheGeometry(dishPts, 20), dishMat);
    xBandDish.rotation.x = Math.PI; // open toward nadir (-Y)
    xBandDish.position.set(-1.15, -1.22, 0);
    dishGroup.add(xBandDish);

    const xBandStem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.35, 10), titaniumMat);
    xBandStem.position.set(-1.15, -1.04, 0);
    dishGroup.add(xBandStem);

    const feedHorn = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.28, 10), goldMliMat);
    feedHorn.position.set(-1.15, -1.4, 0);
    dishGroup.add(feedHorn);
    root.add(dishGroup);

    // 4. Single Asymmetric 3-Panel Deployable Solar Wing (+Z cross-track, authentic to Sentinel-2!)
    const wingGroup = new THREE.Group();
    wingGroup.name = 'solar_wing';

    const yoke = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.95, 10), titaniumMat);
    yoke.rotation.x = Math.PI / 2;
    yoke.position.set(-0.2, 0, 1.35);
    wingGroup.add(yoke);

    // Backing structural frame + 3 panels
    const wingSpan = 5.4;
    const wingChord = 1.95;
    const solarPanel = new THREE.Mesh(new THREE.BoxGeometry(wingChord, 0.07, wingSpan), solarMat);
    solarPanel.position.set(-0.2, 0, 1.85 + wingSpan / 2);
    // Slight 18 deg cant to catch sun angle dynamically
    solarPanel.rotation.x = 0.0;
    solarPanel.rotation.z = 0.28;
    wingGroup.add(solarPanel);

    // Titanium edge spars along the solar wing
    const sparLeft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, wingSpan + 0.08), titaniumMat);
    sparLeft.position.set(-0.2 - wingChord / 2, 0, 1.85 + wingSpan / 2);
    sparLeft.rotation.z = 0.28;
    wingGroup.add(sparLeft);

    const sparRight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, wingSpan + 0.08), titaniumMat);
    sparRight.position.set(-0.2 + wingChord / 2, 0, 1.85 + wingSpan / 2);
    sparRight.rotation.z = 0.28;
    wingGroup.add(sparRight);

    // Subtle wingtip navigation marker
    const wingTip = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.14), accentBeaconMat);
    wingTip.position.set(-0.2, 0, 1.85 + wingSpan + 0.08);
    wingGroup.add(wingTip);

    root.add(wingGroup);

    const url = await exportGroupToGlbBlobUrl(root);
    disposeGroupResources(root);
    blobUrlCache.set(cacheKey, url);
    inFlightCache.delete(cacheKey);
    return url;
  })();

  inFlightCache.set(cacheKey, task);
  return task;
}

/**
 * Builds an articulated deep-space / LEO parabolic ground station GLB in Three.js glTF space:
 *  - +Y = Local Up (Cesium +Z in ENU)
 *  - Named node `azimuth_yoke` (rotates around +Y for Azimuth)
 *  - Named node `elevation_dish` (tilts around +Z for Elevation; at el=0 points +X East, at el=90 points +Y Up)
 */
export async function getGroundDishGlbUrl(accentHex: string): Promise<string> {
  const cacheKey = `ground_dish:${accentHex}`;
  const existing = blobUrlCache.get(cacheKey);
  if (existing) return existing;
  const inflight = inFlightCache.get(cacheKey);
  if (inflight) return inflight;

  const task = (async () => {
    const root = new THREE.Group();
    root.name = 'ground_station_root';

    const dishTex = createDishReflectorTexture();
    const accentColor = new THREE.Color(accentHex);

    const concreteMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.15,
      roughness: 0.82,
    });

    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.72,
      roughness: 0.42,
    });

    const dishReflectorMat = new THREE.MeshStandardMaterial({
      map: dishTex,
      color: 0xf1f5f9,
      metalness: 0.2,
      roughness: 0.36,
      side: THREE.DoubleSide,
    });

    const radomeMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.08,
      roughness: 0.55,
    });

    const beaconMat = new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 1.8,
      metalness: 0.15,
      roughness: 0.25,
    });

    // 1. Concrete Foundation Pad + Pedestal
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 4.3, 0.65, 8), concreteMat);
    pad.position.set(0, 0.325, 0);
    root.add(pad);

    // Glowing telemetry status ring around pad edge
    const statusRing = new THREE.Mesh(new THREE.TorusGeometry(3.9, 0.11, 8, 24), beaconMat);
    statusRing.rotation.x = Math.PI / 2;
    statusRing.position.set(0, 0.68, 0);
    root.add(statusRing);

    // Adjacent geodesic telemetry radome / equipment shelter for recognizable ground station scale
    const shelter = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.1, 1.6), concreteMat);
    shelter.position.set(-2.2, 1.15, -1.8);
    root.add(shelter);

    const miniRadome = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95, 1), radomeMat);
    miniRadome.position.set(2.3, 1.25, -1.7);
    root.add(miniRadome);

    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.55, 3.2, 12), steelMat);
    pedestal.position.set(0, 2.2, 0);
    root.add(pedestal);

    // 2. Rotating Azimuth Yoke (pivot at y = 3.8)
    const azimuthYoke = new THREE.Group();
    azimuthYoke.name = 'azimuth_yoke';
    azimuthYoke.position.set(0, 3.8, 0);

    const turret = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.75, 14), steelMat);
    azimuthYoke.add(turret);

    // Twin elevation trunnion arms
    const armLeft = new THREE.Mesh(new THREE.BoxGeometry(0.45, 2.1, 0.42), steelMat);
    armLeft.position.set(0, 1.15, 1.05);
    azimuthYoke.add(armLeft);

    const armRight = new THREE.Mesh(new THREE.BoxGeometry(0.45, 2.1, 0.42), steelMat);
    armRight.position.set(0, 1.15, -1.05);
    azimuthYoke.add(armRight);

    // 3. Tilting Elevation Dish Assembly (pivot at yoke local y = 2.0)
    // Built so boresight points along +Y at elevation = 90 deg (zenith),
    // and tilts around local Z or X smoothly!
    const elevationDish = new THREE.Group();
    elevationDish.name = 'elevation_dish';
    elevationDish.position.set(0, 2.0, 0);

    // Parabolic reflector profile (radius 3.4m, smooth dish curvature, boresight along +Y)
    const profile: THREE.Vector2[] = [];
    for (let i = 0; i <= 14; i++) {
      const r = (i / 14) * 3.4;
      const y = (r * r) * 0.135;
      profile.push(new THREE.Vector2(r, y));
    }
    const reflector = new THREE.Mesh(new THREE.LatheGeometry(profile, 28), dishReflectorMat);
    reflector.position.set(0, 0.25, 0);
    elevationDish.add(reflector);

    // Dish rim accent collar
    const rim = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.1, 8, 28), steelMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, 0.25 + 3.4 * 3.4 * 0.135, 0);
    elevationDish.add(rim);

    // Counterweight hub behind dish
    const counterweight = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.1, 0.9, 12), steelMat);
    counterweight.position.set(0, -0.35, 0);
    elevationDish.add(counterweight);

    // 3-Strut Feed Tripod + Sub-reflector Horn
    const subReflectorY = 2.75;
    for (let s = 0; s < 3; s++) {
      const ang = (s / 3) * Math.PI * 2;
      const baseR = 2.35;
      const bx = Math.cos(ang) * baseR;
      const bz = Math.sin(ang) * baseR;
      const by = 0.25 + baseR * baseR * 0.135;

      const start = new THREE.Vector3(bx, by, bz);
      const end = new THREE.Vector3(0, subReflectorY, 0);
      const dir = new THREE.Vector3().subVectors(end, start);
      const len = dir.length();

      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, len, 6), steelMat);
      strut.position.copy(start).addScaledVector(dir, 0.5);
      strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      elevationDish.add(strut);
    }

    const subReflector = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.22, 0.35, 14), steelMat);
    subReflector.position.set(0, subReflectorY, 0);
    elevationDish.add(subReflector);

    const feedBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), beaconMat);
    feedBeacon.position.set(0, subReflectorY + 0.26, 0);
    elevationDish.add(feedBeacon);

    azimuthYoke.add(elevationDish);
    root.add(azimuthYoke);

    const url = await exportGroupToGlbBlobUrl(root);
    disposeGroupResources(root);
    blobUrlCache.set(cacheKey, url);
    inFlightCache.delete(cacheKey);
    return url;
  })();

  inFlightCache.set(cacheKey, task);
  return task;
}

/**
 * Revokes all cached procedural GLB Blob URLs (call on full app unmount).
 */
export function disposeProceduralModels(): void {
  for (const url of blobUrlCache.values()) {
    URL.revokeObjectURL(url);
  }
  blobUrlCache.clear();
  inFlightCache.clear();
}
