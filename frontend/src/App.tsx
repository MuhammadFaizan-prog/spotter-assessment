import { useCallback, useEffect, useRef, useState } from 'react'
import TripForm from './components/TripForm'
import RouteCards from './components/RouteCards'
import CheckpointTimeline from './components/CheckpointTimeline'
import MapView from './components/MapView'
import TimeDock from './components/TimeDock'
import Legend from './components/Legend'
import ErrorBoundary from './components/ErrorBoundary'
import { ApiError, planTrip } from './api'
import type { HeatMetric, Plan, PlanInput } from './types'
import { fmtDayTime, fmtLoad } from './lib/format'

type Status = 'idle' | 'loading' | 'error' | 'ready'

const LOADING_STEPS = ['Requesting three route options', 'Sampling checkpoints along each route', 'Fetching hourly forecasts at each ETA', 'Scoring risk and ranking routes']

function LoadingState() {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)), 1100)
    return () => window.clearInterval(id)
  }, [])
  return (
    <div className="loading" role="status" aria-live="polite">
      <ol className="loading__steps">
        {LOADING_STEPS.map((s, i) => (
          <li key={s} className={i < step ? 'is-done' : i === step ? 'is-now' : ''}>
            {s}
          </li>
        ))}
      </ol>
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton skeleton--card" />
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <section className="empty" aria-label="How it works">
      <h2>How routes are scored</h2>
      <ol>
        <li>
          <strong>Three options.</strong> OSRM alternatives, topped up with via-point variants so you always compare three.
        </li>
        <li>
          <strong>Weather at your ETA.</strong> Every 10, 25 or 50 miles we read the hourly forecast for the moment the truck gets there.
        </li>
        <li>
          <strong>Risk per checkpoint.</strong> The worst of wind, rain and snow, plus the load rules for your weight.
        </li>
        <li>
          <strong>Recommendation.</strong> Fewest No-Travel, then Severe, then High miles, then lowest average risk, then fastest.
        </li>
      </ol>
    </section>
  )
}

export default function App() {
  const [status, setStatus] = useState<Status>('idle')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hour, setHour] = useState(0)
  const [metric, setMetric] = useState<HeatMetric>('risk')
  const [showHeatmap, setShowHeatmap] = useState(true)
  const [focus, setFocus] = useState<{ routeId: string; index: number; nonce: number } | null>(null)
  const [lastInput, setLastInput] = useState<PlanInput | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const run = useCallback(async (input: PlanInput) => {
    setLastInput(input)
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setStatus('loading')
    setError(null)
    try {
      const p = await planTrip(input, ctrl.signal)
      setPlan(p)
      setSelectedId(p.recommended_route_id)
      setHour(0)
      setFocus(null)
      setStatus('ready')
      // Mobile: bring the summary up under the pinned map.
      if (window.matchMedia?.('(max-width: 900px)').matches) {
        requestAnimationFrame(() => document.querySelector('.results')?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setError(e instanceof ApiError ? e : new ApiError('Something went wrong while planning.', 0))
      setStatus('error')
    }
  }, [])

  const onFocusCheckpoint = useCallback((routeId: string, index: number) => {
    setSelectedId(routeId)
    setFocus({ routeId, index, nonce: Date.now() })
    requestAnimationFrame(() => {
      document.querySelector('.tl-row.is-active')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
  }, [])

  const onHour = useCallback((h: number) => setHour(h), [])

  const req = plan?.request
  return (
    <div className={plan ? 'app has-plan' : 'app'}>
      <aside className="panel">
        <header className="brand">
          <div className="brand__mark" aria-hidden>
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path d="M3 17c4-1 5-9 9-9s5 8 9 9" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
              <circle cx="12" cy="8" r="2.2" fill="currentColor" />
            </svg>
          </div>
          <div>
            <h1 className="brand__title">Spotter Weather Routing</h1>
            <p className="brand__sub">Pick the safest truck route for the forecast at your ETA</p>
          </div>
        </header>

        <TripForm busy={status === 'loading'} fieldErrors={error?.fields} onSubmit={run} />

        <div className="results" aria-live="polite">
          {status === 'idle' && <EmptyState />}
          {status === 'loading' && <LoadingState />}
          {status === 'error' && error && (
            <div className="alert" role="alert">
              <div>
                <strong>Couldn’t plan this trip.</strong>
                <p>{error.message}</p>
              </div>
              {error.status !== 400 && lastInput && (
                <button type="button" className="btn btn--ghost" onClick={() => run(lastInput)}>
                  Retry
                </button>
              )}
            </div>
          )}
          {status === 'ready' && plan && req && (
            <>
              <section className="trip-summary" aria-label="Trip">
                <div className="trip-summary__route">
                  <span>{req.origin.label}</span>
                  <span className="trip-summary__arrow" aria-hidden>→</span>
                  <span>{req.destination.label}</span>
                </div>
                <div className="trip-summary__meta mono">
                  Departs {fmtDayTime(req.departure, req.timezone)} · {fmtLoad(req.load_lb)} · every {req.interval_mi} mi
                </div>
              </section>
              <section className="reco" aria-label="Recommendation">
                <span className="reco__kicker">Recommendation</span>
                <p>{plan.recommendation_reason}</p>
              </section>
              <RouteCards plan={plan} selectedId={selectedId} onSelect={setSelectedId} />
              {selectedId && (
                <CheckpointTimeline plan={plan} routeId={selectedId} activeIndex={focus?.routeId === selectedId ? focus.index : null} onFocus={onFocusCheckpoint} />
              )}
              <p className="footnote">
                Routing: OSRM (car profile, speeds capped at 65 mph for a loaded truck). Weather: Open-Meteo hourly forecast. {plan.meta.weather_points} forecast points,
                planned in {(plan.meta.timings_ms.total / 1000).toFixed(1)} s.
              </p>
            </>
          )}
        </div>
      </aside>

      <main className="stage">
        <ErrorBoundary label="The map">
        <MapView
          plan={plan}
          selectedId={selectedId}
          hour={hour}
          metric={metric}
          showHeatmap={showHeatmap}
          focus={focus}
          onSelectRoute={setSelectedId}
          onFocusCheckpoint={onFocusCheckpoint}
        />
        </ErrorBoundary>
        {status === 'loading' && <div className="stage__progress" role="progressbar" aria-label="Planning" />}
        {plan && (
          <div className="stage__overlay">
            <Legend />
            <TimeDock
              plan={plan}
              hour={hour}
              onHour={onHour}
              metric={metric}
              onMetric={setMetric}
              showHeatmap={showHeatmap}
              onToggleHeatmap={() => setShowHeatmap((s) => !s)}
            />
          </div>
        )}
        {!plan && status !== 'loading' && (
          <div className="stage__hint">
            <span>Enter a trip to see routes, checkpoints and the 48-hour weather corridor.</span>
          </div>
        )}
      </main>
    </div>
  )
}
