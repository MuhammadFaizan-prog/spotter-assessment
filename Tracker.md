# Tracker

## Current status
MVP complete; live on Vercel at https://spotter-weather-routing-olive.vercel.app (project `spotter-weather-routing`, Hobby plan, auto-deploys from `main`). Walkthrough video recorded; owner submits the Spotter questionnaire.

## Stories
| ID | Title | Pri | Acceptance criteria | Status | Pass | Evidence |
|---|---|---|---|---|---|---|
| US1 | 3 routes for any trip | P0 | exactly 3 ranked routes | done | ✅ | live Dallas→Denver: A osrm, B osrm-alternative, C via-point; `test_plan_returns_three_ranked_routes` |
| US2 | Checkpoints with ETA + weather | P0 | mile 0 ETA = departure, monotonic ETAs, 10/25/50 | done | ✅ | `test_sampling.py`, live plan at 10 mi (≈80–90 checkpoints/route) |
| US3 | Correct risk + load rules | P0 | every edge tested | done | ✅ | `test_risk.py` (39 cases) |
| US4 | Explainable recommendation | P0 | documented order, reason line | done | ✅ | `test_recommend.py` |
| US5 | 0–48 h heatmap slider | P0 | no network on scrub | done | ✅ | paint-expression swap only (MapView.tsx) |
| US6 | Mobile + keyboard | P1 | ≤900 px stacked, focus rings, combobox keys | done | ✅ | CSS breakpoints; ARIA combobox/radiogroups |
| D1 | Hosted on Vercel | P0 | hosted plan works | done | ✅ | https://spotter-weather-routing-olive.vercel.app — `/api/health` 200, Dallas→Denver plan 200 in ~3.5 s, map renders in headless Chromium |
| D2 | Walkthrough video | P0 | 5–10 min | done | ✅ | captioned MP4 of the hosted app (owner's Google Drive, folder `assessment`) |

## Decisions
- No Travel ranked before Severe miles (README "Recommendation").
- Threshold edges go to the higher band; strict `>` kept for rain >1.00 / snow >3.0.
- Average risk compared at 2 decimals (noise → time decides).
- Car routing + 65 mph cap as truck approximation.
- Departure is origin-local; window now−1 h … +7 d.
- Stateless backend, no DB; LocMemCache.
- Vercel single project (static + Python function); Railway excluded.

## Assumptions
US-focused (geocoder bias, imperial units). Sustained wind (not gusts) is scored.

## Blockers
None.

## Next actions
- Owner: submit repo, hosted URL and walkthrough link on the Spotter questionnaire.
- Nice-to-have: shared cache (Upstash) + DRF throttling; truck routing engine.

## Verification history
- 2026-10-22: `pytest -q` → 68 passed. `npm run typecheck` clean, `npm run build` ok. Local `vite preview` + `runserver`: `/api/geocode?q=Denver` 200, `/api/plan` Dallas→Denver 42,000 lb @10 mi 200 in ~4.5 s (262 KB, gzip on), past departure → 400.
- 2026-10-22 (map fix): map was blank because MapLibre's `.maplibregl-map {position:relative}` overrode `.map__canvas {position:absolute; inset:0}` (0 px container) and the worker was not bundled. Fixed both (`?worker&url` + `setWorkerUrl`; doubled selector with explicit size); routes now fit clear of the legend/dock; mobile map pins at 48vh once a plan exists, compact dock, popups open above the dock. Verified in headless Chromium (SwiftShader WebGL) at 1440×900 and 390×844, local and hosted: routes, checkpoints, heatmap, slider and popups render. `pytest -q` 68 passed · `npm run typecheck` clean · `npm test` 3 passed · `npm run build` ok.
- 2026-10-22 (hosted): https://spotter-weather-routing-olive.vercel.app — `/api/health` → `{"ok":true}`; `/api/geocode?q=Dallas TX` 200; `POST /api/plan` Dallas→Denver, 42,000 lb, 10 mi → 200, 3 routes (81/90/83 checkpoints), 160 heatmap cells × 49 h, ~3.1 s server time.
