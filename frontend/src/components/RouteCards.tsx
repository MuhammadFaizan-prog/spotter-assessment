import type { Plan, RouteOption } from '../types'
import { RISK } from '../lib/risk'
import { fmtDayTime, fmtDuration, fmtMiles } from '../lib/format'

interface Props {
  plan: Plan
  selectedId: string | null
  onSelect: (id: string) => void
}

function RiskBar({ r }: { r: RouteOption }) {
  const s = r.summary
  const parts = [s.low_mi, s.moderate_mi, s.high_mi, s.severe_mi, s.no_travel_mi]
  const total = parts.reduce((a, b) => a + b, 0) || 1
  return (
    <div className="riskbar" role="img" aria-label={RISK.map((k, i) => `${k.label} ${parts[i].toFixed(0)} mi`).join(', ')}>
      {parts.map((mi, i) =>
        mi > 0 ? <span key={i} style={{ width: `${(mi / total) * 100}%`, background: RISK[i].color }} className={i === 4 ? 'riskbar__hatch' : ''} /> : null,
      )}
    </div>
  )
}

export default function RouteCards({ plan, selectedId, onSelect }: Props) {
  const ordered = [...plan.routes].sort((a, b) => a.rank - b.rank)
  const fastest = Math.min(...plan.routes.map((r) => r.summary.duration_s))
  return (
    <div className="routes" role="radiogroup" aria-label="Route options">
      {ordered.map((r) => {
        const s = r.summary
        const best = r.id === plan.recommended_route_id
        const delta = s.duration_s - fastest
        return (
          <button
            key={r.id}
            type="button"
            role="radio"
            aria-checked={selectedId === r.id}
            className={`route-card ${selectedId === r.id ? 'is-selected' : ''} ${best ? 'is-best' : ''}`}
            onClick={() => onSelect(r.id)}
          >
            <div className="route-card__head">
              <span className="route-card__letter" aria-hidden>
                {r.name.slice(-1)}
              </span>
              <span className="route-card__name">{r.name}</span>
              {best ? <span className="badge badge--best">Recommended</span> : <span className="badge">#{r.rank}</span>}
              <span className="route-card__time mono">{fmtDuration(s.duration_s)}</span>
            </div>
            <div className="route-card__sub mono">
              {fmtMiles(s.distance_mi)} · arrive {fmtDayTime(r.arrival, plan.request.timezone)}
              {delta > 60 ? <span className="route-card__delta"> +{fmtDuration(delta)}</span> : null}
            </div>
            <RiskBar r={r} />
            <dl className="route-card__stats">
              <div className={s.no_travel_mi > 0 ? 'is-alert' : ''}>
                <dt>No Travel</dt>
                <dd className="mono">{s.no_travel_mi.toFixed(0)} mi</dd>
              </div>
              <div className={s.severe_mi > 0 ? 'is-alert' : ''}>
                <dt>Severe</dt>
                <dd className="mono">{s.severe_mi.toFixed(0)} mi</dd>
              </div>
              <div>
                <dt>High</dt>
                <dd className="mono">{s.high_mi.toFixed(0)} mi</dd>
              </div>
              <div>
                <dt>Avg risk</dt>
                <dd className="mono">{s.avg_risk.toFixed(2)}</dd>
              </div>
            </dl>
            <p className="route-card__verdict">{r.verdict.replace(/^Recommended: /, '')}</p>
          </button>
        )
      })}
    </div>
  )
}
