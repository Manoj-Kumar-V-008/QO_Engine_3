import pulp
import pytest

from engine.conflicts import find_conflicts
from engine.greedy import greedy_schedule
from engine.optimizer import optimize_schedule, pick_solver
from engine.pass_finder import find_all_passes
from engine.schedule import evaluate_schedule
from engine.scenario import Scenario
from test_greedy import make_scenario, rec
from test_pass_finder import SCENARIO as ORBIT_SCENARIO
from test_pass_finder import TLE_A

# Same orbit as TLE_A but only 20 degrees behind it, so both satellites compete for the same dishes.
TLE_CLOSE = (
    "SYNTH-C",
    "1 42063U          26312.50000000  .00000000  00000-0  30000-4 0    04",
    "2 42063  98.6000 123.0000 0001000  90.0002  20.0000 14.30818000    05",
)


def ids(passes):
    return [p["pass_id"] for p in passes]


def test_optimizer_beats_greedy_when_greedy_takes_the_wrong_pass():
    # p2 overlaps both p1 and p3. Greedy grabs the single biggest pass (p2, 25 GB);
    # the best plan is p1 + p3 (40 GB).
    scenario = make_scenario()
    passes = [
        rec("p1", "A", "x", "01:00:00", "01:10:00", 20),
        rec("p2", "B", "x", "01:05:00", "01:25:00", 25),
        rec("p3", "A", "x", "01:15:00", "01:30:00", 20),
    ]
    assert ids(greedy_schedule(scenario, passes)) == ["p2"]
    assert ids(optimize_schedule(scenario, passes)) == ["p1", "p3"]


def test_optimizer_cannot_send_more_than_the_satellite_has_stored():
    # Pass p1 could carry 100 GB, but only about 41.7 GB exists 40 minutes after launch.
    scenario = make_scenario()
    passes = [
        rec("p1", "A", "x", "00:30:00", "00:40:00", 100),
        rec("p2", "A", "x", "05:00:00", "05:10:00", 50),
    ]
    chosen = optimize_schedule(scenario, passes)
    assert ids(chosen) == ["p1", "p2"]
    summary = evaluate_schedule(scenario, passes, chosen, "optimizer")["summary"]
    assert summary["gb_delivered"] == pytest.approx(41.7 + 50, abs=1.0)


def test_optimizer_schedule_is_conflict_free_and_at_least_as_good_as_greedy():
    data = ORBIT_SCENARIO.model_dump(mode="json")
    data["antennas"] = [
        {"id": "svalbard", "name": "S", "lat_deg": 78.23, "lon_deg": 15.41, "alt_m": 450,
         "min_elevation_deg": 5, "setup_s": 120},
        {"id": "kiruna", "name": "K", "lat_deg": 67.86, "lon_deg": 20.96, "alt_m": 400,
         "min_elevation_deg": 5, "setup_s": 120},
        {"id": "matera", "name": "M", "lat_deg": 40.65, "lon_deg": 16.70, "alt_m": 540,
         "min_elevation_deg": 5, "setup_s": 120},
    ]
    scenario = Scenario.model_validate(data)
    passes = find_all_passes(scenario, {40697: TLE_A, 42063: TLE_CLOSE})
    setup_s = {a.id: a.setup_s for a in scenario.antennas}

    greedy = greedy_schedule(scenario, passes)
    best = optimize_schedule(scenario, passes)
    assert find_conflicts(best, setup_s) == []

    greedy_gb = evaluate_schedule(scenario, passes, greedy, "greedy")["summary"]["gb_delivered"]
    best_gb = evaluate_schedule(scenario, passes, best, "optimizer")["summary"]["gb_delivered"]
    assert best_gb >= greedy_gb - 0.05


def test_missing_solver_gives_a_helpful_error(monkeypatch):
    monkeypatch.setattr(pulp, "listSolvers", lambda onlyAvailable=False: [])
    with pytest.raises(RuntimeError, match="highspy"):
        pick_solver(10)
