import * as Cesium from 'cesium';

const RF_PULSE_TYPE = 'QoRfDownlinkPulse';
const CONFLICT_ARC_TYPE = 'QoConflictClashPulse';
const STATION_RADAR_TYPE = 'QoStationHorizonRadar';
const SWATH_SCAN_TYPE = 'QoNadirSwathScan';

type MaterialCache = {
  addMaterial: (type: string, config: Record<string, unknown>) => void;
  getMaterial: (type: string) => unknown;
};

function getMaterialCache(): MaterialCache {
  return (Cesium.Material as unknown as { _materialCache: MaterialCache })._materialCache;
}

let materialsRegistered = false;

/**
 * Registers all custom CesiumJS Fabric GLSL materials once.
 * Safe to call repeatedly across hot-reloads or viewer re-mounts.
 */
export function registerOrbitalMaterials(): void {
  if (materialsRegistered) return;
  const cache = getMaterialCache();

  if (!cache.getMaterial(RF_PULSE_TYPE)) {
    cache.addMaterial(RF_PULSE_TYPE, {
      fabric: {
        type: RF_PULSE_TYPE,
        uniforms: {
          color: new Cesium.Color(0.22, 0.74, 0.97, 1.0),
          pulseColor: new Cesium.Color(0.9, 0.99, 1.0, 1.0),
          speed: 1.8,
          repeat: 7.0,
          glowPower: 0.32,
          intensity: 1.0,
        },
        source: /* glsl */ `
          uniform vec4 color;
          uniform vec4 pulseColor;
          uniform float speed;
          uniform float repeat;
          uniform float glowPower;
          uniform float intensity;

          czm_material czm_getMaterial(czm_materialInput materialInput) {
            czm_material material = czm_getDefaultMaterial(materialInput);
            vec2 st = materialInput.st;

            float distFromCenter = abs(st.t - 0.5) * 2.0;
            float core = pow(max(0.0, 1.0 - distFromCenter), 2.1);
            float halo = exp(-distFromCenter * distFromCenter * 4.2) * glowPower;

            // Telemetry packets travel along st.s from satellite (1.0) down to antenna (0.0)
            float t = czm_frameNumber * 0.018 * speed;
            float wave = fract(st.s * repeat + t);
            float packet = smoothstep(0.0, 0.14, wave) * smoothstep(0.52, 0.14, wave);

            // Secondary high-frequency carrier shimmer
            float microWave = fract(st.s * (repeat * 2.5) + t * 1.65);
            float microPacket = smoothstep(0.0, 0.12, microWave) * smoothstep(0.32, 0.12, microWave) * 0.35;

            float endFade = smoothstep(0.0, 0.035, st.s) * smoothstep(1.0, 0.965, st.s);
            float energy = packet + microPacket;

            vec3 finalColor = mix(color.rgb, pulseColor.rgb, clamp(energy * 0.82 + core * 0.38, 0.0, 1.0));
            float alpha = (core * 0.68 + halo + energy * core * 0.95) * endFade * color.a * intensity;

            material.diffuse = finalColor;
            material.emission = finalColor * (0.78 + energy * 1.2) * intensity;
            material.alpha = clamp(alpha, 0.0, 1.0);
            return material;
          }
        `,
      },
      translucent: () => true,
    });
  }

  if (!cache.getMaterial(CONFLICT_ARC_TYPE)) {
    cache.addMaterial(CONFLICT_ARC_TYPE, {
      fabric: {
        type: CONFLICT_ARC_TYPE,
        uniforms: {
          color: new Cesium.Color(0.96, 0.25, 0.37, 0.92),
          speed: 1.4,
          dashes: 12.0,
        },
        source: /* glsl */ `
          uniform vec4 color;
          uniform float speed;
          uniform float dashes;

          czm_material czm_getMaterial(czm_materialInput materialInput) {
            czm_material material = czm_getDefaultMaterial(materialInput);
            vec2 st = materialInput.st;

            float radial = pow(max(0.0, 1.0 - abs(st.t - 0.5) * 2.0), 1.7);
            float t = czm_frameNumber * 0.022 * speed;
            float phase = fract(st.s * dashes - t);
            float dashMask = smoothstep(0.08, 0.16, phase) * smoothstep(0.58, 0.50, phase);
            float pulse = 0.72 + 0.28 * sin(czm_frameNumber * 0.09);
            float endFade = smoothstep(0.0, 0.05, st.s) * smoothstep(1.0, 0.95, st.s);

            material.diffuse = color.rgb;
            material.emission = color.rgb * (0.85 * pulse);
            material.alpha = clamp(radial * dashMask * endFade * color.a * pulse, 0.0, 1.0);
            return material;
          }
        `,
      },
      translucent: () => true,
    });
  }

  if (!cache.getMaterial(STATION_RADAR_TYPE)) {
    cache.addMaterial(STATION_RADAR_TYPE, {
      fabric: {
        type: STATION_RADAR_TYPE,
        uniforms: {
          color: new Cesium.Color(0.06, 0.73, 0.51, 0.85),
          activeLock: 0.0,
          innerRatio30: 0.43,
          midRatio15: 0.67,
        },
        source: /* glsl */ `
          uniform vec4 color;
          uniform float activeLock;
          uniform float innerRatio30;
          uniform float midRatio15;

          czm_material czm_getMaterial(czm_materialInput materialInput) {
            czm_material material = czm_getDefaultMaterial(materialInput);
            vec2 centered = (materialInput.st - 0.5) * 2.0;
            float r = length(centered);
            if (r > 1.0) {
              discard;
            }

            // Concentric elevation contours: 30 deg full-rate, 15 deg mid, 5 deg horizon mask
            float ring30 = smoothstep(0.015, 0.0, abs(r - innerRatio30)) * (0.48 + 0.25 * activeLock);
            float ring15 = smoothstep(0.012, 0.0, abs(r - midRatio15)) * 0.28;
            float outer5 = smoothstep(0.016, 0.0, abs(r - 0.985)) * (0.72 + 0.25 * activeLock);

            // Subtle cardinal ticks (N-S / E-W)
            float axisX = smoothstep(0.007, 0.0, abs(centered.x)) * step(0.14, r) * step(r, 0.98) * 0.14;
            float axisY = smoothstep(0.007, 0.0, abs(centered.y)) * step(0.14, r) * step(r, 0.98) * 0.14;

            // Expanding acquisition radar pulse wave when locked onto a satellite
            float pulseR = fract(czm_frameNumber * 0.011);
            float pulseRing = smoothstep(0.045, 0.0, abs(r - pulseR)) * (1.0 - pulseR) * activeLock * 0.82;

            // Subtle rotating sweep beam during active pass
            float angle = atan(centered.y, centered.x);
            float sweepAngle = mod(czm_frameNumber * 0.035, 6.2831853) - 3.1415926;
            float dAngle = mod(angle - sweepAngle + 6.2831853, 6.2831853);
            float sweep = smoothstep(0.75, 0.0, dAngle) * (1.0 - r * 0.4) * activeLock * 0.18;

            // Soft interior fill (stronger inside 30 deg 560 Mbps core)
            float innerCore = smoothstep(innerRatio30 + 0.02, innerRatio30 - 0.04, r) * (0.04 + 0.05 * activeLock);
            float outerFill = (1.0 - r * 0.65) * (0.035 + 0.035 * activeLock);

            float intensity = clamp(
              outerFill + innerCore + ring30 + ring15 + outer5 + axisX + axisY + pulseRing + sweep,
              0.0,
              1.0
            );

            vec3 tint = mix(color.rgb, vec3(0.92, 1.0, 0.98), pulseRing * 0.55);
            material.diffuse = tint;
            material.emission = tint * (0.38 + 0.65 * activeLock + pulseRing * 0.45);
            material.alpha = intensity * color.a;
            return material;
          }
        `,
      },
      translucent: () => true,
    });
  }

  if (!cache.getMaterial(SWATH_SCAN_TYPE)) {
    cache.addMaterial(SWATH_SCAN_TYPE, {
      fabric: {
        type: SWATH_SCAN_TYPE,
        uniforms: {
          color: new Cesium.Color(0.22, 0.74, 0.97, 0.18),
        },
        source: /* glsl */ `
          uniform vec4 color;

          czm_material czm_getMaterial(czm_materialInput materialInput) {
            czm_material material = czm_getDefaultMaterial(materialInput);
            vec2 st = materialInput.st;

            // Crisp lateral swath edge rails
            float edge = smoothstep(0.05, 0.0, st.t) + smoothstep(0.95, 1.0, st.t);
            // Subtle animated MSI optical scanline sweep
            float scan = fract(st.s * 6.0 - czm_frameNumber * 0.015);
            float scanLine = smoothstep(0.0, 0.08, scan) * smoothstep(0.24, 0.08, scan) * 0.25;
            float alpha = clamp((0.35 + edge * 0.9 + scanLine) * color.a, 0.0, 0.55);

            material.diffuse = color.rgb;
            material.emission = color.rgb * (0.45 + edge * 0.65);
            material.alpha = alpha;
            return material;
          }
        `,
      },
      translucent: () => true,
    });
  }

  materialsRegistered = true;
}

