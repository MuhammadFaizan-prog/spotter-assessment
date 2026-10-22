"""Geometry helpers and checkpoint sampling along a route polyline."""
from __future__ import annotations

import math
from bisect import bisect_left
from dataclasses import dataclass

EARTH_RADIUS_MI = 3958.7613
METERS_PER_MILE = 1609.344

LonLat = tuple[float, float]


def haversine_mi(a: LonLat, b: LonLat) -> float:
    lon1, lat1 = map(math.radians, a)
    lon2, lat2 = map(math.radians, b)
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_MI * math.asin(min(1.0, math.sqrt(h)))


def offset_point(origin: LonLat, bearing_deg: float, distance_mi: float) -> LonLat:
    """Point `distance_mi` from `origin` along `bearing_deg` (great circle)."""
    lon1, lat1 = map(math.radians, origin)
    brg = math.radians(bearing_deg)
    d = distance_mi / EARTH_RADIUS_MI
    lat2 = math.asin(math.sin(lat1) * math.cos(d) + math.cos(lat1) * math.sin(d) * math.cos(brg))
    lon2 = lon1 + math.atan2(math.sin(brg) * math.sin(d) * math.cos(lat1), math.cos(d) - math.sin(lat1) * math.sin(lat2))
    return (math.degrees(lon2), math.degrees(lat2))


def bearing_deg(a: LonLat, b: LonLat) -> float:
    lon1, lat1 = map(math.radians, a)
    lon2, lat2 = map(math.radians, b)
    dlon = lon2 - lon1
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


@dataclass(frozen=True)
class Track:
    """A route polyline with cumulative distance (mi) and time (s) per vertex."""

    coords: list[LonLat]
    cum_mi: list[float]
    cum_s: list[float]

    @property
    def length_mi(self) -> float:
        return self.cum_mi[-1]

    @property
    def duration_s(self) -> float:
        return self.cum_s[-1]

    @classmethod
    def build(cls, coords: list[LonLat], segment_durations_s: list[float] | None = None, total_duration_s: float | None = None) -> "Track":
        """Build from vertices. Segment durations (one per edge) come from OSRM
        annotations; if missing, time is spread proportionally to distance."""
        if len(coords) < 2:
            raise ValueError("A track needs at least two coordinates")
        cum_mi = [0.0]
        for a, b in zip(coords, coords[1:]):
            cum_mi.append(cum_mi[-1] + haversine_mi(a, b))
        if segment_durations_s is not None and len(segment_durations_s) == len(coords) - 1:
            cum_s = [0.0]
            for d in segment_durations_s:
                cum_s.append(cum_s[-1] + max(0.0, d))
        else:
            total = total_duration_s if total_duration_s is not None else cum_mi[-1] / 55.0 * 3600
            length = cum_mi[-1] or 1.0
            cum_s = [m / length * total for m in cum_mi]
        return cls(coords, cum_mi, cum_s)

    def locate(self, mile: float) -> tuple[LonLat, float]:
        """Interpolated position and elapsed seconds at `mile` along the track."""
        mile = min(max(mile, 0.0), self.length_mi)
        i = bisect_left(self.cum_mi, mile)
        if i == 0:
            return self.coords[0], 0.0
        if i >= len(self.cum_mi):
            return self.coords[-1], self.cum_s[-1]
        m0, m1 = self.cum_mi[i - 1], self.cum_mi[i]
        t = 0.0 if m1 == m0 else (mile - m0) / (m1 - m0)
        a, b = self.coords[i - 1], self.coords[i]
        pos = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
        secs = self.cum_s[i - 1] + (self.cum_s[i] - self.cum_s[i - 1]) * t
        return pos, secs

    def position_at_time(self, elapsed_s: float) -> LonLat:
        elapsed_s = min(max(elapsed_s, 0.0), self.duration_s)
        i = bisect_left(self.cum_s, elapsed_s)
        if i == 0:
            return self.coords[0]
        if i >= len(self.cum_s):
            return self.coords[-1]
        s0, s1 = self.cum_s[i - 1], self.cum_s[i]
        t = 0.0 if s1 == s0 else (elapsed_s - s0) / (s1 - s0)
        a, b = self.coords[i - 1], self.coords[i]
        return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


@dataclass(frozen=True)
class Sample:
    mile: float
    position: LonLat
    elapsed_s: float
    segment_mi: float  # miles of road this checkpoint "owns" for risk-mile totals


def sample_checkpoints(track: Track, interval_mi: float) -> list[Sample]:
    """Checkpoints at mile 0, every `interval_mi`, and at the destination.

    Each checkpoint owns the road from the midpoint with its previous
    checkpoint to the midpoint with its next one (the origin and destination
    own half a gap each). The owned miles sum exactly to the route length, so
    Severe/High/No-Travel mile totals are never double counted.
    """
    if interval_mi <= 0:
        raise ValueError("interval_mi must be positive")
    length = track.length_mi
    miles = [0.0]
    m = interval_mi
    while m < length - 1e-6:
        miles.append(m)
        m += interval_mi
    if length - miles[-1] > 1e-6:
        miles.append(length)
    samples: list[Sample] = []
    for idx, mile in enumerate(miles):
        prev_mid = 0.0 if idx == 0 else (miles[idx - 1] + mile) / 2
        next_mid = length if idx == len(miles) - 1 else (mile + miles[idx + 1]) / 2
        pos, secs = track.locate(mile)
        samples.append(Sample(mile=mile, position=pos, elapsed_s=secs, segment_mi=next_mid - prev_mid))
    return samples


def simplify(coords: list[LonLat], tolerance_deg: float = 0.002) -> list[LonLat]:
    """Douglas–Peucker (iterative) to keep the payload sent to the map small."""
    if len(coords) <= 2:
        return list(coords)
    keep = [False] * len(coords)
    keep[0] = keep[-1] = True
    stack = [(0, len(coords) - 1)]
    tol2 = tolerance_deg * tolerance_deg
    while stack:
        start, end = stack.pop()
        ax, ay = coords[start]
        bx, by = coords[end]
        dx, dy = bx - ax, by - ay
        seg2 = dx * dx + dy * dy
        best, best_i = -1.0, -1
        for i in range(start + 1, end):
            px, py = coords[i]
            if seg2 == 0:
                d2 = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg2))
                d2 = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if d2 > best:
                best, best_i = d2, i
        if best > tol2 and best_i > 0:
            keep[best_i] = True
            stack.append((start, best_i))
            stack.append((best_i, end))
    return [c for c, k in zip(coords, keep) if k]
