import { useEffect, useRef, useState } from 'react'
import type { HeatMetric, Plan } from '../types'
import { fmtDayTime, fmtHourTick } from '../lib/format'

interface Props {
  plan: Plan
  hour: number
  onHour: (h: number) => void
  metric: HeatMetric
  onMetric: (m: HeatMetric) => void
  showHeatmap: boolean
  onToggleHeatmap: () => void
}

const METRICS: { id: HeatMetric; label: string }[] = [
  { id: 'risk', label: 'Risk' },
  { id: 'wind', label: 'Wind' },
  { id: 'precip', label: 'Rain/Snow' },
]

export default function TimeDock({ plan, hour, onHour, metric, onMetric, showHeatmap, onToggleHeatmap }: Props) {
  const [playing, setPlaying] = useState(false)
  const hourRef = useRef(hour)
  useEffect(() => {
    hourRef.current = hour
  }, [hour])
  const max = plan.heatmap.hours
  const start = new Date(plan.heatmap.start).getTime()
  const at = new Date(start + hour * 3600_000)
  const tz = plan.request.timezone

  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => {
      const next = hourRef.current + 1
      if (next > max) {
        setPlaying(false)
        return
      }
      onHour(next)
    }, 420)
    return () => window.clearInterval(id)
  }, [playing, max, onHour])

  const ticks = Array.from({ length: max / 6 + 1 }, (_, i) => i * 6)

  return (
    <div className="dock" role="group" aria-label="Forecast time">
      <div className="dock__top">
        <button
          type="button"
          className="icon-btn icon-btn--solid"
          aria-label={playing ? 'Pause forecast animation' : 'Play forecast animation'}
          onClick={() => {
            if (!playing && hour >= max) onHour(0)
            setPlaying((p) => !p)
          }}
        >
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><rect x="3" y="2" width="3" height="10" rx="1" fill="currentColor" /><rect x="8" y="2" width="3" height="10" rx="1" fill="currentColor" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M4 2.5v9l7.5-4.5z" fill="currentColor" /></svg>
          )}
        </button>
        <div className="dock__when">
          <span className="dock__time mono">{fmtDayTime(at, tz)}</span>
          <span className="dock__offset mono">T+{hour}h from departure hour</span>
        </div>
        <div className="dock__controls">
          <div className="segmented segmented--sm" role="radiogroup" aria-label="Heatmap layer">
            {METRICS.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={metric === m.id} className={`segmented__opt ${metric === m.id ? 'is-on' : ''}`} onClick={() => onMetric(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
          <label className="switch">
            <input type="checkbox" checked={showHeatmap} onChange={onToggleHeatmap} />
            <span className="switch__track" aria-hidden />
            <span className="switch__label">Heatmap</span>
          </label>
        </div>
      </div>
      <div className="dock__slider">
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={hour}
          onChange={(e) => {
            setPlaying(false)
            onHour(Number(e.target.value))
          }}
          aria-label="Forecast hour"
          aria-valuetext={`${fmtDayTime(at, tz)}, ${hour} hours ahead`}
          style={{ ['--pct' as string]: `${(hour / max) * 100}%` }}
        />
        <div className="dock__ticks" aria-hidden>
          {ticks.map((t) => (
            <span key={t} style={{ left: `${(t / max) * 100}%` }}>
              {t === 0 ? 'Depart' : fmtHourTick(new Date(start + t * 3600_000), tz)}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
