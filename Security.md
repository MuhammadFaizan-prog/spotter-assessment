# Security

## Auth / roles
None. Public, read-only tool; no accounts, no user data stored. All routes are public: `/`, `/api/plan`, `/api/geocode`, `/api/health`.

## Trust boundaries
1. Browser → Django: untrusted JSON. Validated by DRF serializers (types, ranges, enum interval, departure window, origin≠destination, query length ≤120).
2. Django → OSRM / Open-Meteo / Photon: third-party responses treated as untrusted data: parsed defensively, nulls → 0, unexpected shapes → `UpstreamError` → 502 with a generic message (no stack traces; `DEBUG=0` by default).
3. Popup HTML is built from numeric values and server-provided labels; place labels are rendered as React text (escaped). Route names in popups come from fixed server strings.

## Secrets
None required. `DJANGO_SECRET_KEY` is unused for any signing (no sessions/CSRF cookies) but can be set via env. `.env*` is git-ignored; `.env.example` documents optional overrides.

## Abuse / rate limiting
- Each plan costs ~1 OSRM call (+ up to 8 via calls) and ~3 Open-Meteo calls covering ≤ ~420 locations. Public APIs have fair-use limits (Open-Meteo free tier ~10k calls/day, weighted by locations).
- Mitigations: 0.1° point snapping + URL cache, heatmap capped at 170 cells, interval choices limited to 10/25/50, load and window validation.
- Not implemented (MVP): per-IP throttling. Add DRF `AnonRateThrottle` with a shared cache (Redis/Upstash) before real traffic.

## Privacy
Origin/destination are sent to OSRM, Photon and Open-Meteo (coordinates only for weather). Nothing is logged beyond request lines; no analytics.

## Supply chain
Backend: Django, DRF, requests, tzdata (pinned ranges). Frontend: react, react-dom, maplibre-gl, @fontsource/ibm-plex-*; dev: vite, typescript, oxlint. All mainstream, permissively licensed. `npm ci` uses the lockfile.

## Deployment
Vercel HTTPS by default; same-origin API, so CORS is closed in prod (only `CORS_ALLOWED_ORIGINS`, default localhost:5173, is allowed). `ALLOWED_HOSTS` env-configurable. Function timeout 60 s.

## Incident notes
If an upstream is abused/blocked, swap base URLs via env (`OSRM_BASE_URL`, etc.) to self-hosted instances; no keys to rotate.
