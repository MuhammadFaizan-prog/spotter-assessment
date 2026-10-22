"""Orchestrates one trip plan: routes -> checkpoints -> weather -> risk ->
summaries -> recommendation, plus the corridor heatmap frames."""
from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from .clients import HourlySeries, fetch_hourly, weather_key
from .geo import LonLat, sample_checkpoints, simplify
from .heatmap import corridor_grid
from .recommend import explain, rank, summarize, verdicts
from .risk import assess, continuous_score
from .routes import RouteOption, build_route_options

HEATMAP_HOURS = 48
ROUTE_NAMES = ("Route A", "Route B", "Route C")


@dataclass
class PlanRequest:
    origin: LonLat
    destination: LonLat
    origin_label: str
    destination_label: str
    departure: datetime  # aware
    load_lb: float
    interval_mi: int
    timezone_name: str


def _floor_hour(t: datetime) -> datetime:
    return t.replace(minute=0, second=0, microsecond=0)


def _r(v: float, nd: int = 2) -> float:
    return round(float(v), nd)


def build_plan(req: PlanRequest) -> dict:
    t0 = time.perf_counter()
    options: list[RouteOption] = build_route_options(req.origin, req.destination)
    t_routes = time.perf_counter()

    departure = req.departure.astimezone(timezone.utc)
    max_trip_s = max(o.track.duration_s for o in options)
    window_start = _floor_hour(departure)
    window_end = _floor_hour(departure + timedelta(seconds=max(max_trip_s, HEATMAP_HOURS * 3600))) + timedelta(hours=2)

    samples_by_route = [sample_checkpoints(o.track, req.interval_mi) for o in options]
    grid, grid_step = corridor_grid([o.track.coords for o in options])

    points: list[LonLat] = [s.position for samples in samples_by_route for s in samples] + grid
    forecasts: dict[tuple[float, float], HourlySeries] = fetch_hourly(points, window_start, window_end)
    t_weather = time.perf_counter()

    routes_out = []
    summaries = []
    for idx, (opt, samples) in enumerate(zip(options, samples_by_route)):
        route_id = chr(ord("a") + idx)
        checkpoints = []
        segments = []
        for n, s in enumerate(samples):
            eta = departure + timedelta(seconds=s.elapsed_s)
            wx = forecasts[weather_key(s.position)].at(eta)
            a = assess(wx["wind_mph"], wx["rain_in_hr"], wx["snow_in_hr"], req.load_lb)
            segments.append((s.segment_mi, int(a.level)))
            checkpoints.append(
                {
                    "index": n,
                    "mile": _r(s.mile, 1),
                    "lon": _r(s.position[0], 5),
                    "lat": _r(s.position[1], 5),
                    "eta": eta.isoformat().replace("+00:00", "Z"),
                    "elapsed_s": round(s.elapsed_s),
                    "segment_mi": _r(s.segment_mi, 2),
                    "weather": {
                        "wind_mph": _r(wx["wind_mph"], 1),
                        "gust_mph": _r(wx["gust_mph"], 1),
                        "rain_in_hr": _r(wx["rain_in_hr"], 3),
                        "snow_in_hr": _r(wx["snow_in_hr"], 3),
                        "temp_f": _r(wx["temp_f"], 0),
                        "forecast_hour": wx["forecast_hour"].isoformat().replace("+00:00", "Z"),
                    },
                    "risk": a.as_dict(),
                }
            )
        summary = summarize(route_id, opt.track.length_mi, opt.track.duration_s, segments)
        summaries.append(summary)

        # Truck position at each heatmap hour (slider), parked at destination after arrival.
        hourly_pos = []
        for h in range(HEATMAP_HOURS + 1):
            elapsed = (window_start + timedelta(hours=h) - departure).total_seconds()
            if elapsed < 0:
                hourly_pos.append([_r(opt.track.coords[0][0], 4), _r(opt.track.coords[0][1], 4)])
                continue
            p = opt.track.position_at_time(elapsed)
            hourly_pos.append([_r(p[0], 4), _r(p[1], 4)])

        routes_out.append(
            {
                "id": route_id,
                "name": ROUTE_NAMES[idx],
                "source": opt.source,
                "geometry": [[_r(lon, 5), _r(lat, 5)] for lon, lat in simplify(opt.track.coords, 0.0015)],
                "arrival": (departure + timedelta(seconds=opt.track.duration_s)).isoformat().replace("+00:00", "Z"),
                "checkpoints": checkpoints,
                "hourly_position": hourly_pos,
            }
        )

    ranked = rank(summaries)
    names = {r["id"]: r["name"] for r in routes_out}
    rank_of = {s.route_id: i + 1 for i, s in enumerate(ranked)}
    why = verdicts(ranked, names)
    for r, s in zip(routes_out, summaries):
        r["summary"] = s.as_dict()
        r["rank"] = rank_of[r["id"]]
        r["verdict"] = why[r["id"]]

    # Heatmap frames: one row per grid point, one value per hour (0..48).
    hours = [window_start + timedelta(hours=h) for h in range(HEATMAP_HOURS + 1)]
    cells = []
    for p in grid:
        series = forecasts[weather_key(p)]
        score, wind, rain, snow = [], [], [], []
        for t in hours:
            i = series.index_at_or_after(t)
            w, rn, sn = series.wind_mph[i], series.rain_in[i], series.snow_in[i]
            score.append(_r(continuous_score(w, rn, sn, req.load_lb), 2))
            wind.append(_r(w, 0))
            rain.append(_r(rn, 2))
            snow.append(_r(sn, 2))
        cells.append({"lon": p[0], "lat": p[1], "score": score, "wind": wind, "rain": rain, "snow": snow})

    t_end = time.perf_counter()
    best = ranked[0].route_id
    return {
        "request": {
            "origin": {"label": req.origin_label, "lon": req.origin[0], "lat": req.origin[1]},
            "destination": {"label": req.destination_label, "lon": req.destination[0], "lat": req.destination[1]},
            "departure": departure.isoformat().replace("+00:00", "Z"),
            "timezone": req.timezone_name,
            "load_lb": req.load_lb,
            "interval_mi": req.interval_mi,
        },
        "recommended_route_id": best,
        "recommendation_reason": explain(ranked, names),
        "ranking": [s.route_id for s in ranked],
        "routes": routes_out,
        "heatmap": {
            "start": window_start.isoformat().replace("+00:00", "Z"),
            "hours": HEATMAP_HOURS,
            "step_deg": grid_step,
            "cells": cells,
        },
        "meta": {
            "sources": {
                "routing": "OSRM public demo server (car profile, truck speed cap 65 mph)",
                "weather": "Open-Meteo hourly forecast (best-match model)",
                "geocoding": "Photon (OpenStreetMap)",
            },
            "weather_points": len(forecasts),
            "timings_ms": {
                "routes": round((t_routes - t0) * 1000),
                "weather": round((t_weather - t_routes) * 1000),
                "total": round((t_end - t0) * 1000),
            },
            "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        },
    }
