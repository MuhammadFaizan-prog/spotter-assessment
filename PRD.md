# PRD — Weather-Aware Truck Routing

## Summary
A React + Django web app that helps a truck driver pick the safest of three routes for a given departure time and load weight, using forecast weather at the truck's ETA along each route.

## Target users
- **Long-haul driver / owner-operator** planning a run before leaving.
- **Dispatcher** comparing options for a loaded truck.

## Problems
- Weather apps show conditions *now*, not where the truck will be in 6 hours.
- Wind risk depends on load (a light trailer is far more exposed), which generic apps ignore.
- Comparing routes by safety and time means juggling several tools.

## Goals
1. Generate 3 route options for any origin/destination.
2. Score each route on weather at the ETA of checkpoints every 10/25/50 mi.
3. Recommend a route with a transparent, deterministic rule.
4. Show routes, checkpoints, risk, ETAs, summaries and a 0–48 h corridor heatmap on a smooth map.

## Non-goals
Turn-by-turn navigation, hours-of-service planning, truck-specific restrictions (bridge heights, hazmat), accounts, saved trips, live re-routing.

## MVP scope / features
| ID | Feature |
|---|---|
| F1 | Trip form: origin & destination (autocomplete), departure (now or scheduled, origin-local), load weight (lb), sampling interval 10/25/50 mi |
| F2 | 3 distinct routes (OSRM alternatives + via-point variants) |
| F3 | Checkpoints every N mi with ETA from per-segment durations |
| F4 | Hourly forecast at each checkpoint's ETA (wind mph, rain in/h, snow in/h) |
| F5 | Risk per checkpoint per brief thresholds + load rules |
| F6 | Route summary: No-Travel / Severe / High / Moderate / Low miles, avg risk, duration, distance, arrival |
| F7 | Recommendation: fewest No-Travel → Severe → High miles → lowest avg risk → shortest time, with a one-line reason |
| F8 | Map: all routes, selected route coloured by risk, checkpoints with popups, origin/destination pins |
| F9 | Corridor heatmap with 0–48 h slider (play/pause), layer Risk / Wind / Rain-Snow, truck positions per hour |
| F10 | Empty, loading, error states; keyboard accessible; responsive to mobile |

## User stories & acceptance criteria
- **US1** As a driver I enter Dallas, TX → Denver, CO, 42,000 lb, every 25 mi, and get exactly 3 routes. *AC*: response has 3 routes with rank 1–3; cards show duration, distance, arrival.
- **US2** I see each checkpoint's ETA and weather. *AC*: checkpoint at mile 0 has ETA = departure; ETAs increase monotonically; each has wind/rain/snow and a level.
- **US3** I trust the risk levels. *AC*: unit tests cover every threshold edge and each load rule.
- **US4** I know why a route is recommended. *AC*: reason names the deciding factor; ranking follows the documented order (tests).
- **US5** I scrub the next 48 h of weather. *AC*: slider 0–48 updates the heatmap and truck dots with no network request.
- **US6** I can use it on a phone. *AC*: ≤900 px layout stacks map above panel; all controls reachable by keyboard.

## Success metrics
Plan completes in < 10 s for an 800 mi trip; slider frame updates < 16 ms; zero unhandled errors on upstream failure.

## Constraints
Free, keyless APIs only; deploy on Vercel free tier; 16 h effort budget.

## Open questions
- Should No-Travel checkpoints block a route outright instead of ranking it last? (Currently ranked last and flagged.)
- Truck-profile routing would need a paid/self-hosted engine (GraphHopper/Valhalla truck).
