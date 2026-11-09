"""Compare scheduling methods on the same scenario."""


def build_scoreboard(scenario, schedules):
    """schedules: list of schedule documents (from evaluate_schedule), baseline first."""
    generated = sum(s.generation_gb_per_hour * scenario.duration_hours for s in scenario.satellites)
    methods = []
    for schedule in schedules:
        summary = schedule["summary"]
        methods.append(
            {
                "method": schedule["method"],
                "passes_used": summary["passes_used"],
                "gb_delivered": summary["gb_delivered"],
                "overflow_gb": summary["overflow_gb"],
                "overflow_events": summary["overflow_events"],
                "share_of_generated_pct": round(100 * summary["gb_delivered"] / generated, 1),
            }
        )
    baseline, best = methods[0], methods[-1]
    gain = round(best["gb_delivered"] - baseline["gb_delivered"], 1)
    return {
        "scenario_id": scenario.scenario_id,
        "generated_gb": round(generated, 1),
        "methods": methods,
        "gain_gb": gain,
        "gain_pct": round(100 * gain / baseline["gb_delivered"], 1) if baseline["gb_delivered"] else None,
    }


def format_scoreboard(board):
    lines = [f"Scoreboard ({board['generated_gb']:.0f} GB generated):"]
    lines.append(f"  {'method':<10} {'passes':>6} {'delivered':>10} {'overflow':>10} {'events':>7} {'share':>7}")
    for m in board["methods"]:
        lines.append(
            f"  {m['method']:<10} {m['passes_used']:>6} {m['gb_delivered']:>8.0f} GB "
            f"{m['overflow_gb']:>7.0f} GB {m['overflow_events']:>7} {m['share_of_generated_pct']:>6.1f}%"
        )
    if board["gain_pct"] is not None:
        lines.append(f"  {board['methods'][-1]['method']} vs {board['methods'][0]['method']}: "
                     f"{board['gain_gb']:+.0f} GB ({board['gain_pct']:+.1f}%)")
    return lines
