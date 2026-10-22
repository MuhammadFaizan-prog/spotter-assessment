# Spotter Weather Routing

Weather-aware truck routing: enter origin, destination, departure time and load weight; get **three routes** scored by the forecast **at the truck's ETA** every 10 / 25 / 50 miles, a recommendation, and a **0–48 h weather heatmap** along the corridor.

- **Live app:** https://spotter-weather-routing-olive.vercel.app
- **Repo:** https://github.com/MuhammadFaizan-prog/spotter-assessment
- **Stack:** React 19 + Vite + TypeScript + MapLibre GL · Django 5.1 + Django REST Framework · Vercel (static SPA + Python serverless function)
- **APIs (all free, keyless):** OSRM (routing), Open-Meteo (hourly forecast), Photon / OpenStreetMap (geocoding), CARTO Dark Matter (map tiles)

---

## Quick start

```bash
# backend (Python 3.12)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
pytest -q                              # 68 tests
python manage.py runserver             # http://127.0.0.1:8000/api/health

# frontend (Node 20+)
cd frontend
npm ci
npm run dev                            # http://localhost:5173 (proxies /api → :8000)
npm run typecheck && npm run build
```

No environment variables are required. Optional overrides are listed in `.env.example`.

### Deploy (Vercel)
Import the repo in Vercel with the root directory as-is. `vercel.json` builds `frontend/` into `frontend/dist`, deploys `api/index.py` (Django WSGI) as a Python function, and rewrites `/api/*` to it. No secrets needed.

---

## Architecture

```
React SPA (MapLibre) ── POST /api/plan ──▶ Django/DRF (stateless, no DB)
                     ── GET  /api/geocode ─▶   ├─ routes.py   OSRM: alternatives + via-point variants → 3 routes
                                                ├─ geo.py      checkpoints every N mi, ETA from per-segment durations
                                                ├─ clients.py  Open-Meteo batched hourly forecast (+ cache)
                                                ├─ risk.py     thresholds + load rules
                                                ├─ recommend.py ranking + reason
                                                └─ heatmap.py  corridor grid × 49 hours
```

One request returns everything the UI needs, including all 49 heatmap frames, so the slider never calls the network. See `Techspec.md` for the full API contract.

### Why these APIs
| Need | Choice | Why |
|---|---|---|
| Routing | OSRM public server | Free, no key, returns alternatives and per-segment durations (`annotations=duration`) for accurate ETAs |
| Weather | Open-Meteo | Free, no key, hourly wind (mph), rain/showers and snowfall (inches), **many locations per request**, `start_hour`/`end_hour` windowing |
| Geocoding | Photon (komoot) | Free OSM geocoder with typo tolerance and US bias; falls back to Open-Meteo geocoding |
| Map | MapLibre GL + CARTO Dark Matter | Open-source WebGL renderer with a native heatmap layer; free vector tiles |

---

## How it works

