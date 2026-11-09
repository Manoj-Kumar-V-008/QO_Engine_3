from datetime import datetime, timezone

from engine.pass_finder import find_passes
from engine.scenario import Antenna

# Synthetic TLE for a sun-synchronous orbit (~786 km, 98.6 deg), not a real satellite
TLE = (
    "SYNTHETIC-SSO",
    "1 40697U          26312.50000000  .00000000  00000-0  30000-4 0    05",
    "2 40697  98.6000 123.0000 0001000  90.0002   0.0000 14.30818000    04",
)
SVALBARD = Antenna(id="sv", name="Svalbard", lat_deg=78.23, lon_deg=15.41, alt_m=450, min_elevation_deg=5)
EQUATOR = Antenna(id="eq", name="Equator", lat_deg=0.0, lon_deg=0.0, alt_m=0, min_elevation_deg=5)
START = datetime(2026, 11, 8, 12, 0, tzinfo=timezone.utc)


def test_passes_are_ordered_and_above_mask():
    passes = find_passes(TLE, SVALBARD, START, 24)
    assert len(passes) > 0
    for p in passes:
        assert p.aos_utc < p.los_utc
        assert p.max_elevation_deg >= SVALBARD.min_elevation_deg
        assert 0 < p.duration_s < 20 * 60  # LEO passes last minutes, not hours


def test_polar_station_sees_more_passes_than_equator():
    polar = find_passes(TLE, SVALBARD, START, 24)
    equator = find_passes(TLE, EQUATOR, START, 24)
    assert len(polar) > len(equator)