from datetime import datetime, timezone

import pytest

from engine.pass_finder import find_all_passes, find_passes, volume_gb
from engine.scenario import Scenario

# Synthetic TLEs: same sun-synchronous orbit (~786 km, 98.6 deg), half an orbit apart.
# Not real satellites; they keep the tests offline and repeatable.
TLE_A = (
    "SYNTH-A",
    "1 40697U          26312.50000000  .00000000  00000-0  30000-4 0    05",
    "2 40697  98.6000 123.0000 0001000  90.0002   0.0000 14.30818000    04",
)
TLE_B = (
    "SYNTH-B",
    "1 42063U          26312.50000000  .00000000  00000-0  30000-4 0    04",
    "2 42063  98.6000 123.0000 0001000  90.0002 180.0000 14.30818000    02",
)
TLES = {40697: TLE_A, 42063: TLE_B}
START = datetime(2026, 11, 8, 12, 0, tzinfo=timezone.utc)

SCENARIO = Scenario.model_validate(
    {
        "schema_version": "0.1",
        "scenario_id": "test",
        "start_utc": "2026-11-08T12:00:00Z",
        "duration_hours": 24,
        "satellites": [
            {"id": "sat-a", "norad_id": 40697, "buffer_capacity_gb": 300,
             "initial_buffer_gb": 0, "generation_gb_per_hour": 62.5, "downlink_rate_mbps": 560},
            {"id": "sat-b", "norad_id": 42063, "buffer_capacity_gb": 300,
             "initial_buffer_gb": 0, "generation_gb_per_hour": 62.5, "downlink_rate_mbps": 560},
        ],
        "antennas": [
            {"id": "polar", "name": "Polar", "lat_deg": 78.23, "lon_deg": 15.41, "min_elevation_deg": 5},
            {"id": "equator", "name": "Equator", "lat_deg": 0.0, "lon_deg": 0.0, "min_elevation_deg": 5},
        ],
    }
)


def test_volume_formula_matches_hand_calculation():
    # 750 s at 560 Mbit/s = 420,000 Mbit = 52,500 MB = 52.5 GB
    assert volume_gb(750, 560) == pytest.approx(52.5)


def test_single_satellite_passes_are_sane():
    antenna = SCENARIO.antennas[0]
    passes = find_passes(TLE_A, antenna, START, 24)
    assert len(passes) > 0
    for p in passes:
        assert p.aos_utc < p.los_utc
        assert p.max_elevation_deg >= antenna.min_elevation_deg
        assert 0 < p.duration_s < 20 * 60


def test_all_passes_cover_every_pair_and_are_sorted():
    records = find_all_passes(SCENARIO, TLES)
    pairs = {(r["satellite_id"], r["antenna_id"]) for r in records}
    assert ("sat-a", "polar") in pairs and ("sat-b", "polar") in pairs
    aos_times = [r["aos_utc"] for r in records]
    assert aos_times == sorted(aos_times)  # ISO strings sort chronologically


def test_pass_ids_are_unique_and_volumes_follow_formula():
    records = find_all_passes(SCENARIO, TLES)
    ids = [r["pass_id"] for r in records]
    assert len(ids) == len(set(ids))
    assert ids[0] == "p001"
    for r in records:
        assert r["expected_volume_gb"] == pytest.approx(
            volume_gb(r["duration_s"], 560), abs=0.1
        )


def test_two_satellites_give_more_passes_than_one():
    both = find_all_passes(SCENARIO, TLES)
    only_a = [r for r in both if r["satellite_id"] == "sat-a"]
    assert len(both) > len(only_a)