"""Weather risk classification — the rules from the Spotter brief, verbatim.

Thresholds (per checkpoint):

    | Condition | Low       | Moderate  | High      | Severe    | No Travel |
    | Wind      | <25 mph   | 25–34     | 35–44     | 45–54     | >=55 mph  |
    | Rain      | <0.10 in/h| 0.10–0.25 | 0.25–0.50 | 0.50–1.00 | >1.00     |
    | Snow      | <0.5 in/h | 0.5–1.0   | 1.0–2.0   | 2.0–3.0   | >3.0      |

Boundary convention (documented in README "Risk logic"):
  * Each band's lower bound is inclusive, so a value sitting exactly on a
    shared edge belongs to the *higher* band (25 mph -> Moderate,
    0.25 in/h -> High, 2.0 in/h -> Severe). That is the conservative choice.
  * The one exception is the top of rain and snow, where the brief writes a
    strict ">" (>1.00, >3.0): exactly 1.00 in/h rain is Severe, not No Travel.
  * Wind bands are written as integers (25–34, 35–44); fractional speeds fall
    into the band whose inclusive lower bound they have passed (34.6 -> Moderate).

Load rules (applied on top of the wind band):
  * wind >= 55 mph                      -> No Travel for any load
  * 45 <= wind < 55 and load > 30,000 lb -> No Travel
  * 35 <= wind < 45 and load > 40,000 lb -> Severe

Final checkpoint level = max(wind level, rain level, snow level, load-rule level).
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum


class Risk(IntEnum):
    LOW = 0
    MODERATE = 1
    HIGH = 2
    SEVERE = 3
    NO_TRAVEL = 4

    @property
    def label(self) -> str:
        return RISK_LABELS[self]


RISK_LABELS = {
    Risk.LOW: "Low",
    Risk.MODERATE: "Moderate",
    Risk.HIGH: "High",
    Risk.SEVERE: "Severe",
    Risk.NO_TRAVEL: "No Travel",
}

WIND_MODERATE, WIND_HIGH, WIND_SEVERE, WIND_NO_TRAVEL = 25.0, 35.0, 45.0, 55.0
RAIN_MODERATE, RAIN_HIGH, RAIN_SEVERE, RAIN_NO_TRAVEL = 0.10, 0.25, 0.50, 1.00
SNOW_MODERATE, SNOW_HIGH, SNOW_SEVERE, SNOW_NO_TRAVEL = 0.5, 1.0, 2.0, 3.0

LOAD_NO_TRAVEL_LB = 30_000  # with 45–54 mph wind
LOAD_SEVERE_LB = 40_000  # with 35–44 mph wind


def classify_wind(mph: float) -> Risk:
    if mph >= WIND_NO_TRAVEL:
        return Risk.NO_TRAVEL
    if mph >= WIND_SEVERE:
        return Risk.SEVERE
    if mph >= WIND_HIGH:
        return Risk.HIGH
    if mph >= WIND_MODERATE:
        return Risk.MODERATE
    return Risk.LOW


def classify_rain(in_per_hr: float) -> Risk:
    if in_per_hr > RAIN_NO_TRAVEL:
        return Risk.NO_TRAVEL
    if in_per_hr >= RAIN_SEVERE:
        return Risk.SEVERE
    if in_per_hr >= RAIN_HIGH:
        return Risk.HIGH
    if in_per_hr >= RAIN_MODERATE:
        return Risk.MODERATE
    return Risk.LOW


def classify_snow(in_per_hr: float) -> Risk:
    if in_per_hr > SNOW_NO_TRAVEL:
        return Risk.NO_TRAVEL
    if in_per_hr >= SNOW_SEVERE:
        return Risk.SEVERE
    if in_per_hr >= SNOW_HIGH:
        return Risk.HIGH
    if in_per_hr >= SNOW_MODERATE:
        return Risk.MODERATE
    return Risk.LOW


def load_rule(wind_mph: float, load_lb: float) -> tuple[Risk, str | None]:
    """Return the level forced by the wind + load rules, with the rule text."""
    if wind_mph >= WIND_NO_TRAVEL:
        return Risk.NO_TRAVEL, "Wind ≥55 mph: No Travel for any load"
    if wind_mph >= WIND_SEVERE and load_lb > LOAD_NO_TRAVEL_LB:
        return Risk.NO_TRAVEL, "Wind 45–54 mph with load >30,000 lb: No Travel"
    if wind_mph >= WIND_HIGH and wind_mph < WIND_SEVERE and load_lb > LOAD_SEVERE_LB:
        return Risk.SEVERE, "Wind 35–44 mph with load >40,000 lb: Severe"
    return Risk.LOW, None


@dataclass(frozen=True)
class Assessment:
    level: Risk
    wind: Risk
    rain: Risk
    snow: Risk
    load: Risk
    drivers: tuple[str, ...]  # which factor(s) set the final level
    load_rule: str | None

    def as_dict(self) -> dict:
        return {
            "level": int(self.level),
            "label": self.level.label,
            "wind": int(self.wind),
            "rain": int(self.rain),
            "snow": int(self.snow),
            "load": int(self.load),
            "drivers": list(self.drivers),
            "load_rule": self.load_rule,
        }


def assess(wind_mph: float, rain_in_hr: float, snow_in_hr: float, load_lb: float) -> Assessment:
    """Classify one checkpoint. Final level is the max of every factor."""
    wind = classify_wind(wind_mph)
    rain = classify_rain(rain_in_hr)
    snow = classify_snow(snow_in_hr)
    load, rule = load_rule(wind_mph, load_lb)
    level = max(wind, rain, snow, load)
    drivers: list[str] = []
    if level > Risk.LOW:
        for name, value in (("wind", wind), ("rain", rain), ("snow", snow), ("load", load)):
            if value == level:
                drivers.append(name)
    return Assessment(level, wind, rain, snow, load, tuple(drivers), rule if load == level and load > Risk.LOW else None)


def continuous_score(wind_mph: float, rain_in_hr: float, snow_in_hr: float, load_lb: float) -> float:
    """A smooth 0–4 severity used only to shade the corridor heatmap.

    It is piecewise-linear between the same thresholds, so its integer part
    always matches the discrete class (heatmap colour and checkpoint badge
    never disagree). It is *not* used for recommendations.
    """

    def ramp(value: float, edges: tuple[float, float, float, float]) -> float:
        # edges = lower bounds of Moderate, High, Severe, No Travel
        points = (0.0,) + edges
        if value >= edges[-1]:
            return 4.0
        for i in range(4):
            lo, hi = points[i], points[i + 1]
            if value < hi:
                return i + max(0.0, (value - lo) / (hi - lo)) * 0.999
        return 4.0

    w = ramp(wind_mph, (WIND_MODERATE, WIND_HIGH, WIND_SEVERE, WIND_NO_TRAVEL))
    r = ramp(rain_in_hr, (RAIN_MODERATE, RAIN_HIGH, RAIN_SEVERE, RAIN_NO_TRAVEL + 1e-9))
    s = ramp(snow_in_hr, (SNOW_MODERATE, SNOW_HIGH, SNOW_SEVERE, SNOW_NO_TRAVEL + 1e-9))
    discrete = float(assess(wind_mph, rain_in_hr, snow_in_hr, load_lb).level)
    smooth = max(w, r, s)
    # Load rules can bump the class; keep the score inside the final class.
    if int(smooth) < discrete:
        return discrete
    return min(smooth, discrete + 0.999)