### 1. Three routes
OSRM is asked for up to 3 alternatives. It often returns only 1–2, so the backend routes through via points offset perpendicular to the trip heading (midpoint ±18% / ±32% of the straight-line distance, plus quarter points) and keeps the fastest **distinct** variants (<80% shared ~3.5 mi grid cells, ≤1.45× the main route's length). The public OSRM server only has a car profile, so every segment is slowed to at most **65 mph** to approximate a loaded truck.

### 2. Checkpoints and ETAs
Checkpoints are placed at mile 0, every *N* miles (10/25/50), and at the destination. The ETA at each comes from OSRM's per-segment durations (after the truck cap), interpolated along the polyline: `ETA = departure + elapsed seconds at that mile`. Each checkpoint **owns** the road from the midpoint with the previous checkpoint to the midpoint with the next, so owned miles add up exactly to the route length (no double counting in Severe/High miles).

### 3. Weather at the ETA
All checkpoint and heatmap points are snapped to a 0.1° grid (~7 mi, close to model resolution), de-duplicated and fetched in batches of 90 locations per Open-Meteo call. At ETA *t*:
- wind (and gust/temperature) is linearly interpolated between the two surrounding hours;
- rain (`rain + showers`) and snow (`snowfall`) use the total of the hour containing *t*, which is an inches-per-hour rate. With `precipitation_unit=inch` Open-Meteo returns snowfall in inches; the client converts from cm if the unit ever comes back as cm.

Departure is entered in the **origin's local time** (time zone looked up from Open-Meteo) and must be between now and 7 days ahead. All times in the UI are shown in the origin's zone.

### 4. Risk logic
Per checkpoint, each factor is classified with the brief's table; **final level = max(wind, rain, snow, load rule)**.

| Condition | Low | Moderate | High | Severe | No Travel |
|---|---|---|---|---|---|
| Wind | <25 mph | 25–34 | 35–44 | 45–54 | ≥55 mph |
| Rain | <0.10 in/h | 0.10–0.25 | 0.25–0.50 | 0.50–1.00 | >1.00 |
| Snow | <0.5 in/h | 0.5–1.0 | 1.0–2.0 | 2.0–3.0 | >3.0 |

Load rules: wind ≥55 mph → No Travel (any load); 45–54 mph and load >30,000 lb → No Travel; 35–44 mph and load >40,000 lb → Severe.

Boundary decisions:
- Shared edges go to the **higher** band (25 mph = Moderate, 0.25 in/h = High, 2.0 in/h snow = Severe), the conservative reading.
- Where the brief writes a strict `>` (rain >1.00, snow >3.0), exactly 1.00 / 3.0 stays **Severe**.
- Fractional wind falls into the band whose lower bound it has passed (34.6 mph = Moderate).
- Wind risk uses sustained 10 m wind, as the thresholds describe; gusts are shown but not scored.

### 5. Recommendation
Routes are sorted by:
1. **fewest No-Travel miles** ← added
2. fewest Severe miles
3. fewest High miles
4. lowest average risk (mile-weighted, Low=0 … No Travel=4)
5. shortest travel time

**Decision: No Travel is treated as worse than Severe**, so it is compared first. Without it, the literal order would prefer a route crossing 5 No-Travel miles over one with 10 Severe miles. Mile totals are compared at 0.1 mi; average risk at 2 decimals, so a negligible difference (e.g. 8 Moderate miles over 800 mi) counts as a tie and travel time decides. Each card shows the line that decided its rank ("More High miles (12 mi vs 0 mi)").

### 6. Heatmap and slider
A uniform lat/lon grid (≤170 cells, ~0.3–0.6°) covers everything within 60 mi of any route. For each cell and each hour 0–48 from the departure hour, the API returns a continuous 0–4 risk score (piecewise-linear between the same thresholds, so its integer part always matches the discrete class) plus raw wind/rain/snow. The client loads all 49 frames once as feature properties; moving the slider only swaps the heatmap weight expression and moves three truck dots inside `requestAnimationFrame` — no refetch, no React re-render of the panel. Layers: **Risk** (includes load rules), **Wind**, **Rain/Snow**.

---

## Tests

```bash
cd backend && pytest -q
```
- `test_risk.py` — every threshold edge for wind/rain/snow, each load rule and its boundaries, max-of-factors, drivers, heatmap score consistency.
- `test_sampling.py` — checkpoints at 10/25/50 mi incl. ends, owned miles sum to length, ETA from segment durations, clamping, short routes.
- `test_recommend.py` — each step of the ordering, No-Travel-before-Severe, float-noise ties, verdict text.
- `test_api.py` — end-to-end `/api/plan` with stubbed OSRM/Open-Meteo (3 routes, ranks, load-rule Severe, 49-hour frames), validation errors, upstream failure → 502.

Frontend: `npm run typecheck` (strict TS), `npm test` (Vitest + Testing Library smoke tests: sample trip renders three ranked routes; the panel survives a WebGL failure) and `npm run build`.

## Limitations
- Car-profile routing with a speed cap; no truck restrictions, no hours-of-service breaks.
- Public OSRM/Open-Meteo/Photon have fair-use limits and no SLA; failures show a Retry.
- Cache is in-memory per serverless instance.
- Forecasts only up to 7 days ahead are accepted.

## Project docs
`PRD.md`, `Techspec.md`, `Appflow.md`, `Schema.md`, `ImplementationPlan.md`, `Tracker.md`, `Rules.md`, `Security.md`, `Structure.md`, `DESIGN.md` (design references and tokens).
