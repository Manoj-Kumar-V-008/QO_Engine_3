import * as Cesium from 'cesium';
import { registerOrbitalMaterials } from './shaders';

export interface SceneInitOptions {
  container: HTMLElement;
  startUtc: string;
  durationHours: number;
  initialSpeed?: number;
  hdMode: boolean;
}

/**
 * Applies either HD Cinema Quality (ACES + selective bloom + MSAA/crisp resolution)
 * or Perf 60fps fallback smoothly without destroying the Cesium Viewer.
 */
export function applyQualityProfile(viewer: Cesium.Viewer, hdMode: boolean): void {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  viewer.resolutionScale = hdMode ? Math.min(dpr, 1.5) : 0.85;
  viewer.scene.globe.maximumScreenSpaceError = hdMode ? 1.5 : 2.2;
  viewer.scene.highDynamicRange = hdMode;

  const stages = viewer.scene.postProcessStages;
  stages.fxaa.enabled = !hdMode;

  if (hdMode) {
    try {
      stages.tonemapper = Cesium.Tonemapper.ACES;
      stages.exposure = 1.05;
    } catch {
      // Fallback if tonemapper API differs
    }
    stages.bloom.enabled = true;
    stages.bloom.uniforms.contrast = 128.0;
    stages.bloom.uniforms.brightness = -0.42;
    stages.bloom.uniforms.glowOnly = false;
    stages.bloom.uniforms.delta = 0.85;
    stages.bloom.uniforms.sigma = 2.0;
    stages.bloom.uniforms.stepSize = 1.0;
  } else {
    stages.bloom.enabled = false;
  }
}

/**
 * Bootstraps the CesiumJS Viewer with cinema-grade Earth look-development:
 *  - Color-graded Esri World Imagery daylight base
 *  - NASA GIBS VIIRS Black Marble night city lights auto-blended across the solar terminator
 *  - Vivid Rayleigh/Mie atmospheric horizon limb + ground atmosphere + subtle fog
 *  - HDR + ACES filmic tone mapping + restrained selective bloom
 */
export function initCesiumScene(options: SceneInitOptions): Cesium.Viewer {
  registerOrbitalMaterials();

  const startJd = Cesium.JulianDate.fromIso8601(options.startUtc);
  const stopJd = Cesium.JulianDate.addHours(
    startJd,
    options.durationHours,
    new Cesium.JulianDate()
  );

  const clock = new Cesium.Clock({
    startTime: startJd,
    currentTime: startJd.clone(),
    stopTime: stopJd,
    clockRange: Cesium.ClockRange.LOOP_STOP,
    clockStep: Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER,
    multiplier: options.initialSpeed ?? 60,
    shouldAnimate: true,
  });

  // 1. Daylight Earth Imagery (Esri World Imagery — keep contrast=1.0 & gamma=1.0 to avoid negative HDR values)
  const dayProvider = new Cesium.UrlTemplateImageryProvider({
    url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maximumLevel: 16,
    credit: 'Esri World Imagery',
  });
  const dayLayer = new Cesium.ImageryLayer(dayProvider);
  dayLayer.brightness = 0.94;
  dayLayer.contrast = 1.0;
  dayLayer.saturation = 0.88;
  dayLayer.gamma = 1.0;
  dayLayer.dayAlpha = 1.0;
  dayLayer.nightAlpha = 0.28;

  const viewer = new Cesium.Viewer(options.container, {
    clockViewModel: new Cesium.ClockViewModel(clock),
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    msaaSamples: 4,
    baseLayer: dayLayer,
  });

  // 2. Night City Lights (NASA GIBS VIIRS Black Marble — pure linear brightness, zero negative HDR clipping!)
  try {
    const nightProvider = new Cesium.UrlTemplateImageryProvider({
      url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png',
      maximumLevel: 8,
      credit: 'NASA Earth Observatory / VIIRS Black Marble',
    });
    nightProvider.errorEvent.addEventListener(() => {
      // Graceful fallback: night side remains naturally lit without console spam
    });

    const nightLayer = viewer.imageryLayers.addImageryProvider(nightProvider);
    nightLayer.dayAlpha = 0.0;
    nightLayer.nightAlpha = 1.0;
    nightLayer.brightness = 3.8;
    nightLayer.contrast = 1.0;
    nightLayer.saturation = 1.05;
    nightLayer.gamma = 1.0;
  } catch {
    // Offline-safe fallback
  }

  // 3. Space Environment, Atmosphere & Lighting
  const { scene } = viewer;
  scene.backgroundColor = Cesium.Color.fromCssColorString('#02050d');
  scene.globe.baseColor = Cesium.Color.fromCssColorString('#081529');
  scene.globe.enableLighting = true;
  scene.globe.dynamicAtmosphereLighting = true;
  // Keep subtle cerulean atmospheric rim visible even on the night hemisphere (NASA Eyes look)
  scene.globe.dynamicAtmosphereLightingFromSun = false;
  scene.globe.showGroundAtmosphere = true;
  scene.globe.atmosphereHueShift = -0.02;
  scene.globe.atmosphereSaturationShift = 0.14;
  scene.globe.atmosphereBrightnessShift = 0.08;
  scene.globe.nightFadeInDistance = 4.5e7;
  scene.globe.nightFadeOutDistance = 1.8e7;
  scene.globe.tileCacheSize = 150;

  if (scene.skyAtmosphere) {
    scene.skyAtmosphere.show = true;
    scene.skyAtmosphere.hueShift = -0.02;
    scene.skyAtmosphere.saturationShift = 0.14;
    scene.skyAtmosphere.brightnessShift = 0.06;
    scene.skyAtmosphere.atmosphereLightIntensity = 15.0;
  }

  if (scene.sun) {
    scene.sun.show = true;
    scene.sun.glowFactor = 0.65;
  }

  scene.fog.enabled = true;
  scene.fog.density = 0.0001;
  scene.fog.minimumBrightness = 0.04;

  // Smooth camera ergonomics with reliable wheel, pinch, and drag zooming
  const ssc = scene.screenSpaceCameraController;
  ssc.enableInputs = true;
  ssc.enableZoom = true;
  ssc.enableRotate = true;
  ssc.enableTilt = true;
  ssc.enableLook = true;
  ssc.zoomEventTypes = [
    Cesium.CameraEventType.WHEEL,
    Cesium.CameraEventType.PINCH,
    Cesium.CameraEventType.RIGHT_DRAG,
  ];
  ssc.minimumZoomDistance = 18_000;
  ssc.maximumZoomDistance = 42_000_000;
  ssc.inertiaSpin = 0.88;
  ssc.inertiaZoom = 0.82;

  applyQualityProfile(viewer, options.hdMode);
  return viewer;
}
