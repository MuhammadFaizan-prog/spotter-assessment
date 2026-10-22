"""Corridor grid for the 0–48 h weather heatmap.

A regular lat/lon grid over the routes' bounding box, kept only where a cell
centre lies within CORRIDOR_MI of any route. A uniform grid matters: the map
heatmap sums neighbouring weights, so even spacing keeps colour proportional
to severity instead of to sample density.
"""
from __future__ import annotations

import math

from .geo import LonLat, haversine_mi, simplify

CORRIDOR_MI = 60.0
MAX_CELLS = 170
MIN_STEP_DEG = 0.3


def corridor_grid(routes: list[list[LonLat]]) -> tuple[list[LonLat], float]:
    """Return (grid points, step in degrees)."""
    coarse = [simplify(r, 0.03) for r in routes]
    pts = [p for r in coarse for p in r]
    lons = [p[0] for p in pts]
    lats = [p[1] for p in pts]
    pad = 0.9
    min_lon, max_lon = min(lons) - pad, max(lons) + pad
    min_lat, max_lat = min(lats) - pad, max(lats) + pad

    # Densify the coarse polylines so the distance test is not fooled by long edges.
    dense: list[LonLat] = []
    for r in coarse:
        for a, b in zip(r, r[1:]):
            n = max(1, int(haversine_mi(a, b) // 15))
            for k in range(n):
                t = k / n
                dense.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
        dense.append(r[-1])

    def build(step: float) -> list[LonLat]:
        out = []
        lat = min_lat
        while lat <= max_lat + 1e-9:
            lon = min_lon
            while lon <= max_lon + 1e-9:
                p = (round(lon, 3), round(lat, 3))
                # cheap bounding check before haversine
                for q in dense:
                    if abs(q[1] - p[1]) < 1.0 and abs(q[0] - p[0]) < 1.3 and haversine_mi(p, q) <= CORRIDOR_MI:
                        out.append(p)
                        break
                lon += step
            lat += step
        return out

    span = max(max_lon - min_lon, max_lat - min_lat)
    step = max(MIN_STEP_DEG, round(span / 22, 2))
    grid = build(step)
    while len(grid) > MAX_CELLS:
        step = round(step * math.sqrt(len(grid) / MAX_CELLS) * 1.02, 3)
        grid = build(step)
    return grid, step
