from datetime import datetime, timezone

import pytest

from engine.buffer import simulate_buffer
from engine.scenario import Satellite

START = datetime(2026, 11, 9, 0, 0, tzinfo=timezone.utc)


def make_satellite(**overrides):
    values = dict(
        id="sat", norad_id=1, buffer_capacity_gb=300, initial_buffer_gb=0,
        generation_gb_per_hour=62.5, downlink_rate_mbps=560,
    )
    values.update(overrides)
    return Satellite(**values)


def make_pass(aos, los, volume_gb):
    return {"aos_utc": aos, "los_utc": los, "expected_volume_gb": volume_gb}


def test_no_downlink_fills_then_overflows():
    # 62.5 GB/h for 24 h = 1500 GB generated; only 300 GB fits, so 1200 GB is lost.
    result = simulate_buffer(make_satellite(), [], START, 24)
    assert result["delivered_gb"] == 0
    assert result["overflow_gb"] == pytest.approx(1200, abs=1)
    assert result["final_buffer_gb"] == 300
    assert result["overflow_events"] == 1


def test_one_pass_drains_exactly_its_volume():
    # No new data, 100 GB stored, one 10-minute pass worth 50 GB -> 50 GB left.
    sat = make_satellite(generation_gb_per_hour=0, initial_buffer_gb=100)
    passes = [make_pass("2026-11-09T01:00:00Z", "2026-11-09T01:10:00Z", 50)]
    result = simulate_buffer(sat, passes, START, 24)
    assert result["delivered_gb"] == pytest.approx(50)
    assert result["final_buffer_gb"] == pytest.approx(50)
    assert result["overflow_gb"] == 0


def test_cannot_send_more_than_is_stored():
    sat = make_satellite(generation_gb_per_hour=0, initial_buffer_gb=10)
    passes = [make_pass("2026-11-09T01:00:00Z", "2026-11-09T01:10:00Z", 50)]
    result = simulate_buffer(sat, passes, START, 24)
    assert result["delivered_gb"] == pytest.approx(10)
    assert result["final_buffer_gb"] == pytest.approx(0)


def test_data_is_conserved():
    passes = [
        make_pass("2026-11-09T03:00:00Z", "2026-11-09T03:10:00Z", 40),
        make_pass("2026-11-09T09:00:00Z", "2026-11-09T09:12:00Z", 55),
    ]
    sat = make_satellite(initial_buffer_gb=20)
    result = simulate_buffer(sat, passes, START, 24)
    generated = 62.5 * 24
    assert 20 + generated == pytest.approx(
        result["delivered_gb"] + result["overflow_gb"] + result["final_buffer_gb"], abs=0.5
    )


def test_overlapping_passes_for_one_satellite_are_rejected():
    passes = [
        make_pass("2026-11-09T01:00:00Z", "2026-11-09T01:10:00Z", 40),
        make_pass("2026-11-09T01:05:00Z", "2026-11-09T01:15:00Z", 40),
    ]
    with pytest.raises(ValueError):
        simulate_buffer(make_satellite(), passes, START, 24)


def test_finer_time_step_gives_nearly_the_same_answer():
    passes = [make_pass("2026-11-09T03:00:00Z", "2026-11-09T03:10:00Z", 40)]
    coarse = simulate_buffer(make_satellite(), passes, START, 24, step_s=60)
    fine = simulate_buffer(make_satellite(), passes, START, 24, step_s=10)
    assert coarse["delivered_gb"] == pytest.approx(fine["delivered_gb"], abs=0.5)