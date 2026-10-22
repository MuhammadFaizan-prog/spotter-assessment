import type { Plan } from '../types'
import { riskOf } from '../lib/risk'
import { fmtDay, fmtTime } from '../lib/format'

interface Props {
  plan: Plan
  routeId: string
  activeIndex: number | null
  onFocus: (routeId: string, index: number) => void
}

export default function CheckpointTimeline({ plan, routeId, activeIndex, onFocus }: Props) {
  const route = plan.routes.find((r) => r.id === routeId)
  if (!route) return null
  const tz = plan.request.timezone
  const days = route.checkpoints.map((c) => fmtDay(c.eta, tz))
  return (
    <section className="timeline" aria-label={`${route.name} checkpoints`}>
      <header className="section-head">
        <h2>{route.name} checkpoints</h2>
        <span className="section-head__meta mono">
          {route.checkpoints.length} stops · every {plan.request.interval_mi} mi
        </span>
      </header>
      <ol className="timeline__list">
        {route.checkpoints.map((c, i) => {
          const risk = riskOf(c.risk.level)
          const day = days[i]
          const showDay = i === 0 || day !== days[i - 1]
          const last = i === route.checkpoints.length - 1
          return (
            <li key={c.index}>
              {showDay && <div className="timeline__day">{day}</div>}
              <button
                type="button"
                className={`tl-row ${activeIndex === c.index ? 'is-active' : ''}`}
                style={{ ['--risk' as string]: risk.color }}
                onClick={() => onFocus(route.id, c.index)}
                aria-label={`Mile ${Math.round(c.mile)}, ETA ${fmtTime(c.eta, tz)}, ${risk.label} risk`}
              >
                <span className="tl-row__time mono">{fmtTime(c.eta, tz)}</span>
                <span className="tl-row__rail" aria-hidden>
                  <span className={`tl-row__dot ${c.risk.level >= 3 ? 'is-big' : ''}`} />
                </span>
                <span className="tl-row__main">
                  <span className="tl-row__mile mono">{i === 0 ? 'Depart' : last ? 'Arrive' : `Mile ${Math.round(c.mile)}`}</span>
                  <span className="tl-row__wx mono">
                    {c.weather.wind_mph.toFixed(0)} mph · {c.weather.rain_in_hr.toFixed(2)}″ rain · {c.weather.snow_in_hr.toFixed(2)}″ snow
                  </span>
                  {c.risk.load_rule && <span className="tl-row__rule">{c.risk.load_rule}</span>}
                </span>
                <span className="risk-chip" style={{ ['--chip' as string]: risk.color, ['--chip-ink' as string]: risk.ink }}>
                  {risk.label}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
