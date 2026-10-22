"""API tests with the third-party HTTP layer stubbed out (no network)."""
import json
from datetime import datetime, timedelta, timezone

import pytest
from django.test import Client

from routing.services import clients, routes
from routing.services.clients import HourlySeries, OsrmRoute


def fake_osrm(waypoints, alternatives=0):
    (lon1, lat1), (lon2, lat2) = waypoints[0], waypoints[-1]
    if len(waypoints) == 3:
        vlon, vlat = waypoints[1]
        coords = [(lon1, lat1), (vlon, vlat), (lon2, lat2)]
    else:
        coords = [(lon1 + (lon2 - lon1) * i / 20, lat1 + (lat2 - lat1) * i / 20) for i in range(21)]
    return [OsrmRoute(coords=coords, segment_durations_s=None, distance_m=0, duration_s=10 * 3600)]


def fake_hourly(points, start, end):
    hours = int((end - start).total_seconds() // 3600) + 1
    times = [start + timedelta(hours=h) for h in range(hours)]
    out = {}
    for p in points:
        k = clients.weather_key(p)
        # windy band north of 36°N so routes differ
        wind = 40.0 if k[1] > 36 else 10.0
        out[k] = HourlySeries(times, [wind] * hours, [wind + 5] * hours, [0.0] * hours, [0.0] * hours, [50.0] * hours)
    return out


@pytest.fixture
def stubbed(monkeypatch):
    monkeypatch.setattr(routes, "osrm_route", fake_osrm)
    monkeypatch.setattr("routing.services.planner.fetch_hourly", fake_hourly)
    monkeypatch.setattr("routing.views.origin_timezone", lambda p: "America/Chicago")


BODY = {
    "origin": {"label": "Dallas, TX", "lat": 32.7767, "lon": -96.797},
    "destination": {"label": "Denver, CO", "lat": 39.7392, "lon": -104.9903},
    "load_lb": 42000,
    "interval_mi": 50,
}


def post(body):
    return Client().post("/api/plan", json.dumps(body), content_type="application/json")


def test_plan_returns_three_ranked_routes(stubbed):
    r = post(BODY)
    assert r.status_code == 200, r.content
    d = r.json()
    assert len(d["routes"]) == 3
    assert sorted(rt["rank"] for rt in d["routes"]) == [1, 2, 3]
    assert d["recommended_route_id"] == d["ranking"][0]
    cp = d["routes"][0]["checkpoints"]
    assert cp[0]["mile"] == 0 and cp[0]["eta"] == d["request"]["departure"]
    # 40 mph wind + 42,000 lb -> Severe by the load rule north of 36°N
    assert any(c["risk"]["label"] == "Severe" and c["risk"]["load_rule"] for c in cp)
    assert len(d["heatmap"]["cells"]) > 0
    assert len(d["heatmap"]["cells"][0]["score"]) == 49
    assert len(d["routes"][0]["hourly_position"]) == 49


def test_rejects_bad_interval(stubbed):
    assert post({**BODY, "interval_mi": 15}).status_code == 400


def test_rejects_overweight(stubbed):
    assert post({**BODY, "load_lb": 120000}).status_code == 400


def test_rejects_past_departure(stubbed):
    past = (datetime.now(timezone.utc) - timedelta(days=2)).strftime("%Y-%m-%dT%H:%M")
    r = post({**BODY, "departure_local": past})
    assert r.status_code == 400 and "departure_local" in r.json()


def test_rejects_same_origin_destination(stubbed):
    assert post({**BODY, "destination": BODY["origin"]}).status_code == 400


def test_upstream_failure_is_502(monkeypatch, stubbed):
    def boom(*a, **k):
        raise clients.UpstreamError("OSRM", "down")

    monkeypatch.setattr(routes, "osrm_route", boom)
    r = post(BODY)
    assert r.status_code == 502 and "routing" in r.json()["error"].lower()


def test_health():
    assert Client().get("/api/health").json() == {"ok": True}
