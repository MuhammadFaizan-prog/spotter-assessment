"""Produce exactly three distinct route options.

1. Ask OSRM for its alternatives (it usually returns 1–3).
2. If fewer than three are distinct, route through a via point offset to
   either side of the main route's midpoint (perpendicular to the overall
   heading) and keep the shortest distinct results.

Durations are adjusted for a heavy truck: no segment is driven faster than
TRUCK_MAX_MPH (the public OSRM server only has a car profile).
"""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

from .clients import OsrmRoute, UpstreamError, osrm_route
from .geo import METERS_PER_MILE, LonLat, Track, bearing_deg, haversine_mi, offset_point

log = logging.getLogger(__name__)

TRUCK_MAX_MPH = 65.0
TARGET_ROUTES = 3
DUPLICATE_OVERLAP = 0.80  # routes sharing >=80% of grid cells are "the same"
MAX_DETOUR_RATIO = 1.45  # discard variants much longer than the fastest route


@dataclass
class RouteOption:
    track: Track
    source: str  # "osrm" | "osrm-alternative" | "via-point"


def truck_track(r: OsrmRoute) -> Track:
    base = Track.build(r.coords, r.segment_durations_s, r.duration_s)
    durations = []
    for i in range(len(base.coords) - 1):
        seg_mi = base.cum_mi[i + 1] - base.cum_mi[i]
        seg_s = base.cum_s[i + 1] - base.cum_s[i]
        durations.append(max(seg_s, seg_mi / TRUCK_MAX_MPH * 3600))
    return Track.build(base.coords, durations)


def _cells(track: Track) -> set[tuple[int, int]]:
    # ~3.5 mi cells; sample every vertex (OSRM full geometry is dense).
    return {(round(lon * 20), round(lat * 20)) for lon, lat in track.coords}


def overlap(a: Track, b: Track) -> float:
    ca, cb = _cells(a), _cells(b)
    if not ca or not cb:
        return 0.0
    return len(ca & cb) / min(len(ca), len(cb))


def is_distinct(candidate: Track, chosen: list[Track]) -> bool:
    return all(overlap(candidate, c) < DUPLICATE_OVERLAP for c in chosen)


def via_points(main: Track, origin: LonLat, destination: LonLat) -> list[LonLat]:
    mid, _ = main.locate(main.length_mi / 2)
    heading = bearing_deg(origin, destination)
    straight = haversine_mi(origin, destination)
    points = []
    for frac in (0.18, 0.32):
        dist = min(max(straight * frac, 25.0), 220.0)
        for side in (90.0, -90.0):
            points.append(offset_point(mid, heading + side, dist))
    # quarter points give variants when the corridor is constrained on one side
    for q in (0.3, 0.7):
        p, _ = main.locate(main.length_mi * q)
        for side in (90.0, -90.0):
            points.append(offset_point(p, heading + side, min(max(straight * 0.15, 20.0), 150.0)))
    return points


def build_route_options(origin: LonLat, destination: LonLat) -> list[RouteOption]:
    if haversine_mi(origin, destination) < 1.0:
        raise UpstreamError("routing", "Origin and destination are the same place")
    primary = osrm_route([origin, destination], alternatives=3)
    if not primary:
        raise UpstreamError("OSRM", "no route found between these places")
    options: list[RouteOption] = []
    for i, r in enumerate(primary):
        t = truck_track(r)
        if is_distinct(t, [o.track for o in options]):
            options.append(RouteOption(t, "osrm" if i == 0 else "osrm-alternative"))
        if len(options) == TARGET_ROUTES:
            break

    if len(options) < TARGET_ROUTES:
        main = options[0].track
        vias = via_points(main, origin, destination)

        def try_via(v: LonLat) -> Track | None:
            try:
                rs = osrm_route([origin, v, destination])
                return truck_track(rs[0]) if rs else None
            except UpstreamError as err:
                log.info("via route failed: %s", err)
                return None

        with ThreadPoolExecutor(max_workers=4) as pool:
            candidates = [t for t in pool.map(try_via, vias) if t is not None]
        candidates.sort(key=lambda t: t.duration_s)
        for t in candidates:
            if t.length_mi > main.length_mi * MAX_DETOUR_RATIO:
                continue
            if is_distinct(t, [o.track for o in options]):
                options.append(RouteOption(t, "via-point"))
            if len(options) == TARGET_ROUTES:
                break
        # Constrained geography (e.g. a single highway): relax the overlap rule
        # rather than returning fewer than three options.
        if len(options) < TARGET_ROUTES:
            for t in candidates:
                if all(overlap(t, o.track) < 0.97 for o in options):
                    options.append(RouteOption(t, "via-point"))
                if len(options) == TARGET_ROUTES:
                    break
    return options


def miles(m: float) -> float:
    return m / METERS_PER_MILE
