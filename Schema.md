# Schema

**No database.** The app is stateless: every plan is computed from the request plus third-party API responses. Django runs with `DATABASES = {}`; nothing is persisted, so there are no migrations, ownership or retention rules.

## In-memory cache (Django LocMemCache, per process)
| Key | Value | TTL |
|---|---|---|
| `http:<sha1(url+sorted params)>` | parsed JSON from OSRM / Open-Meteo / Photon | 6 h / 30 min / 24 h |

## Request entity — `PlanRequest`
| Field | Type | Validation |
|---|---|---|
| origin, destination | `{label ≤200, lat −90..90, lon −180..180}` | must differ |
| departure_local | `YYYY-MM-DDTHH:MM` or null | interpreted in origin's IANA zone; now−1 h ≤ t ≤ now+7 d |
| load_lb | float | 0..80,000 |
| interval_mi | int | one of 10, 25, 50 |

## Response entities
- **Route**: id (a/b/c), name, source (`osrm`/`osrm-alternative`/`via-point`), geometry `[lon,lat][]` (simplified), arrival (UTC ISO), summary, rank, verdict, checkpoints[], hourly_position[49].
- **Checkpoint**: index, mile, lon, lat, eta, elapsed_s, segment_mi (owned miles), weather {wind_mph, gust_mph, rain_in_hr, snow_in_hr, temp_f, forecast_hour}, risk {level 0–4, label, wind, rain, snow, load, drivers[], load_rule}.
- **Summary**: distance_mi, duration_s, no_travel_mi, severe_mi, high_mi, moderate_mi, low_mi, avg_risk (mile-weighted 0–4), max_risk.
- **HeatCell**: lon, lat, score[49] (0–4 continuous), wind[49] mph, rain[49] in/h, snow[49] in/h.

Relationships: Plan 1—3 Route 1—N Checkpoint; Plan 1—N HeatCell. Invariant: Σ checkpoint.segment_mi = route distance.

## Seed data
None. "Sample trip" in the UI fills Dallas → Denver, 42,000 lb.
