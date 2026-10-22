# Implementation Plan

| Phase | Slice | Verify |
|---|---|---|
| 1 Domain | `risk.py` thresholds + load rules; `recommend.py` ranking | `pytest routing/tests/test_risk.py test_recommend.py` |
| 2 Geometry | `geo.py` Track, sampling, owned miles, simplify | `pytest routing/tests/test_sampling.py` |
| 3 Integrations | OSRM / Open-Meteo / Photon clients, cache, retries; 3-route builder | live call Dallas→Denver returns 3 routes |
| 4 API | serializers (validation, origin-local departure), `/api/plan`, `/api/geocode`, error mapping | `pytest routing/tests/test_api.py` (stubbed upstreams) |
| 5 UI shell | tokens, layout, form, combobox, states | `npm run typecheck && npm run build` |
| 6 Map | routes, risk segments, checkpoints, popups, heatmap, slider dock, trucks | manual: slider has no network calls; 60 fps scrub |
| 7 Deploy | `vercel.json`, `api/index.py`, root `requirements.txt` | hosted `/api/health`, full plan on hosted URL |
| 8 Docs | README, 9 docs, DESIGN.md | review |

Order: domain → services → API → UI → wiring → deploy → docs (dependency order).

## Checkpoints
- **Test**: after phases 1, 2, 4 and before every push: `cd backend && pytest -q`.
- **Design**: after phase 6 review desktop + 390 px mobile screenshots against DESIGN.md.
- **Security**: before deploy, confirm no secrets in repo, input validation on every field, upstream errors don't leak stack traces (DEBUG off).
- **Release**: hosted smoke test — `GET /api/health`, plan Dallas→Denver, UI loads tiles.

## Rollback
Vercel keeps every deployment; "Promote" a previous one. Stateless app, no data migration.

## Verification commands
```bash
cd backend && pip install -r requirements-dev.txt && pytest -q
cd frontend && npm ci && npm run typecheck && npm run build
python backend/manage.py runserver & (cd frontend && npm run dev)
curl -X POST localhost:5173/api/plan -H 'Content-Type: application/json' \
  -d '{"origin":{"label":"Dallas","lat":32.7767,"lon":-96.797},"destination":{"label":"Denver","lat":39.7392,"lon":-104.9903},"load_lb":42000,"interval_mi":25}'
```
