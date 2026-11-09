"""Which passes cannot both be used?"""
from datetime import timedelta
from functools import lru_cache

from engine.pass_finder import parse_z

parse = lru_cache(maxsize=None)(parse_z)  # each pass time is parsed once, then remembered


def pass_conflict(p, q, setup_s):
    """Return why passes p and q cannot both be used, or None if they can.

    setup_s maps antenna id -> seconds the dish needs to re-point between passes.
    """
    p_start, p_end = parse(p["aos_utc"]), parse(p["los_utc"])
    q_start, q_end = parse(q["aos_utc"]), parse(q["los_utc"])

    if p["antenna_id"] == q["antenna_id"]:
        gap = timedelta(seconds=setup_s.get(p["antenna_id"], 0))
        if q_start < p_end + gap and p_start < q_end + gap:
            return "same_antenna"

    if p["satellite_id"] == q["satellite_id"]:
        if q_start < p_end and p_start < q_end:
            return "same_satellite"

    return None


def find_conflicts(passes, setup_s):
    """Every pair of passes that cannot both be used, with the reason."""
    conflicts = []
    for i, p in enumerate(passes):
        for q in passes[i + 1:]:
            reason = pass_conflict(p, q, setup_s)
            if reason:
                conflicts.append({"pass_a": p["pass_id"], "pass_b": q["pass_id"], "reason": reason})
    return conflicts