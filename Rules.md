# Rules (humans and AI agents)

## Code
- Domain rules live only in `backend/routing/services/risk.py` and `recommend.py`. Never re-implement thresholds elsewhere; the frontend's `lib/risk.ts` mirrors them **for display/heatmap shading only** — if a threshold changes, change both and the tests.
- Services are pure where possible (`risk`, `geo`, `recommend`, `heatmap`); I/O only in `clients.py`. Planner orchestrates.
- All external HTTP goes through `clients._get_json` (UA, timeout, retry, cache).
- Units are explicit in names: `_mi`, `_s`, `_mph`, `_in_hr`, `_lb`. Times are UTC ISO strings on the wire; format to the origin's zone only in the UI.
- Python: type hints, dataclasses, no ORM. TypeScript: `strict`, no `any`, API types in `src/types.ts` match `planner.py` output.
- Frontend: one component per file in `src/components`; helpers in `src/lib`; no CSS-in-JS; use tokens from `styles/tokens.css`, never raw hex outside tokens/risk palette.
- Map performance: never rebuild GeoJSON sources on slider moves; change paint expressions or tiny sources only.

## Design
- Saturated colour is reserved for the risk scale. Actions are white/grey.
- Every risk display pairs colour with a text label or shape.
- Every async surface has loading, empty and error states; every control has a visible focus ring.

## Naming / folders
See `Structure.md`. Routes are named Route A/B/C in engine order; rank is separate.

## Testing
- Any change to risk, sampling or ranking needs a test at the boundary it touches.
- API tests stub `osrm_route`, `fetch_hourly`, `origin_timezone` — tests must never hit the network.
- Before pushing: `pytest -q` and `npm run typecheck && npm run build` must pass.

## Docs
Update `Tracker.md` when work completes; `Techspec.md` for API/architecture changes; README "Risk logic" if a rule interpretation changes.

## Generated files — do not edit
`frontend/dist/`, `frontend/node_modules/`, `package-lock.json` (only via npm).

## Agents
Do not add paid APIs or keys. Do not commit `.env`. Do not push to `main` without tests passing.
