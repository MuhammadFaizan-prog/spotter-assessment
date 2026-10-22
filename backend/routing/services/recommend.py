"""Route summaries and the recommendation order from the brief.

Brief order:  1. fewest Severe miles  2. fewest High miles
              3. lowest average risk  4. shortest travel time

Decision (documented in README): No Travel is strictly worse than Severe, so
it is compared *before* Severe miles. A route with 5 No-Travel miles never
beats a route with 0 No-Travel miles, however many Severe miles the latter
has. Without this, the literal rule would rank a route that crosses a
No-Travel zone above one with a little Severe weather, which is unsafe.

Mile totals are rounded to 0.1 mi before comparing, so floating point noise
never decides a tie. Average risk (0–4 scale, mile-weighted) is compared at
2 decimals: a difference under 0.01 (e.g. 8 Moderate miles on an 800 mi
trip) is treated as a tie so travel time decides instead of noise.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .risk import Risk


@dataclass
class RouteSummary:
    route_id: str
    distance_mi: float
    duration_s: float
    miles_by_level: dict[int, float] = field(default_factory=dict)
    avg_risk: float = 0.0
    max_risk: int = 0

    @property
    def no_travel_mi(self) -> float:
        return round(self.miles_by_level.get(int(Risk.NO_TRAVEL), 0.0), 1)

    @property
    def severe_mi(self) -> float:
        return round(self.miles_by_level.get(int(Risk.SEVERE), 0.0), 1)

    @property
    def high_mi(self) -> float:
        return round(self.miles_by_level.get(int(Risk.HIGH), 0.0), 1)

    def sort_key(self) -> tuple[float, float, float, float, float]:
        return (self.no_travel_mi, self.severe_mi, self.high_mi, round(self.avg_risk, 2), self.duration_s)

    def as_dict(self) -> dict:
        return {
            "distance_mi": round(self.distance_mi, 1),
            "duration_s": round(self.duration_s),
            "no_travel_mi": self.no_travel_mi,
            "severe_mi": self.severe_mi,
            "high_mi": self.high_mi,
            "moderate_mi": round(self.miles_by_level.get(int(Risk.MODERATE), 0.0), 1),
            "low_mi": round(self.miles_by_level.get(int(Risk.LOW), 0.0), 1),
            "avg_risk": round(self.avg_risk, 3),
            "max_risk": self.max_risk,
        }


def summarize(route_id: str, distance_mi: float, duration_s: float, segments: list[tuple[float, int]]) -> RouteSummary:
    """`segments` is a list of (owned_miles, risk_level) per checkpoint."""
    by_level: dict[int, float] = {int(r): 0.0 for r in Risk}
    total = 0.0
    weighted = 0.0
    max_risk = 0
    for miles, level in segments:
        by_level[int(level)] += miles
        total += miles
        weighted += miles * int(level)
        max_risk = max(max_risk, int(level))
    avg = weighted / total if total > 0 else 0.0
    return RouteSummary(route_id, distance_mi, duration_s, by_level, avg, max_risk)


DECIDING_FACTORS = ("No-Travel miles", "Severe miles", "High miles", "average risk", "travel time")


def rank(summaries: list[RouteSummary]) -> list[RouteSummary]:
    """Best first. Python's sort is stable, so full ties keep input order."""
    return sorted(summaries, key=lambda s: s.sort_key())


def explain(ranked: list[RouteSummary], names: dict[str, str]) -> str:
    """One sentence saying why the winner beat the runner-up."""
    if not ranked:
        return ""
    best = ranked[0]
    if len(ranked) == 1:
        return f"{names[best.route_id]} is the only route available."
    runner = ranked[1]
    a, b = best.sort_key(), runner.sort_key()
    for i, factor in enumerate(DECIDING_FACTORS):
        if a[i] != b[i]:
            if i == 4:
                diff_min = round((b[i] - a[i]) / 60)
                return (
                    f"{names[best.route_id]} ties {names[runner.route_id]} on weather risk and is "
                    f"{diff_min} min faster."
                )
            if i == 3:
                return (
                    f"{names[best.route_id]} has the lowest average risk ({a[i]:.2f} vs {b[i]:.2f}) "
                    f"with equal Severe and High miles."
                )
            return (
                f"{names[best.route_id]} has the fewest {factor} "
                f"({a[i]:g} mi vs {b[i]:g} mi on {names[runner.route_id]})."
            )
    return f"{names[best.route_id]} and {names[runner.route_id]} are equivalent; kept the routing engine's order."


def verdicts(ranked: list[RouteSummary], names: dict[str, str]) -> dict[str, str]:
    """Per route: why it is (or is not) the recommendation, in one line."""
    if not ranked:
        return {}
    best = ranked[0]
    out = {best.route_id: "Recommended: " + explain(ranked, names)}
    b = best.sort_key()
    for s in ranked[1:]:
        k = s.sort_key()
        for i, factor in enumerate(DECIDING_FACTORS):
            if k[i] != b[i]:
                if i == 4:
                    out[s.route_id] = f"Same weather risk as {names[best.route_id]} but {round((k[i] - b[i]) / 60)} min slower."
                elif i == 3:
                    out[s.route_id] = f"Higher average risk ({k[i]:.2f} vs {b[i]:.2f})."
                else:
                    out[s.route_id] = f"More {factor} ({k[i]:g} mi vs {b[i]:g} mi)."
                break
        else:
            out[s.route_id] = f"Equivalent to {names[best.route_id]}."
    return out
