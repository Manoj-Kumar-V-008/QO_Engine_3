from engine.conflicts import find_conflicts, pass_conflict

SETUP = {"x": 120, "y": 120}


def rec(pass_id, sat, ant, aos, los):
    return {
        "pass_id": pass_id, "satellite_id": sat, "antenna_id": ant,
        "aos_utc": f"2026-11-09T{aos}Z", "los_utc": f"2026-11-09T{los}Z",
        "expected_volume_gb": 10,
    }


def test_overlap_on_same_antenna_is_a_conflict():
    a = rec("p1", "sat-1", "x", "01:00:00", "01:10:00")
    b = rec("p2", "sat-2", "x", "01:05:00", "01:15:00")
    assert pass_conflict(a, b, SETUP) == "same_antenna"


def test_gap_shorter_than_setup_time_is_a_conflict():
    a = rec("p1", "sat-1", "x", "01:00:00", "01:10:00")
    too_close = rec("p2", "sat-2", "x", "01:11:00", "01:20:00")  # 60 s gap, needs 120 s
    far_enough = rec("p3", "sat-2", "x", "01:12:30", "01:20:00")  # 150 s gap
    assert pass_conflict(a, too_close, SETUP) == "same_antenna"
    assert pass_conflict(a, far_enough, SETUP) is None


def test_one_satellite_cannot_use_two_antennas_at_once():
    a = rec("p1", "sat-1", "x", "01:00:00", "01:10:00")
    b = rec("p2", "sat-1", "y", "01:05:00", "01:15:00")
    assert pass_conflict(a, b, SETUP) == "same_satellite"


def test_different_satellites_on_different_antennas_do_not_conflict():
    a = rec("p1", "sat-1", "x", "01:00:00", "01:10:00")
    b = rec("p2", "sat-2", "y", "01:00:00", "01:10:00")
    assert pass_conflict(a, b, SETUP) is None


def test_find_conflicts_lists_each_pair_once_with_reason():
    passes = [
        rec("p1", "sat-1", "x", "01:00:00", "01:10:00"),
        rec("p2", "sat-2", "x", "01:05:00", "01:15:00"),
        rec("p3", "sat-1", "y", "05:00:00", "05:10:00"),
    ]
    assert find_conflicts(passes, SETUP) == [
        {"pass_a": "p1", "pass_b": "p2", "reason": "same_antenna"}
    ]