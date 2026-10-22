# Tracker

## Current status
MVP complete; deployed to Vercel. Owner still to record the Loom walkthrough and submit the Spotter questionnaire.

## Stories
| ID | Title | Pri | Acceptance criteria | Status | Pass | Evidence |
|---|---|---|---|---|---|---|
| US1 | 3 routes for any trip | P0 | exactly 3 ranked routes | done | ✅ | live Dallas→Denver: A osrm, B osrm-alternative, C via-point; `test_plan_returns_three_ranked_routes` |
| US2 | Checkpoints with ETA + weather | P0 | mile 0 ETA = departure, monotonic ETAs, 10/25/50 | done | ✅ | `test_sampling.py`, live plan at 10 mi (≈80–90 checkpoints/route) |
| US3 | Correct risk + load rules | P0 | every edge tested | done | ✅ | `test_risk.py` (44 cases) |
| US4 | Explainable recommendation | P0 | documented order, reason line | done | ✅ | `test_recommend.py` |
| US5 | 0–48 h heatmap slider | P0 | no network on scrub | done | ✅ | paint-expression swap only (MapView.tsx) |
| US6 | Mobile + keyboard | P1 | ≤900 px stacked, focus rings, combobox keys | done | ✅ | CSS breakpoints; ARIA combobox/radiogroups |
| D1 | Hosted on Vercel | P0 | hosted plan works | done | see below | |
| D2 | Loom walkthrough | P0 | 5–10 min | not started | — | owner records |

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
- Owner: record Loom, submit links on the Spotter questionnaire.
- Nice-to-have: shared cache (Upstash) + DRF throttling; truck routing engine.

## Verification history
- 2026-10-22: `pytest -q` → 68 passed. `npm run typecheck` clean, `npm run build` ok. Local `vite preview` + `runserver`: `/api/geocode?q=Denver` 200, `/api/plan` Dallas→Denver 42,000 lb @10 mi 200 in ~4.5 s (262 KB, gzip on), past departure → 400.
