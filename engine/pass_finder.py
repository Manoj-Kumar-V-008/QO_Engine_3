"""Phase 1 : Find when a satellite is visible above an antenna's minimum elevation. 
(core simulation logic + orbital mechanics+skyfield)"""

import sys
from dataclasses import dataclass
from datetime import datetime, timedelta

from skyfield.api import EarthSatellite, load, wgs84

from engine.celestrak import fetch_tle
from engine.scenario import load_scenario

RISE, PEAK, SET = 0, 1, 2  # event codes returned by Skyfield's find_events


@dataclass
class Pass:
    aos_utc: datetime #time satellite is visible
    los_utc: datetime #time satellite is not visible
    max_elevation_deg: float #highest elevation during pass

    @property
    def duration_s(self):
        return (self.los_utc - self.aos_utc).total_seconds()


def find_passes(tle, antenna, start_utc, duration_hours):
    """Return complete passes (rise -> peak -> set) inside the time window."""
    name, line1, line2 = tle
    ts = load.timescale()
    satellite = EarthSatellite(line1, line2, name, ts)
    station = wgs84.latlon(antenna.lat_deg, antenna.lon_deg, elevation_m=antenna.alt_m)

    t0 = ts.from_datetime(start_utc) #starting time
    t1 = ts.from_datetime(start_utc + timedelta(hours=duration_hours)) #ending time
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
            passes.append(Pass(rise.utc_datetime(), t.utc_datetime(), altitude.degrees))
            rise = peak = None
    return passes


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python -m engine.pass_finder <scenario.json>")
    scenario = load_scenario(sys.argv[1])
    satellite = scenario.satellites[0]
    antenna = scenario.antennas[0]
    tle = fetch_tle(satellite.norad_id)
    print(f"{satellite.id} over {antenna.name}, min elevation {antenna.min_elevation_deg} deg")
    passes = find_passes(tle, antenna, scenario.start_utc, scenario.duration_hours)
    for i, p in enumerate(passes, start=1):
        minutes, seconds = divmod(int(p.duration_s), 60)
        print(
            f"{i:2d}  AOS {p.aos_utc:%Y-%m-%d %H:%M:%S}  LOS {p.los_utc:%H:%M:%S} UTC  "
            f"{minutes:2d}m{seconds:02d}s  max el {p.max_elevation_deg:5.1f} deg"
        )
    print(f"{len(passes)} passes")


"""
Important findings
1. Multiple satellites and antennas

Currently:
satellite = scenario.satellites[0]antenna = scenario.antennas[0]



Only the first entries are used.

Eventually, you'll need nested loops to calculate passes for every satellite-ground-station combination.

2. Partial passes at simulation boundaries

This is particularly important.

Your function promises complete passes inside the time window.

Imagine:
- Simulation starts at 10:00.
- Satellite rises at 09:55.
- Satellite peaks at 10:05.
- Satellite sets at 10:15.
The simulation detects the peak and set, but the rise happened before the search began.

Your current code ignores this partial pass.

Similarly, a pass that starts inside the window but sets after the window ends is ignored.

That's acceptable if your requirement is strictly complete passes, but it could miss useful communication opportunities near the boundaries.

3. Time accuracy and TLE age

Skyfield calculates positions using the supplied TLE, but predictions become less reliable as the orbital elements age.

The simulation should eventually check TLE epoch against the simulation time.

4. No explicit pass-finder tests yet

I'd recommend eventually testing:
- No passes found.
- One complete pass.
- Multiple passes.
- Pass beginning before the window.
- Pass ending after the window.
- Minimum elevation changes.
"""