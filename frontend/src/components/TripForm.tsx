import { useState } from 'react'
import PlaceInput from './PlaceInput'
import type { Place, PlanInput } from '../types'
import { loadRuleHint } from '../lib/risk'

interface Props {
  busy: boolean
  fieldErrors?: Record<string, string[]>
  onSubmit: (input: PlanInput) => void
}

const SAMPLE = {
  origin: { label: 'Dallas, Texas, US', lat: 32.7763, lon: -96.7969 },
  destination: { label: 'Denver, Colorado, US', lat: 39.7392, lon: -104.9849 },
}
const LOAD_PRESETS = [20000, 35000, 42000, 80000]
const INTERVALS = [10, 25, 50] as const

export default function TripForm({ busy, fieldErrors, onSubmit }: Props) {
  const [origin, setOrigin] = useState<Place | null>(null)
  const [destination, setDestination] = useState<Place | null>(null)
  const [mode, setMode] = useState<'now' | 'later'>('now')
  const [when, setWhen] = useState('')
  const [load, setLoad] = useState('42000')
  const [interval, setIntervalMi] = useState<10 | 25 | 50>(25)
  const [touched, setTouched] = useState(false)

  const loadNum = Number(load)
  const loadError = load === '' || Number.isNaN(loadNum) || loadNum < 0 || loadNum > 80000 ? 'Enter a load between 0 and 80,000 lb.' : undefined
  const whenError = mode === 'later' && !when ? 'Pick a departure time.' : undefined
  const sameError = origin && destination && origin.lat === destination.lat && origin.lon === destination.lon ? 'Destination must differ from origin.' : undefined

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!origin || !destination || loadError || whenError || sameError) return
    onSubmit({
      origin,
      destination,
      departure_local: mode === 'later' ? when : null,
      load_lb: loadNum,
      interval_mi: interval,
    })
  }

  const fe = (k: string) => fieldErrors?.[k]?.[0]

  return (
    <form className="trip" onSubmit={submit} noValidate aria-label="Trip details">
      <div className="trip__places">
        <PlaceInput
          label="Origin"
          marker="A"
          value={origin}
          onChange={setOrigin}
          placeholder="City, address or ZIP"
          error={touched && !origin ? 'Choose an origin from the list.' : fe('origin')}
        />
        <button
          type="button"
          className="icon-btn trip__swap"
          aria-label="Swap origin and destination"
          title="Swap"
          onClick={() => {
            setOrigin(destination)
            setDestination(origin)
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
            <path d="M5 2v10M5 12l-2.5-2.5M5 12l2.5-2.5M11 14V4M11 4L8.5 6.5M11 4l2.5 2.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          </svg>
        </button>
        <PlaceInput
          label="Destination"
          marker="B"
          value={destination}
          onChange={setDestination}
          placeholder="City, address or ZIP"
          error={touched && !destination ? 'Choose a destination from the list.' : sameError ?? fe('destination')}
        />
      </div>

      <fieldset className="field">
        <legend className="field__label">Departure</legend>
        <div className="segmented" role="radiogroup" aria-label="Departure">
          {(['now', 'later'] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} className={`segmented__opt ${mode === m ? 'is-on' : ''}`} onClick={() => setMode(m)}>
              {m === 'now' ? 'Leave now' : 'Schedule'}
            </button>
          ))}
        </div>
        {mode === 'later' && (
          <>
            <input
              type="datetime-local"
              className="input mono"
              aria-label="Departure date and time"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              aria-invalid={!!(touched && whenError)}
            />
            <p className="field__hint">Local time at the origin. Up to 7 days ahead.</p>
          </>
        )}
        {((touched && whenError) || fe('departure_local')) && <p className="field__hint field__hint--error">{whenError ?? fe('departure_local')}</p>}
      </fieldset>

      <div className="field">
        <label className="field__label" htmlFor="load">
          Load weight
        </label>
        <div className="input-affix">
          <input
            id="load"
            className="input mono"
            inputMode="numeric"
            value={load}
            onChange={(e) => setLoad(e.target.value.replace(/[^\d]/g, ''))}
            aria-invalid={!!(touched && loadError)}
            aria-describedby="load-hint"
          />
          <span className="input-affix__unit">lb</span>
        </div>
        <div className="chips" aria-label="Load presets">
          {LOAD_PRESETS.map((p) => (
            <button key={p} type="button" className={`chip ${loadNum === p ? 'is-on' : ''}`} onClick={() => setLoad(String(p))}>
              {(p / 1000).toFixed(0)}k
            </button>
          ))}
        </div>
        <p id="load-hint" className={`field__hint ${touched && loadError ? 'field__hint--error' : ''}`}>
          {touched && loadError ? loadError : loadRuleHint(loadNum || 0)}
        </p>
      </div>

      <fieldset className="field">
        <legend className="field__label">Weather sampling</legend>
        <div className="segmented" role="radiogroup" aria-label="Sampling interval">
          {INTERVALS.map((i) => (
            <button key={i} type="button" role="radio" aria-checked={interval === i} className={`segmented__opt ${interval === i ? 'is-on' : ''}`} onClick={() => setIntervalMi(i)}>
              Every {i} mi
            </button>
          ))}
        </div>
      </fieldset>

      <div className="trip__actions">
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? <span className="spinner spinner--dark" aria-hidden /> : null}
          {busy ? 'Planning…' : 'Compare routes'}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={busy}
          onClick={() => {
            setOrigin(SAMPLE.origin)
            setDestination(SAMPLE.destination)
            setLoad('42000')
            setMode('now')
            setTouched(false)
          }}
        >
          Sample trip
        </button>
      </div>
    </form>
  )
}
