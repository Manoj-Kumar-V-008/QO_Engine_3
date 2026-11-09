"""Find when satellites are visible above antennas' minimum elevation."""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import numpy as np
from skyfield.api import EarthSatellite, load, wgs84

RISE, PEAK, SET = 0, 1, 2  # event codes returned by Skyfield's find_events
TS = load.timescale()  # Skyfield's time handling; create once and reuse

# ASSUMPTION (a modelling choice, not a Sentinel-2 specification):
# the usable data rate steps up with elevation, because a low satellite is far away
# and its signal is weaker. Each pair is (minimum elevation in degrees, fraction of
# the satellite's maximum rate). Highest threshold first.
RATE_STEPS = [(30.0, 1.00), (20.0, 0.75), (10.0, 0.50), (0.0, 0.25)]
FLAT_STEPS = [(0.0, 1.00)]  # full rate for the whole pass: the optimistic upper bound


@dataclass
class Pass:
    aos_utc: datetime
    los_utc: datetime
    max_elevation_deg: float

    @property
    def duration_s(self):
        return (self.los_utc - self.aos_utc).total_seconds()


def iso_z(moment):
    """Format a datetime as ISO 8601 UTC with a trailing Z, e.g. 2026-11-09T01:16:40Z."""
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_z(text):
    """Parse an ISO 8601 UTC string ending in Z back into a timezone-aware datetime."""
    return datetime.strptime(text, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def rate_fraction(elevation_deg, steps=RATE_STEPS):
    """Fraction of the maximum data rate available at this elevation."""
    for minimum_elevation, fraction in steps:
        if elevation_deg >= minimum_elevation:
            return fraction
    return steps[-1][1]


def volume_gb(duration_s, rate_mbps):
    """Upper bound of data moved in one pass: seconds x megabits/s -> megabits -> gigabytes."""
    return duration_s * rate_mbps / 8 / 1000


def pass_volume_gb(tle, antenna, aos_utc, los_utc, max_rate_mbps, steps=RATE_STEPS, step_s=10):
    """Data moved in one pass, adding up the rate slice by slice as elevation changes."""
    name, line1, line2 = tle
    satellite = EarthSatellite(line1, line2, name, TS)
    station = wgs84.latlon(antenna.lat_deg, antenna.lon_deg, elevation_m=antenna.alt_m)

    duration_s = (los_utc - aos_utc).total_seconds()
    slices = max(1, round(duration_s / step_s))
    slice_s = duration_s / slices
    midpoints_s = (np.arange(slices) + 0.5) * slice_s  # middle of each slice
    times = TS.tt_jd(TS.from_datetime(aos_utc).tt + midpoints_s / 86400.0)

    altitude, _azimuth, _distance = (satellite - station).at(times).altaz()
    total_megabits = sum(
        max_rate_mbps * rate_fraction(float(el), steps) * slice_s for el in altitude.degrees
    )
    return total_megabits / 8 / 1000


def tle_epoch_utc(tle):
    name, line1, line2 = tle
    return EarthSatellite(line1, line2, name, TS).epoch.utc_datetime()


def find_passes(tle, antenna, start_utc, duration_hours):
    """Return complete passes (rise -> peak -> set) of one satellite over one antenna."""
    name, line1, line2 = tle
    satellite = EarthSatellite(line1, line2, name, TS)
    station = wgs84.latlon(antenna.lat_deg, antenna.lon_deg, elevation_m=antenna.alt_m)

    t0 = TS.from_datetime(start_utc)
    t1 = TS.from_datetime(start_utc + timedelta(hours=duration_hours))
    times, events = satellite.find_events(
        station, t0, t1, altitude_degrees=antenna.min_elevation_deg
    )

    passes = []
    rise = peak = None
    for t, event in zip(times, events):
        if event == RISE:
            rise, peak = t, None
        elif event == PEAK and rise is not None:
            peak = t
        elif event == SET and rise is not None and peak is not None:
            altitude, _azimuth, _distance = (satellite - station).at(peak).altaz()
            passes.append(Pass(rise.utc_datetime(), t.utc_datetime(), float(altitude.degrees)))
            rise = peak = None
    return passes


def find_all_passes(scenario, tles):
    """Every pass of every satellite over every antenna, as JSON-ready dicts sorted by AOS.

    tles maps norad_id -> (name, line1, line2).
    """
    found = []
    for sat in scenario.satellites:
        for ant in scenario.antennas:
            passes = find_passes(
                tles[sat.norad_id], ant, scenario.start_utc, scenario.duration_hours
            )
            for p in passes:
                found.append((p, sat, ant))
    found.sort(key=lambda item: (item[0].aos_utc, item[1].id, item[2].id))

    records = []
    for number, (p, sat, ant) in enumerate(found, start=1):
        records.append(
            {
                "pass_id": f"p{number:03d}",
                "satellite_id": sat.id,
                "antenna_id": ant.id,
                "aos_utc": iso_z(p.aos_utc),
                "los_utc": iso_z(p.los_utc),
                "max_elevation_deg": round(p.max_elevation_deg, 1),
                "duration_s": round(p.duration_s),
                "max_volume_gb": round(volume_gb(p.duration_s, sat.downlink_rate_mbps), 1),
                "expected_volume_gb": round(
                    pass_volume_gb(
                        tles[sat.norad_id], ant, p.aos_utc, p.los_utc, sat.downlink_rate_mbps
                    ),
                    1,
                ),
            }
        )
    return records