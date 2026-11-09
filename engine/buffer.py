"""Onboard storage simulation: how full a satellite's buffer is, minute by minute."""
from datetime import timedelta

from engine.pass_finder import parse_z


def overlap_seconds(start_a, end_a, start_b, end_b):
    """How many seconds the time ranges A and B share (0 if they don't overlap)."""
    return max(0.0, (min(end_a, end_b) - max(start_a, start_b)).total_seconds())
    

def simulate_buffer(satellite, passes, start_utc, duration_hours, step_s=60):
    """Simulate one satellite's buffer while it downlinks during the given passes.

    passes: pass records (dicts from passes.json) that this satellite actually uses.
    Each pass drains at its average rate (expected_volume_gb / duration).
    """
    used = sorted(
        (parse_z(p["aos_utc"]), parse_z(p["los_utc"]), p["expected_volume_gb"]) for p in passes
    )
    for earlier, later in zip(used, used[1:]):
        if later[0] < earlier[1]:
            raise ValueError("a satellite cannot use two passes at the same time")

    steps = int(duration_hours * 3600 // step_s)
    generated_per_step = satellite.generation_gb_per_hour * step_s / 3600
    level = satellite.initial_buffer_gb
    delivered = lost = 0.0
    overflow_events = 0
    overflowing = False
    peak = level
    timeline = []

    for k in range(steps):
        step_start = start_utc + timedelta(seconds=k * step_s)
        step_end = step_start + timedelta(seconds=step_s)

        level += generated_per_step  # new data arrives

        link_gb = sum(
            volume * overlap_seconds(aos, los, step_start, step_end) / (los - aos).total_seconds()
            for aos, los, volume in used
        )
        sent = min(link_gb, level)  # cannot send more than is stored
        level -= sent
        delivered += sent

        spill = max(0.0, level - satellite.buffer_capacity_gb)  # storage full: data is lost
        if spill > 0:
            level = satellite.buffer_capacity_gb
            lost += spill
            if not overflowing:
                overflow_events += 1
        overflowing = spill > 0

        peak = max(peak, level)
        timeline.append(level)

    return {
        "satellite_id": satellite.id,
        "step_s": step_s,
        "delivered_gb": round(delivered, 1),
        "overflow_gb": round(lost, 1),
        "overflow_events": overflow_events,
        "peak_buffer_gb": round(peak, 1),
        "final_buffer_gb": round(level, 1),
        "timeline_gb": [round(x, 2) for x in timeline],
    }