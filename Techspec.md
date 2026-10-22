# Techspec

## Architecture
```
Browser (React SPA, MapLibre) ──/api/plan, /api/geocode──▶ Django + DRF (stateless)
                                                          ├─ OSRM public server (routes, alternatives, via routes)
                                                          ├─ Open-Meteo forecast (hourly, batched multi-location)
                                                          └─ Photon (geocoding)  ↳ fallback Open-Meteo geocoding
```
One Vercel project serves the built SPA as static files and the Django WSGI app as a Python serverless function (`api/index.py`, rewrite `/api/(.*)`). Same origin in prod; Vite proxy in dev.

## Frontend
React 19 + Vite + TypeScript (strict). MapLibre GL JS with the CARTO Dark Matter vector style (free, attribution). No state library: `App` owns plan/selection/hour state; MapView is an imperative wrapper with refs.
Slider performance: heatmap data for all 49 hours is loaded once as properties `r0..r48`, `w0..w48`, `p0..p48` on ~160 points; moving the slider only swaps the `heatmap-weight` expression (`['get','r12']`) and updates a 3-point truck source inside `requestAnimationFrame`. No refetch, no re-render of the panel.

## Backend
Django 5.1 + DRF, no database, no auth. Modules under `backend/routing/services/`:
- `risk.py` — thresholds, load rules, `assess()`, continuous heatmap score.
- `geo.py` — haversine, `Track` (cumulative miles + seconds), `sample_checkpoints()`, Douglas–Peucker.
- `routes.py` — 3 distinct routes; via-point fallback; truck speed cap 65 mph per segment.
- `clients.py` — HTTP with UA, timeout, one retry, URL-keyed cache; OSRM, Open-Meteo, Photon clients.
- `heatmap.py` — corridor grid (uniform lat/lon, ≤170 cells within 60 mi of any route).
- `recommend.py` — summaries, ranking, reasons.
- `planner.py` — orchestration.

## API
`POST /api/plan`
```json
{ "origin": {"label":"Dallas, TX","lat":32.78,"lon":-96.80},
  "destination": {"label":"Denver, CO","lat":39.74,"lon":-104.98},
  "departure_local": "2026-10-23T08:00" | null,
  "load_lb": 42000, "interval_mi": 10|25|50 }
```
Returns `request` (resolved UTC departure + origin time zone), `routes[]` (geometry, checkpoints with ETA/weather/risk, summary, rank, verdict, hourly_position[49]), `recommended_route_id`, `recommendation_reason`, `ranking`, `heatmap {start, hours:48, step_deg, cells[{lon,lat,score[49],wind[49],rain[49],snow[49]}]}`, `meta`.
Errors: 400 field errors (DRF format); 502 `{error, detail, service}` on upstream failure.
`GET /api/geocode?q=` → `{results:[{label,lat,lon,kind}]}`. `GET /api/health`.

## Weather details
Open-Meteo `hourly=wind_speed_10m,wind_gusts_10m,rain,showers,snowfall,temperature_2m`, `wind_speed_unit=mph`, `precipitation_unit=inch` (snowfall then also returns inches; code converts if the unit comes back as cm), `timezone=GMT`, `start_hour`/`end_hour` limited to the trip window (departure → max(arrival, +48 h) + 2 h). Up to 90 locations per request, 4 in parallel. Points snapped to 0.1° so nearby checkpoints share a forecast.
At ETA *t*: wind/gust/temp are linearly interpolated between hours; rain (= rain + showers) and snow use the hourly total of the hour containing *t* — an in/hr rate by construction.

## Caching
Django LocMemCache keyed by full upstream URL: OSRM 6 h, Open-Meteo 30 min, geocoding 24 h, timezone 24 h. Per serverless instance (warm instances reuse it). Re-planning with a different interval hits the cache.

## Deployment
Vercel: `installCommand`/`buildCommand` build `frontend/`, `outputDirectory frontend/dist`, Python function `api/index.py` (maxDuration 60 s, `includeFiles backend/**`), deps from root `requirements.txt`.

## Observability
Django logging to stdout (Vercel function logs); `meta.timings_ms` in every plan response.

## Tradeoffs
- OSRM public server = car profile; we cap per-segment speed at 65 mph to approximate a loaded truck. No HOS breaks.
- Public demo endpoints have rate limits and no SLA; failures surface as a 502 with a Retry button.
- In-memory cache is not shared across instances (acceptable for an MVP; Redis would fix it).
- Heatmap is a density heatmap over a uniform grid (≈0.3–0.6° cells), not a forecast raster.
