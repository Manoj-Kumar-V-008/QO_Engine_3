"""Phase 2: read a scenario, find every pass, write passes.json.

Usage: python -m engine.run data/scenario.json [viewer/data/passes.json]
"""
import json
import sys
from pathlib import Path

from engine.celestrak import fetch_tle
from engine.pass_finder import find_all_passes, iso_z, tle_epoch_utc
from engine.scenario import load_scenario


def build_document(scenario, tles):
    return {
        "schema_version": "0.1",
        "scenario_id": scenario.scenario_id,
        "tle_sources": [
            {
                "satellite_id": sat.id,
                "norad_id": sat.norad_id,
                "tle_name": tles[sat.norad_id][0],
                "tle_epoch_utc": iso_z(tle_epoch_utc(tles[sat.norad_id])),
            }
            for sat in scenario.satellites
        ],
        "passes": find_all_passes(scenario, tles),
    }


def main(scenario_path, output_path):
    scenario = load_scenario(scenario_path)
    tles = {sat.norad_id: fetch_tle(sat.norad_id) for sat in scenario.satellites}
    document = build_document(scenario, tles)

    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(document, indent=2), encoding="utf-8")

    for source in document["tle_sources"]:
        print(f"{source['satellite_id']}: TLE '{source['tle_name']}' epoch {source['tle_epoch_utc']}")
    for sat in scenario.satellites:
        for ant in scenario.antennas:
            mine = [
                p for p in document["passes"]
                if p["satellite_id"] == sat.id and p["antenna_id"] == ant.id
            ]
            total = sum(p["expected_volume_gb"] for p in mine)
            print(f"{sat.id} x {ant.id}: {len(mine)} passes, up to {total:.0f} GB")
    print(f"{len(document['passes'])} passes written to {output}")


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3):
        sys.exit("usage: python -m engine.run <scenario.json> [output.json]")
    main(sys.argv[1], sys.argv[2] if len(sys.argv) == 3 else "viewer/data/passes.json")