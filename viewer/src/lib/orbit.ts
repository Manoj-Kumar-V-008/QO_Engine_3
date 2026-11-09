import * as Cesium from 'cesium';
import * as satellite from 'satellite.js';
import type { AntennaConfig, TleEntry } from '../types/engine';

export function buildSatellitePositionProperty(
  tle: TleEntry,
  startIso: string,
  durationHours: number,
  stepSeconds = 30
): Cesium.SampledPositionProperty {
  const satrec = satellite.twoline2satrec(tle.line1, tle.line2);
  const property = new Cesium.SampledPositionProperty();

  property.setInterpolationOptions({
    interpolationDegree: 5,
    interpolationAlgorithm: Cesium.LagrangePolynomialApproximation,
  });

  const startMs = new Date(startIso).getTime();
  const totalSteps = Math.ceil((durationHours * 3600) / stepSeconds);

  for (let i = 0; i <= totalSteps; i++) {
    const currentMs = startMs + i * stepSeconds * 1000;
    const date = new Date(currentMs);
    const pv = satellite.propagate(satrec, date);

    if (pv && pv.position && typeof pv.position !== 'boolean') {
      const gmst = satellite.gstime(date);
      const geo = satellite.eciToGeodetic(pv.position, gmst);
      const cartesian = Cesium.Cartesian3.fromRadians(
        geo.longitude,
        geo.latitude,
        geo.height * 1000
      );
      const julianDate = Cesium.JulianDate.fromDate(date);
      property.addSample(julianDate, cartesian);
    }
  }

  return property;
}

/**
 * Compute the ground visibility footprint radius (in meters along Earth's surface)
 * for a satellite at `satAltitudeKm` above an antenna with `minElevationDeg`.
 */
export function computeFootprintRadiusMeters(
  minElevationDeg: number,
  satAltitudeKm = 786.0
): number {
  const earthRadiusKm = 6371.0;
  const elRad = Cesium.Math.toRadians(minElevationDeg);
  const ratio = (earthRadiusKm / (earthRadiusKm + satAltitudeKm)) * Math.cos(elRad);
  const clamped = Math.min(1.0, Math.max(-1.0, ratio));
  const nadirAngleRad = Math.asin(clamped);
  const centralAngleRad = Math.PI / 2 - elRad - nadirAngleRad;
  return Math.max(100_000, earthRadiusKm * 1000 * centralAngleRad);
}

/**
 * Convert an AntennaConfig into its 3D ECEF Cartesian3 coordinate.
 */
export function antennaCartesian(antenna: AntennaConfig): Cesium.Cartesian3 {
  return Cesium.Cartesian3.fromDegrees(
    antenna.lon_deg,
    antenna.lat_deg,
    antenna.alt_m
  );
}
