import { useEffect, useId, useRef, useState } from 'react'
import { searchPlaces } from '../api'
import type { Place, PlaceSuggestion } from '../types'

interface Props {
  label: string
  marker: 'A' | 'B'
  value: Place | null
  onChange: (p: Place | null) => void
  placeholder: string
  error?: string
}

/** Accessible combobox: debounced search, arrow keys, Enter, Escape. */
export default function PlaceInput({ label, marker, value, onChange, placeholder, error }: Props) {
  const id = useId()
  const listId = `${id}-list`
  const [text, setText] = useState(value?.label ?? '')
  const [items, setItems] = useState<PlaceSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [status, setStatus] = useState<'idle' | 'loading' | 'empty' | 'error'>('idle')
  const lastPicked = useRef(value?.label ?? '')

  useEffect(() => {
    setText(value?.label ?? '')
    lastPicked.current = value?.label ?? ''
  }, [value])

  useEffect(() => {
    const q = text.trim()
    if (q.length < 2 || q === lastPicked.current) {
      setItems([])
      setStatus('idle')
      return
    }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      setStatus('loading')
      try {
        const r = await searchPlaces(q, ctrl.signal)
        setItems(r)
        setActive(r.length ? 0 : -1)
        setStatus(r.length ? 'idle' : 'empty')
        setOpen(true)
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setStatus('error')
      }
    }, 260)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [text])

  const pick = (p: PlaceSuggestion) => {
    lastPicked.current = p.label
    setText(p.label)
    setOpen(false)
    setItems([])
    onChange({ label: p.label, lat: p.lat, lon: p.lon })
  }

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || !items.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (a + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (a - 1 + items.length) % items.length)
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault()
      pick(items[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className={`field place ${error ? 'field--error' : ''}`}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="place__control">
        <span className={`place__marker place__marker--${marker === 'A' ? 'origin' : 'dest'}`} aria-hidden>
          {marker}
        </span>
        <input
          id={id}
          className="input place__input"
          role="combobox"
          aria-expanded={open && (items.length > 0 || status === 'empty')}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          aria-invalid={!!error}
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            if (value && e.target.value !== value.label) onChange(null)
          }}
          onKeyDown={onKey}
          onFocus={() => items.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
        />
        {status === 'loading' && <span className="spinner place__spinner" aria-label="Searching" />}
      </div>
      {open && (items.length > 0 || status === 'empty') && (
        <ul className="place__list" id={listId} role="listbox">
          {items.map((it, i) => (
            <li
              key={`${it.label}-${i}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`place__option ${i === active ? 'is-active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(it)
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span>{it.label}</span>
              {it.kind && <small>{it.kind}</small>}
            </li>
          ))}
          {status === 'empty' && <li className="place__empty">No places match “{text}”.</li>}
        </ul>
      )}
      {status === 'error' && <p className="field__hint field__hint--error">Place search is unavailable right now.</p>}
      {error && <p className="field__hint field__hint--error">{error}</p>}
    </div>
  )
}
