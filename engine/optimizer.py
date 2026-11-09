"""The real solver: find the conflict-free set of passes that delivers the most data."""
import pulp

from engine.conflicts import find_conflicts
from engine.pass_finder import parse_z


def pick_solver(time_limit_s):
    available = pulp.listSolvers(onlyAvailable=True)
    if "HiGHS" in available:
        return pulp.HiGHS(msg=False, timeLimit=time_limit_s)
    if "PULP_CBC_CMD" in available:
        return pulp.PULP_CBC_CMD(msg=False, timeLimit=time_limit_s)
    raise RuntimeError("No solver found for PuLP. Install one with: pip install highspy")


def new_variable(model, name, **options):
    """Create a decision variable. PuLP 4 creates them through the model, PuLP 3 does not."""
    if hasattr(model, "add_variable"):
        return model.add_variable(name, **options)
    return pulp.LpVariable(name, **options)


def optimize_schedule(scenario, passes, time_limit_s=60):
    """Return the chosen pass records (maximum data delivered, no conflicts).

    For every pass p there are two decisions:
      x[p]  = 1 if we use the pass, else 0
      d[p]  = how many GB we actually send during it (0 <= d[p] <= volume[p] * x[p])
    Conflicting passes cannot both be used, and a satellite cannot send more data
    than it has generated so far.
    """
    setup_s = {antenna.id: antenna.setup_s for antenna in scenario.antennas}
    volume = {p["pass_id"]: p["expected_volume_gb"] for p in passes}

    model = pulp.LpProblem("downlink_schedule", pulp.LpMaximize)
    x = {pid: new_variable(model, f"x_{pid}", cat="Binary") for pid in volume}
    d = {pid: new_variable(model, f"d_{pid}", lowBound=0) for pid in volume}

    model += pulp.lpSum(d.values())  # objective: total GB delivered

    for pid in volume:
        model += d[pid] <= volume[pid] * x[pid], f"link_limit_{pid}"

    for conflict in find_conflicts(passes, setup_s):
        a, b = conflict["pass_a"], conflict["pass_b"]
        model += x[a] + x[b] <= 1, f"conflict_{a}_{b}"

    for sat in scenario.satellites:
        mine = sorted(
            (p for p in passes if p["satellite_id"] == sat.id), key=lambda p: p["los_utc"]
        )
        for p in mine:
            hours = (parse_z(p["los_utc"]) - scenario.start_utc).total_seconds() / 3600
            generated_so_far = sat.initial_buffer_gb + sat.generation_gb_per_hour * hours
            sent_by_then = [d[q["pass_id"]] for q in mine if q["los_utc"] <= p["los_utc"]]
            model += pulp.lpSum(sent_by_then) <= generated_so_far, f"stored_data_{p['pass_id']}"

    result = model.solve(pick_solver(time_limit_s))
    # PuLP 4 returns a result object with .status, PuLP 3 returns the status number; 1 means optimal
    status = int(getattr(result, "status", result))
    if status != 1:
        raise RuntimeError(f"Solver did not find an optimal schedule (status {status})")

    chosen = [p for p in passes if x[p["pass_id"]].value() > 0.5]
    return sorted(chosen, key=lambda p: (p["aos_utc"], p["pass_id"]))
