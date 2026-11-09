"""Scenario model for Engine 3: what satellites, antennas and time window to run."""
import sys
from pathlib import Path

from pydantic import AwareDatetime, BaseModel, Field, model_validator


class Satellite(BaseModel):
    id: str
    norad_id: int = Field(gt=0)
    buffer_capacity_gb: float = Field(gt=0)
    initial_buffer_gb: float = Field(ge=0)
    generation_gb_per_hour: float = Field(ge=0)

    @model_validator(mode="after")
    def check_initial_fits(self):
        if self.initial_buffer_gb > self.buffer_capacity_gb:
            raise ValueError("initial_buffer_gb cannot exceed buffer_capacity_gb")
        return self


class Antenna(BaseModel):
    id: str
    name: str
    lat_deg: float = Field(ge=-90, le=90)
    lon_deg: float = Field(ge=-180, le=180)
    alt_m: float = 0
    min_elevation_deg: float = Field(ge=0, le=90)
    dishes: int = Field(default=1, ge=1)
    setup_s: float = Field(default=0, ge=0)


class Scenario(BaseModel):
    schema_version: str
    scenario_id: str
    start_utc: AwareDatetime
    duration_hours: float = Field(gt=0)
    satellites: list[Satellite] = Field(min_length=1)
    antennas: list[Antenna] = Field(min_length=1)

    @model_validator(mode="after")
    def check_unique_ids(self):
        for label, items in (("satellite", self.satellites), ("antenna", self.antennas)):
            ids = [item.id for item in items]
            if len(ids) != len(set(ids)):
                raise ValueError(f"duplicate {label} ids")
        return self


def load_scenario(path):
    text = Path(path).read_text(encoding="utf-8")
    return Scenario.model_validate_json(text)


def summary(scenario):
    return (
        f"{len(scenario.satellites)} satellite(s), {len(scenario.antennas)} antenna(s), "
        f"{scenario.duration_hours:g} hours starting {scenario.start_utc.isoformat()}"
    )


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python -m engine.scenario <scenario.json>")
    print(summary(load_scenario(sys.argv[1])))