import pytest

from engine.conflicts import find_conflicts
from engine.greedy import greedy_schedule, hours_until_full
from engine.pass_finder import find_all_passes
from engine.schedule import evaluate_schedule
from engine.scenario import Scenario
from test_pass_finder import SCENARIO as ORBIT_SCENARIO
from test_pass_finder import TLES


def make_scenario(initial_a=0, initial_b=0):
    return Scenario.model_validate(
        {
            "schema_version": "0.1",
            "scenario_id": "t",
            "start_utc": "2026-11-09T00:00:00Z",
            "duration_hours": 24,
            "satellites": [
                {"id": "A", "norad_id": 1, "buffer_capacity_gb": 300, "initial_buffer_gb": initial_a,
                 "generation_gb_per_hour": 62.5, "downlink_rate_mbps": 560},
                {"id": "B", "norad_id": 2, "buffer_capacity_gb": 300, "initial_buffer_gb": initial_b,
                 "generation_gb_per_hour": 62.5, "downlink_rate_mbps": 560},
            ],
            "antennas": [
                {"id": "x", "name": "X", "lat_deg": 0, "lon_deg": 0, "min_elevation_deg": 5, "setup_s": 120},
                {"id": "y", "name": "Y", "lat_deg": 10, "lon_deg": 10, "min_elevation_deg": 5, "setup_s": 120},
            ],
        }
    )


def rec(pass_id, sat, ant, aos, los, volume):
    return {
        "pass_id": pass_id, "satellite_id": sat, "antenna_id": ant,
        "aos_utc": f"2026-11-09T{aos}Z", "los_utc": f"2026-11-09T{los}Z",
        "max_elevation_deg": 40, "duration_s": 600, "max_volume_gb": volume,
        "expected_volume_gb": volume,
    }


def test_hours_until_full():
    sat = make_scenario().satellites[0]
    assert hours_until_full(sat, 237.5) == pytest.approx(1.0)  # 62.5 GB left at 62.5 GB/h
    assert hours_until_full(sat, 300) == 0


def test_satellite_that_fills_soonest_wins_even_with_the_smaller_pass():
    # A is nearly full, B is empty. They want the same dish at the same time.
    scenario = make_scenario(initial_a=290, initial_b=0)
    passes = [
        rec("p1", "B", "x", "00:05:00", "00:15:00", 50),  # B has the bigger pass
        rec("p2", "A", "x", "00:05:00", "00:15:00", 30),
    ]
    chosen = greedy_schedule(scenario, passes)
    assert [p["pass_id"] for p in chosen] == ["p2"]


def test_equal_urgency_falls_back_to_the_bigger_pass():
    scenario = make_scenario(initial_a=0, initial_b=0)
    passes = [
        rec("p1", "A", "x", "01:00:00", "01:10:00", 20),
        rec("p2", "B", "x", "01:00:00", "01:10:00", 45),
    ]
    assert [p["pass_id"] for p in greedy_schedule(scenario, passes)] == ["p2"]


def test_passes_without_conflicts_are_all_chosen():
    scenario = make_scenario()
    passes = [
        rec("p1", "A", "x", "01:00:00", "01:10:00", 20),
        rec("p2", "B", "x", "03:00:00", "03:10:00", 20),
        rec("p3", "A", "y", "05:00:00", "05:10:00", 20),
    ]
    assert len(greedy_schedule(scenario, passes)) == 3


def test_greedy_schedule_has_no_conflicts_on_orbit_data():
    passes = find_all_passes(ORBIT_SCENARIO, TLES)
    chosen = greedy_schedule(ORBIT_SCENARIO, passes)
    setup_s = {a.id: a.setup_s for a in ORBIT_SCENARIO.antennas}
    assert 0 < len(chosen) <= len(passes)
    assert find_conflicts(chosen, setup_s) == []


def test_evaluate_schedule_rejects_conflicting_choices():
    scenario = make_scenario()
    passes = [
        rec("p1", "A", "x", "01:00:00", "01:10:00", 20),
        rec("p2", "B", "x", "01:05:00", "01:15:00", 20),
    ]
    with pytest.raises(ValueError):
        evaluate_schedule(scenario, passes, passes, "bad")


def test_schedule_summary_is_consistent():
    scenario = make_scenario()
    passes = [rec("p1", "A", "x", "01:00:00", "01:10:00", 20)]
    schedule = evaluate_schedule(scenario, passes, passes, "greedy")
    summary = schedule["summary"]
    assert schedule["method"] == "greedy"
    assert summary["passes_used"] == 1 and summary["passes_available"] == 1
    # generated 62.5 GB/h x 24 h x 2 satellites = 3000 GB, 300 GB capacity each
    assert summary["gb_delivered"] == pytest.approx(20, abs=0.5)
    assert summary["gb_delivered"] + summary["overflow_gb"] + 600 == pytest.approx(3000, abs=1)
    assert len(schedule["buffer_timeline"]["A"]) == 144  # one point per 10 minutes