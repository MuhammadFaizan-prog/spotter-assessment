# Appflow

## Primary journey
1. Land → empty state explains scoring; map shows the US.
2. Type origin → pick from suggestions (↑/↓/Enter). Same for destination (or **Sample trip**).
3. Leave now / Schedule (origin-local datetime, ≤7 days). Load weight (presets 20k/35k/42k/80k; hint shows which load rule applies). Interval 10/25/50 mi.
4. **Compare routes** → loading steps + skeletons + map progress bar.
5. Result: trip summary, recommendation reason, 3 route cards (recommended first and pre-selected), map fits all routes.
6. Click a card or a line on the map to select a route → its line becomes risk-coloured, its checkpoints brighten, the timeline lists its checkpoints.
7. Click a checkpoint (map or timeline) → map eases to it and opens a popup (ETA, weather, driver, load rule).
8. Drag/play the 0–48 h slider → heatmap and truck dots move; switch layer Risk / Wind / Rain-Snow; toggle heatmap.
9. Edit any field and re-plan.

## Onboarding
None needed — no account. Empty state + Sample trip act as onboarding.

## Screens / regions
- **Panel**: brand · trip form · results (summary, recommendation, route cards, checkpoint timeline, sources footnote).
- **Map stage**: map, legend (collapsible), time dock.

## States
| State | Behaviour |
|---|---|
| Empty | "How routes are scored" card; map hint pill |
| Loading | 4-step progress list, 3 skeleton cards, 2 px sweep on map; submit disabled with spinner |
| Validation error | inline field messages (missing place, same place, load outside 0–80,000 lb, past/far departure from API) |
| Upstream error | alert with reason (routing / weather unavailable) and Retry |
| Place search | spinner, "No places match", "search unavailable" |
| Map tiles fail | banner on map; panel data remains usable |
| Permission denied | N/A (no auth) |

## Edge cases
- OSRM returns <3 routes → via-point variants; constrained corridors relax the duplicate threshold.
- Very short trip (< interval) → origin + destination checkpoints only.
- Trip longer than 48 h → checkpoints still use the forecast at their ETA (window extends); heatmap covers 48 h.
- Departure in the past (>1 h) or >7 days → 400 with message.
- Forecast null values → treated as 0.

## Responsive
≤900 px: map on top (62 vh, sticky), panel below; legend collapsed; tick labels thinned; dock controls wrap. ≤420 px: stats grid 2×2.
