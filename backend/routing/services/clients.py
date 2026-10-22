"""Thin clients for the public, keyless APIs: OSRM, Open-Meteo, Photon.

Every call goes through `_get_json`, which sets our User-Agent, applies a
timeout, retries once on transient failures, and caches by URL in Django's
cache (process memory; per serverless instance on Vercel).
"""
from __future__ import annotations

import hashlib
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import requests
from django.conf import settings
from django.core.cache import cache

from .geo import LonLat

log = logging.getLogger(__name__)

_session = requests.Session()


class UpstreamError(Exception):
    """A third-party API failed or returned something unusable."""

    def __init__(self, service: str, message: str):
        super().__init__(f"{service}: {message}")
        self.service = service
        self.message = message


def _get_json(service: str, url: str, params: dict, *, ttl: int, timeout: float = 20.0):
    key = "http:" + hashlib.sha1((url + "?" + "&".join(f"{k}={params[k]}" for k in sorted(params))).encode()).hexdigest()
    cached = cache.get(key)
    if cached is not None:
        return cached
    last_err: Exception | None = None
    for attempt in range(2):
        try:
            resp = _session.get(url, params=params, timeout=timeout, headers={"User-Agent": settings.HTTP_USER_AGENT})
            if resp.status_code == 429 or resp.status_code >= 500:
                raise UpstreamError(service, f"HTTP {resp.status_code}")
            if resp.status_code >= 400:
                # Client errors are not retried; surface the API's reason.
                try:
                    reason = resp.json().get("reason") or resp.json().get("message") or resp.text[:200]
                except ValueError:
                    reason = resp.text[:200]
                raise UpstreamError(service, f"HTTP {resp.status_code}: {reason}")
            data = resp.json()
            cache.set(key, data, ttl)
            return data
        except UpstreamError as err:
            last_err = err
            if "HTTP 4" in err.message and "429" not in err.message:
                raise
        except (requests.RequestException, ValueError) as err:
            last_err = UpstreamError(service, str(err)[:200])
        if attempt == 0:
            time.sleep(0.6)
    assert last_err is not None
    raise last_err


# --------------------------------------------------------------------- OSRM
@dataclass
class OsrmRoute:
    coords: list[LonLat]
    segment_durations_s: list[float] | None
    distance_m: float
    duration_s: float


def osrm_route(waypoints: list[LonLat], alternatives: int = 0) -> list[OsrmRoute]:
    coord_str = ";".join(f"{lon:.6f},{lat:.6f}" for lon, lat in waypoints)
    url = f"{settings.OSRM_BASE_URL}/route/v1/driving/{coord_str}"
    params = {
        "overview": "full",
        "geometries": "geojson",
        "annotations": "duration",
        "steps": "false",
        "alternatives": str(alternatives) if alternatives else "false",
    }
    data = _get_json("OSRM", url, params, ttl=6 * 3600, timeout=25)
    if data.get("code") != "Ok":
        raise UpstreamError("OSRM", data.get("message") or data.get("code") or "no route")
    out: list[OsrmRoute] = []
    for r in data.get("routes", []):
        coords = [(float(c[0]), float(c[1])) for c in r["geometry"]["coordinates"]]
        durations: list[float] = []
        for leg in r.get("legs", []):
            durations.extend(float(d) for d in (leg.get("annotation") or {}).get("duration", []))
        out.append(
            OsrmRoute(
                coords=coords,
                segment_durations_s=durations if len(durations) == len(coords) - 1 else None,
                distance_m=float(r["distance"]),
                duration_s=float(r["duration"]),
            )
        )
    return out


# ---------------------------------------------------------------- Open-Meteo
HOURLY_VARS = ("wind_speed_10m", "wind_gusts_10m", "rain", "showers", "snowfall", "temperature_2m")
BATCH_SIZE = 90


@dataclass
class HourlySeries:
    """Hourly forecast for one point. `times[i]` is the END of hour i for the
    precipitation sums (Open-Meteo convention: preceding-hour total) and the
    instant for wind/temperature."""

    times: list[datetime]
    wind_mph: list[float]
    gust_mph: list[float]
    rain_in: list[float]  # rain + showers, inches in the preceding hour
    snow_in: list[float]  # snowfall, inches in the preceding hour
    temp_f: list[float]

    def index_at_or_after(self, t: datetime) -> int:
        for i, ts in enumerate(self.times):
            if ts >= t:
                return i
        return len(self.times) - 1

    def at(self, t: datetime) -> dict:
        """Conditions the truck meets at instant `t`.

        Wind/gust/temperature: linear interpolation between the bracketing hours.
        Rain/snow: the hourly total of the hour that contains `t` (the first
        timestamp >= t), which is an in/hr rate by construction.
        """
        i = self.index_at_or_after(t)
        precip_i = i
        if i == 0 or self.times[i] <= t:
            w, g, tf = self.wind_mph[i], self.gust_mph[i], self.temp_f[i]
        else:
            t0, t1 = self.times[i - 1], self.times[i]
            f = (t - t0).total_seconds() / max(1.0, (t1 - t0).total_seconds())
            w = self.wind_mph[i - 1] + (self.wind_mph[i] - self.wind_mph[i - 1]) * f
            g = self.gust_mph[i - 1] + (self.gust_mph[i] - self.gust_mph[i - 1]) * f
            tf = self.temp_f[i - 1] + (self.temp_f[i] - self.temp_f[i - 1]) * f
        return {
            "wind_mph": w,
            "gust_mph": g,
            "rain_in_hr": self.rain_in[precip_i],
            "snow_in_hr": self.snow_in[precip_i],
            "temp_f": tf,
            "forecast_hour": self.times[precip_i],
        }


