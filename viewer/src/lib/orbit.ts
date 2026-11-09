import * as Cesium from 'cesium';
import * as satellite from 'satellite.js';
import type { TleEntry } from '../types/engine';

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