/**
 * Custom MaterialProperty for active RF downlink telemetry beams.
 */
export class RfDownlinkPulseMaterialProperty {
  private readonly _definitionChanged = new Cesium.Event();
  private readonly _color: Cesium.Color;
  private readonly _pulseColor: Cesium.Color;
  private readonly _getIntensity?: (time: Cesium.JulianDate) => number;
  private readonly _speed: number;
  private readonly _repeat: number;

  constructor(options: {
    color: Cesium.Color;
    pulseColor?: Cesium.Color;
    speed?: number;
    repeat?: number;
    getIntensity?: (time: Cesium.JulianDate) => number;
  }) {
    registerOrbitalMaterials();
    this._color = options.color;
    this._pulseColor = options.pulseColor ?? Cesium.Color.fromCssColorString('#f0f9ff');
    this._speed = options.speed ?? 1.8;
    this._repeat = options.repeat ?? 7.0;
    this._getIntensity = options.getIntensity;
  }

  get isConstant(): boolean {
    return false;
  }

  get definitionChanged(): Cesium.Event {
    return this._definitionChanged;
  }

  getType(): string {
    return RF_PULSE_TYPE;
  }

  getValue(time: Cesium.JulianDate, result?: Record<string, unknown>): Record<string, unknown> {
    const out = result ?? {};
    out.color = this._color;
    out.pulseColor = this._pulseColor;
    out.speed = this._speed;
    out.repeat = this._repeat;
    out.glowPower = 0.32;
    out.intensity = this._getIntensity ? this._getIntensity(time) : 1.0;
    return out;
  }

