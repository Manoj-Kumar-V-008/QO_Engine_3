"""The simple rule: when passes compete, the satellite that will fill up soonest gets the dish."""
from engine.buffer import simulate_buffer
from engine.conflicts import pass_conflict
from engine.pass_finder import parse_z


def hours_until_full(satellite, level_gb):
    if satellite.generation_gb_per_hour <= 0:
        return float("inf")
    return max(0.0, (satellite.buffer_capacity_gb - level_gb) / satellite.generation_gb_per_hour)


def greedy_schedule(scenario, passes):
    """Choose a conflict-free set of passes, one competition at a time.

    Take the earliest pending pass, gather every pending pass that conflicts with it,
    and give the slot to the satellite whose buffer will fill soonest (ties: bigger
    pass, then earlier pass). Then drop everything that conflicts with the winner.
    """
    setup_s = {antenna.id: antenna.setup_s for antenna in scenario.antennas}
    satellites = {sat.id: sat for sat in scenario.satellites}
    pending = sorted(passes, key=lambda p: (p["aos_utc"], p["pass_id"]))
    chosen = []

    while pending:
        first = pending[0]
        candidates = [first] + [q for q in pending[1:] if pass_conflict(first, q, setup_s)]

        # How full is each competing satellite's buffer when this competition happens?
        hours_now = (parse_z(first["aos_utc"]) - scenario.start_utc).total_seconds() / 3600
        urgency = {}
        for sat_id in {c["satellite_id"] for c in candidates}:
            sat = satellites[sat_id]
            mine = [p for p in chosen if p["satellite_id"] == sat_id]
            level = simulate_buffer(sat, mine, scenario.start_utc, hours_now)["final_buffer_gb"]
            urgency[sat_id] = hours_until_full(sat, level)

        winner = min(
            candidates,
            key=lambda p: (urgency[p["satellite_id"]], -p["expected_volume_gb"], p["aos_utc"], p["pass_id"]),
        )
        chosen.append(winner)
        pending = [q for q in pending if q is not winner and not pass_conflict(winner, q, setup_s)]

    return sorted(chosen, key=lambda p: (p["aos_utc"], p["pass_id"]))