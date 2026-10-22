# Structure

```
.
├── api/index.py                 # Vercel Python function → Django WSGI app
├── backend/
│   ├── manage.py
│   ├── pytest.ini
│   ├── requirements-dev.txt
│   ├── config/                  # settings (no DB), urls (/api/…), wsgi
│   └── routing/                 # the one Django app
│       ├── serializers.py       # request validation, origin-local departure
│       ├── views.py             # plan, geocode, health
│       ├── urls.py
│       ├── middleware.py        # dev-only CORS
│       ├── services/
│       │   ├── risk.py          # thresholds + load rules (source of truth)
│       │   ├── recommend.py     # summaries, ranking, reasons
│       │   ├── geo.py           # Track, sampling, simplify
│       │   ├── routes.py        # 3 distinct routes, truck speed cap
│       │   ├── heatmap.py       # corridor grid
│       │   ├── clients.py       # OSRM / Open-Meteo / Photon + cache
│       │   └── planner.py       # orchestration → response JSON
│       └── tests/               # pytest: risk, sampling, recommend, api
├── frontend/
│   ├── index.html, vite.config.ts (dev/preview proxy /api → :8000)
│   └── src/
│       ├── main.tsx, App.tsx    # state + layout
│       ├── api.ts, types.ts     # typed API client
│       ├── components/          # TripForm, PlaceInput, RouteCards, CheckpointTimeline, MapView, TimeDock, Legend
│       ├── lib/                 # risk palette, formatting, geo helpers
│       └── styles/              # tokens.css, app.css
├── vercel.json                  # build + function + rewrite
├── requirements.txt             # runtime Python deps (Vercel + local)
├── .env.example
└── PRD.md Techspec.md Appflow.md Schema.md ImplementationPlan.md Tracker.md Rules.md Security.md Structure.md DESIGN.md README.md
```

- Routes/API handlers: `backend/routing/views.py`, URLconf `backend/routing/urls.py` mounted at `/api/`.
- No schema/migrations (stateless).
- Tests: `backend/routing/tests/`. Frontend verification: `npm run typecheck`, `npm run build`.
- Generated output: `frontend/dist/` (git-ignored).
- No platform adapter files (no AGENTS.md/CLAUDE.md); `Rules.md` is canonical.