  equals(other?: unknown): boolean {
    return this === other;
  }
}

/**
 * Custom MaterialProperty for contested / dropped conflict links.
 */
export class ConflictClashMaterialProperty {
  private readonly _definitionChanged = new Cesium.Event();
  private readonly _color: Cesium.Color;

  constructor(color = Cesium.Color.fromCssColorString('#f43f5e').withAlpha(0.9)) {
    registerOrbitalMaterials();
    this._color = color;
  }

  get isConstant(): boolean {
    return false;
  }

  get definitionChanged(): Cesium.Event {
    return this._definitionChanged;
  }

  getType(): string {
    return CONFLICT_ARC_TYPE;
  }

  getValue(_time: Cesium.JulianDate, result?: Record<string, unknown>): Record<string, unknown> {
    const out = result ?? {};
    out.color = this._color;
    out.speed = 1.4;
    out.dashes = 12.0;
    return out;
  }

  equals(other?: unknown): boolean {
    return this === other;
  }
}

/**
 * Custom MaterialProperty for ground station concentric elevation rings + acquisition radar pulse.
 */
export class StationHorizonRadarMaterialProperty {
  private readonly _definitionChanged = new Cesium.Event();
  private readonly _color: Cesium.Color;
  private readonly _innerRatio30: number;
  private readonly _midRatio15: number;
  private readonly _isLocked: (time: Cesium.JulianDate) => boolean;

  constructor(options: {
    color: Cesium.Color;
    innerRatio30: number;
    midRatio15: number;
    isLocked: (time: Cesium.JulianDate) => boolean;
  }) {
    registerOrbitalMaterials();
    this._color = options.color;
    this._innerRatio30 = options.innerRatio30;
    this._midRatio15 = options.midRatio15;
    this._isLocked = options.isLocked;
  }

  get isConstant(): boolean {
    return false;
  }

  get definitionChanged(): Cesium.Event {
    return this._definitionChanged;
  }

  getType(): string {
    return STATION_RADAR_TYPE;
  }

  getValue(time: Cesium.JulianDate, result?: Record<string, unknown>): Record<string, unknown> {
    const out = result ?? {};
    out.color = this._color;
    out.activeLock = this._isLocked(time) ? 1.0 : 0.0;
    out.innerRatio30 = this._innerRatio30;
    out.midRatio15 = this._midRatio15;
    return out;
  }

  equals(other?: unknown): boolean {
    return this === other;
  }
}

/**
 * Custom MaterialProperty for the Sentinel-2 290 km MSI optical imaging swath.
 */
export class NadirSwathMaterialProperty {
  private readonly _definitionChanged = new Cesium.Event();
  private readonly _color: Cesium.Color;

  constructor(color: Cesium.Color) {
    registerOrbitalMaterials();
    this._color = color;
  }

  get isConstant(): boolean {
    return false;
  }

  get definitionChanged(): Cesium.Event {
    return this._definitionChanged;
  }

  getType(): string {
    return SWATH_SCAN_TYPE;
  }

  getValue(_time: Cesium.JulianDate, result?: Record<string, unknown>): Record<string, unknown> {
    const out = result ?? {};
    out.color = this._color;
    return out;
  }

  equals(other?: unknown): boolean {
    return this === other;
  }
}

/**
 * Subtle aerospace Fresnel Earthshine rim + active downlink glow CustomShader
 * for 3D glTF spacecraft models so they remain sculptural even on Earth's night side.
 */
export function createSpacecraftCustomShader(accentHex: string): Cesium.CustomShader {
  const accent = Cesium.Color.fromCssColorString(accentHex);
  return new Cesium.CustomShader({
    uniforms: {
      u_accent: {
        type: Cesium.UniformType.VEC3,
        value: new Cesium.Cartesian3(accent.red, accent.green, accent.blue),
      },
      u_downlinkActive: {
        type: Cesium.UniformType.FLOAT,
        value: 0.0,
      },
    },
    fragmentShaderText: /* glsl */ `
      void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
        vec3 n = normalize(fsInput.attributes.normalEC);
        vec3 v = normalize(-fsInput.attributes.positionEC);
        float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.8);
        float rimStrength = mix(0.28, 0.78, u_downlinkActive);
        material.emissive += u_accent * fresnel * rimStrength + vec3(0.06, 0.09, 0.14) * fresnel;
      }
    `,
  });
}
