"""Phase 1 : Download a satellite's current orbit data (TLE) from CelesTrak, with a local cache."""
import time
import urllib.request
from pathlib import Path

CACHE_DIR = Path("data/cache")
MAX_AGE_HOURS = 2  # CelesTrak asks clients not to re-download more often than this
URL = "https://celestrak.org/NORAD/elements/gp.php?CATNR={norad_id}&FORMAT=tle"


def fetch_tle(norad_id):
    """Return (name, line1, line2) for one satellite."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE_DIR / f"{norad_id}.tle"

    age_hours = None
    if cache_file.exists():
        age_hours = (time.time() - cache_file.stat().st_mtime) / 3600

    if age_hours is None or age_hours > MAX_AGE_HOURS:
        request = urllib.request.Request(
            URL.format(norad_id=norad_id), headers={"User-Agent": "QuantumOrbit-Engine3"}
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            cache_file.write_text(response.read().decode("utf-8"), encoding="utf-8")

    return parse_tle(cache_file.read_text(encoding="utf-8"))


def parse_tle(text):
    lines = [line.strip() for line in text.strip().splitlines() if line.strip()]
    if len(lines) != 3 or not lines[1].startswith("1 ") or not lines[2].startswith("2 "):
        raise ValueError(f"Unexpected TLE response: {text[:200]!r}")
    return lines[0], lines[1], lines[2]