def _num(v) -> float:
    return float(v) if v is not None else 0.0


def _parse_series(item: dict) -> HourlySeries:
    hourly = item["hourly"]
    units = item.get("hourly_units", {})
    snow_factor = 1.0
    # With precipitation_unit=inch Open-Meteo reports snowfall in inches; guard
    # against the cm default (1 in = 2.54 cm) in case the parameter is dropped.
    if str(units.get("snowfall", "")).strip().lower() == "cm":
        snow_factor = 1 / 2.54
    times = [datetime.fromisoformat(t).replace(tzinfo=timezone.utc) for t in hourly["time"]]
    rain = [_num(r) + _num(s) for r, s in zip(hourly["rain"], hourly["showers"])]
    return HourlySeries(
        times=times,
        wind_mph=[_num(v) for v in hourly["wind_speed_10m"]],
        gust_mph=[_num(v) for v in hourly["wind_gusts_10m"]],
        rain_in=rain,
        snow_in=[_num(v) * snow_factor for v in hourly["snowfall"]],
        temp_f=[_num(v) for v in hourly["temperature_2m"]],
    )


def weather_key(p: LonLat) -> tuple[float, float]:
    """Points are snapped to a 0.1° grid (~7 mi), close to the forecast model
    resolution, so nearby checkpoints share one forecast and one API slot."""
    return (round(p[0], 1), round(p[1], 1))


def fetch_hourly(points: list[LonLat], start: datetime, end: datetime) -> dict[tuple[float, float], HourlySeries]:
    """Hourly forecasts for many points, batched (many lat/lon per request)."""
    keys = sorted({weather_key(p) for p in points})
    start_s = start.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:00")
    end_s = end.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:00")
    batches = [keys[i : i + BATCH_SIZE] for i in range(0, len(keys), BATCH_SIZE)]

    def run(batch: list[tuple[float, float]]):
        params = {
            "latitude": ",".join(f"{lat:.1f}" for _, lat in batch),
            "longitude": ",".join(f"{lon:.1f}" for lon, _ in batch),
            "hourly": ",".join(HOURLY_VARS),
            "wind_speed_unit": "mph",
            "precipitation_unit": "inch",
            "temperature_unit": "fahrenheit",
            "timezone": "GMT",
            "start_hour": start_s,
            "end_hour": end_s,
        }
        data = _get_json("Open-Meteo", f"{settings.OPEN_METEO_BASE_URL}/v1/forecast", params, ttl=30 * 60, timeout=30)
        items = data if isinstance(data, list) else [data]
        if len(items) != len(batch):
            raise UpstreamError("Open-Meteo", "unexpected number of locations in response")
        return {k: _parse_series(item) for k, item in zip(batch, items)}

    result: dict[tuple[float, float], HourlySeries] = {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        for part in pool.map(run, batches):
            result.update(part)
    return result


def origin_timezone(p: LonLat) -> str:
    params = {"latitude": f"{p[1]:.2f}", "longitude": f"{p[0]:.2f}", "current": "temperature_2m", "timezone": "auto"}
    try:
        data = _get_json("Open-Meteo", f"{settings.OPEN_METEO_BASE_URL}/v1/forecast", params, ttl=24 * 3600, timeout=10)
        return str(data.get("timezone") or "UTC")
    except UpstreamError:
        log.warning("timezone lookup failed; falling back to UTC")
        return "UTC"


def forecast_horizon() -> datetime:
    """Open-Meteo serves ~16 days; we only accept trips inside 7 days."""
    return datetime.now(timezone.utc) + timedelta(days=15)


# ------------------------------------------------------------------- Photon
def geocode(query: str, limit: int = 6) -> list[dict]:
    params = {"q": query, "limit": str(limit), "lang": "en", "lat": "39.5", "lon": "-98.35"}
    try:
        data = _get_json("Photon", f"{settings.PHOTON_BASE_URL}/api/", params, ttl=24 * 3600, timeout=8)
        results = []
        for f in data.get("features", []):
            props = f.get("properties", {})
            lon, lat = f["geometry"]["coordinates"]
            parts = [props.get("name") or props.get("street"), props.get("city") if props.get("city") != props.get("name") else None, props.get("state"), props.get("countrycode")]
            label = ", ".join(p for p in parts if p)
            if not label:
                continue
            results.append({"label": label, "lat": float(lat), "lon": float(lon), "kind": props.get("osm_value") or props.get("type")})
        if results:
            return _dedupe(results)
    except UpstreamError:
        log.warning("Photon failed, falling back to Open-Meteo geocoding")
    data = _get_json(
        "Open-Meteo geocoding",
        "https://geocoding-api.open-meteo.com/v1/search",
        {"name": query, "count": str(limit), "language": "en"},
        ttl=24 * 3600,
        timeout=8,
    )
    return _dedupe(
        [
            {
                "label": ", ".join(p for p in (r.get("name"), r.get("admin1"), r.get("country_code")) if p),
                "lat": float(r["latitude"]),
                "lon": float(r["longitude"]),
                "kind": "place",
            }
            for r in data.get("results", []) or []
        ]
    )


def _dedupe(items: list[dict]) -> list[dict]:
    seen, out = set(), []
    for it in items:
        if it["label"] in seen:
            continue
        seen.add(it["label"])
        out.append(it)
    return out
