"""Turn a chosen set of passes into a schedule file with its scoreboard numbers."""
from datetime import timedelta

from engine.buffer import simulate_buffer
from engine.conflicts import find_conflicts
from engine.pass_finder import iso_z

TIMELINE_EVERY_S = 600  # one buffer point every 10 minutes keeps the file small


def evaluate_schedule(scenario, all_passes, chosen, method):
    setup_s = {antenna.id: antenna.setup_s for antenna in scenario.antennas}
    if find_conflicts(chosen, setup_s):
        raise ValueError("this schedule uses passes that conflict with each other")

    delivered = overflow_gb = 0.0
    overflow_events = 0
    buffer_timeline = {}
    for sat in scenario.satellites:
        mine = [p for p in chosen if p["satellite_id"] == sat.id]
        result = simulate_buffer(sat, mine, scenario.start_utc, scenario.duration_hours)
        every = TIMELINE_EVERY_S // result["step_s"]
        buffer_timeline[sat.id] = [
            {
                "t_utc": iso_z(scenario.start_utc + timedelta(seconds=(k + 1) * result["step_s"])),
                "level_gb": level,
            }
            for k, level in enumerate(result["timeline_gb"])
            if (k + 1) % every == 0
        ]
        delivered += result["delivered_gb"]
        overflow_gb += result["overflow_gb"]
        overflow_events += result["overflow_events"]

    return {
        "schema_version": "0.1",
        "scenario_id": scenario.scenario_id,
        "method": method,
        "assignments": [
            {
                "pass_id": p["pass_id"],
                "satellite_id": p["satellite_id"],
                "antenna_id": p["antenna_id"],
                "start_utc": p["aos_utc"],
                "end_utc": p["los_utc"],
                "planned_gb": p["expected_volume_gb"],
            }
            for p in sorted(chosen, key=lambda p: (p["aos_utc"], p["pass_id"]))
        ],
        "buffer_timeline": buffer_timeline,
        "summary": {
            "gb_delivered": round(delivered, 1),
            "overflow_gb": round(overflow_gb, 1),
            "overflow_events": overflow_events,
            "passes_used": len(chosen),
            "passes_available": len(all_passes),
            "conflicts": len(find_conflicts(all_passes, setup_s)),
        },
    }