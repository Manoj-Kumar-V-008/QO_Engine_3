import copy

import pytest
from pydantic import ValidationError

from engine.scenario import Scenario, load_scenario

VALID = {
    "schema_version": "0.1",
    "scenario_id": "test",
    "start_utc": "2026-11-09T00:00:00Z",
    "duration_hours": 24,
    "satellites": [
        {
            "id": "sat-a",
            "norad_id": 40697,
            "buffer_capacity_gb": 64,
            "initial_buffer_gb": 0,
            "generation_gb_per_hour": 2.0,
            "downlink_rate_mbps": 560
        }
    ],
    "antennas": [
        {
            "id": "ant-a",
            "name": "Test station",
            "lat_deg": 78.23,
            "lon_deg": 15.41,
            "min_elevation_deg": 5,
        }
    ],
}


def valid():
    return copy.deepcopy(VALID)


def test_valid_scenario_parses():
    s = Scenario.model_validate(valid())
    assert s.satellites[0].norad_id == 40697
    assert s.start_utc.tzinfo is not None


def test_latitude_out_of_range_fails():
    d = valid()
    d["antennas"][0]["lat_deg"] = 95
    with pytest.raises(ValidationError):
        Scenario.model_validate(d)


def test_initial_buffer_above_capacity_fails():
    d = valid()
    d["satellites"][0]["initial_buffer_gb"] = 100
    with pytest.raises(ValidationError):
        Scenario.model_validate(d)


def test_start_time_without_timezone_fails():
    d = valid()
    d["start_utc"] = "2026-11-09T00:00:00"
    with pytest.raises(ValidationError):
        Scenario.model_validate(d)


def test_real_scenario_file_loads():
    s = load_scenario("data/scenario.json")
    assert len(s.satellites) == 2 and len(s.antennas) == 3

def test_zero_downlink_rate_fails():
    d = valid()
    d["satellites"][0]["downlink_rate_mbps"] = 0
    with pytest.raises(ValidationError):
        Scenario.model_validate(d)