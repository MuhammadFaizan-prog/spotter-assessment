import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map as MLMap, ExpressionSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type * as GeoJSON from 'geojson'
// MapLibre 6 resolves its worker as a sibling file of its own module, which a
// bundler does not emit. Bundle the worker explicitly and hand MapLibre its URL.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { Checkpoint, HeatMetric, Plan } from '../types'
import { RISK, rainScore, riskOf, snowScore, windScore } from '../lib/risk'
import { cumulativeMiles, sliceLine } from '../lib/geo'
import { fmtDayTime } from '../lib/format'

maplibregl.setWorkerUrl(workerUrl)

const STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
const US_CENTER: [number, number] = [-98.5, 39.3]
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
const METRIC_PREFIX: Record<HeatMetric, string> = { risk: 'r', wind: 'w', precip: 'p' }

interface Props {
  plan: Plan | null
  selectedId: string | null
  hour: number
  metric: HeatMetric
  showHeatmap: boolean
  focus: { routeId: string; index: number; nonce: number } | null
  onSelectRoute: (id: string) => void
  onFocusCheckpoint: (routeId: string, index: number) => void
}

const riskColorExpr: ExpressionSpecification = [
  'match',
  ['get', 'level'],
  0, RISK[0].color,
  1, RISK[1].color,
  2, RISK[2].color,
  3, RISK[3].color,
  RISK[4].color,
]

function heatFeatures(plan: Plan): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: plan.heatmap.cells.map((c) => {
      const props: Record<string, number> = {}
      for (let h = 0; h <= plan.heatmap.hours; h++) {
        // Normalised 0–1 on the risk scale; a faint floor keeps calm areas readable.
        props[`r${h}`] = Math.max(0.035, c.score[h] / 4)
        props[`w${h}`] = Math.max(0.035, windScore(c.wind[h]) / 4)
        props[`p${h}`] = Math.max(0.0, Math.max(rainScore(c.rain[h]), snowScore(c.snow[h])) / 4)
      }
      return { type: 'Feature', geometry: { type: 'Point', coordinates: [c.lon, c.lat] }, properties: props }
    }),
  }
}

function routeFeatures(plan: Plan): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: plan.routes.map((r) => ({
      type: 'Feature',
      id: r.rank,
      geometry: { type: 'LineString', coordinates: r.geometry },
      properties: { id: r.id, recommended: r.id === plan.recommended_route_id },
    })),
  }
}

function riskSegments(plan: Plan, routeId: string | null): GeoJSON.FeatureCollection {
  const r = plan.routes.find((x) => x.id === routeId)
  if (!r) return EMPTY
  const cum = cumulativeMiles(r.geometry)
  const scale = cum[cum.length - 1] / (r.summary.distance_mi || 1)
  const cps = r.checkpoints
  const features: GeoJSON.Feature[] = cps.map((c, i) => {
    const from = i === 0 ? 0 : (cps[i - 1].mile + c.mile) / 2
    const to = i === cps.length - 1 ? r.summary.distance_mi : (c.mile + cps[i + 1].mile) / 2
    return {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: sliceLine(r.geometry, cum, from * scale, to * scale) },
      properties: { level: c.risk.level },
    }
  })
  return { type: 'FeatureCollection', features }
}

function checkpointFeatures(plan: Plan): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: plan.routes.flatMap((r) =>
      r.checkpoints.map((c) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [c.lon, c.lat] },
        properties: { route: r.id, index: c.index, level: c.risk.level },
      })),
    ),
  }
}

function truckFeatures(plan: Plan, hour: number): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: plan.routes.map((r) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: r.hourly_position[Math.min(hour, r.hourly_position.length - 1)] },
      properties: { route: r.id, letter: r.name.slice(-1) },
    })),
  }
}

function popupHtml(plan: Plan, routeName: string, c: Checkpoint): string {
  const risk = riskOf(c.risk.level)
  const w = c.weather
  const drivers = c.risk.drivers.length ? c.risk.drivers.join(' + ') : 'all factors low'
  return `
    <div class="pop">
      <div class="pop__head">
        <span class="pop__route">${routeName} · mile ${Math.round(c.mile)}</span>
        <span class="risk-chip" style="--chip:${risk.color};--chip-ink:${risk.ink}">${risk.label}</span>
      </div>
      <div class="pop__eta">ETA ${fmtDayTime(c.eta, plan.request.timezone)}</div>
      <dl class="pop__grid">
        <dt>Wind</dt><dd>${w.wind_mph.toFixed(0)} mph <small>gust ${w.gust_mph.toFixed(0)}</small></dd>
        <dt>Rain</dt><dd>${w.rain_in_hr.toFixed(2)} in/h</dd>
        <dt>Snow</dt><dd>${w.snow_in_hr.toFixed(2)} in/h</dd>
        <dt>Temp</dt><dd>${w.temp_f.toFixed(0)}°F</dd>
      </dl>
      <div class="pop__why">Driven by ${drivers}${c.risk.load_rule ? `<br/><strong>${c.risk.load_rule}</strong>` : ''}</div>
    </div>`
}

/** Keep routes clear of the floating legend (top-left) and time dock (bottom). */
function overlayPadding(el: HTMLElement) {
  const narrow = window.innerWidth < 900
  const pad = narrow ? { top: 40, bottom: 40, left: 30, right: 30 } : { top: 60, bottom: 60, left: 60, right: 70 }
  const box = el.getBoundingClientRect()
  const stage = el.closest('.stage') ?? document
  const legend = stage.querySelector<HTMLElement>('.legend[open]')?.getBoundingClientRect()
  const dock = stage.querySelector<HTMLElement>('.dock')?.getBoundingClientRect()
  if (dock && dock.height) pad.bottom += Math.max(0, box.bottom - dock.top)
  // A tall top-left legend steals width, not height: shift the fit right of it.
  if (legend && legend.width && box.right - legend.right > box.width * 0.45) pad.left = Math.max(pad.left, legend.right - box.left + 24)
  // Never let padding exceed the canvas (fitBounds would no-op).
  pad.left = Math.min(pad.left, box.width * 0.5)
  pad.bottom = Math.min(pad.bottom, box.height * 0.55)
  return pad
}

export default function MapView({ plan, selectedId, hour, metric, showHeatmap, focus, onSelectRoute, onFocusCheckpoint }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const popupRef = useRef<maplibregl.Popup | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const planRef = useRef<Plan | null>(plan)
  const handlers = useRef({ onSelectRoute, onFocusCheckpoint })
  const [ready, setReady] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  useEffect(() => {
    planRef.current = plan
    handlers.current = { onSelectRoute, onFocusCheckpoint }
  })

  // ---- init once
  useEffect(() => {
    if (!container.current) return
    let map: MLMap
    try {
      map = new maplibregl.Map({
        container: container.current,
        style: STYLE_URL,
        center: US_CENTER,
        zoom: window.innerWidth < 900 ? 2.5 : 3.6,
        attributionControl: false,
        fadeDuration: 0,
      })
    } catch (err) {
      // e.g. WebGL disabled: keep the planner usable without the map.
      console.error('Map failed to initialise', err)
      setMapError('This browser could not start the WebGL map.')
      return
    }
    mapRef.current = map
    ;(window as unknown as { __spotterMap?: MLMap }).__spotterMap = map // debugging/e2e hook
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    // Top-right keeps the credit clear of the bottom time dock.
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-right')
    map.on('error', (e) => {
      if (!map.isStyleLoaded() && String(e.error?.message ?? '').includes('style')) setMapError('Map tiles failed to load.')
    })
    map.on('load', () => {
      // Start the compact credit collapsed (the (i) button expands it).
      map.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
      const firstSymbol = map.getStyle().layers?.find((l) => l.type === 'symbol')?.id
      map.addSource('heat', { type: 'geojson', data: EMPTY })
      map.addSource('routes', { type: 'geojson', data: EMPTY })
      map.addSource('segments', { type: 'geojson', data: EMPTY })
      map.addSource('checkpoints', { type: 'geojson', data: EMPTY })
      map.addSource('trucks', { type: 'geojson', data: EMPTY })

      map.addLayer(
        {
          id: 'heat',
          type: 'heatmap',
          source: 'heat',
          paint: {
            'heatmap-weight': ['get', 'r0'],
            'heatmap-intensity': 1.15,
            'heatmap-radius': 30,
            'heatmap-opacity': 0.72,
            'heatmap-color': [
              'interpolate', ['linear'], ['heatmap-density'],
              0, 'rgba(86,180,233,0)',
              0.03, 'rgba(86,180,233,0.18)',
              0.2, 'rgba(86,180,233,0.55)',
              0.25, RISK[1].color,
              0.5, RISK[2].color,
              0.75, RISK[3].color,
              0.97, RISK[4].color,
            ],
          },
        },
        firstSymbol,
      )
      map.addLayer({
        id: 'route-casing',
        type: 'line',
        source: 'routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#05080C', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 6, 9, 11], 'line-opacity': 0.85 },
      })
      map.addLayer({
        id: 'route-base',
        type: 'line',
        source: 'routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['case', ['boolean', ['feature-state', 'hover'], false], '#C9D3DF', '#7F8C9D'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 4, 2.5, 9, 5],
          'line-dasharray': [1.6, 1.2],
        },
      })
      map.addLayer({
        id: 'segment-casing',
        type: 'line',
        source: 'segments',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#F4F7FA', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 7.5, 9, 13] },
      })
      map.addLayer({
        id: 'segments',
        type: 'line',
        source: 'segments',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': riskColorExpr, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 4.5, 9, 9] },
      })
      map.addLayer({
        id: 'route-hit',
        type: 'line',
        source: 'routes',
        paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 18 },
      })
      map.addLayer({
        id: 'checkpoints',
        type: 'circle',
        source: 'checkpoints',
        paint: {
          'circle-color': riskColorExpr,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, ['case', ['>=', ['get', 'level'], 3], 5.5, 4], 9, ['case', ['>=', ['get', 'level'], 3], 9, 7]],
          'circle-stroke-color': '#0B0F14',
          'circle-stroke-width': 2,
          'circle-opacity': 1,
          'circle-stroke-opacity': 1,
        },
      })
      map.addLayer({
        id: 'trucks-halo',
        type: 'circle',
        source: 'trucks',
        paint: { 'circle-radius': 13, 'circle-color': '#F4F7FA', 'circle-opacity': 0.16 },
      })
      map.addLayer({
        id: 'trucks',
        type: 'circle',
        source: 'trucks',
        paint: { 'circle-radius': 7, 'circle-color': '#F4F7FA', 'circle-stroke-color': '#0B0F14', 'circle-stroke-width': 3 },
      })

      let hovered: number | string | undefined
      map.on('mousemove', 'route-hit', (e) => {
        map.getCanvas().style.cursor = 'pointer'
        const f = e.features?.[0]
        if (f && f.id !== hovered) {
          if (hovered !== undefined) map.setFeatureState({ source: 'routes', id: hovered }, { hover: false })
          hovered = f.id
          if (hovered !== undefined) map.setFeatureState({ source: 'routes', id: hovered }, { hover: true })
        }
      })
      map.on('mouseleave', 'route-hit', () => {
        map.getCanvas().style.cursor = ''
        if (hovered !== undefined) map.setFeatureState({ source: 'routes', id: hovered }, { hover: false })
        hovered = undefined
      })
      map.on('click', 'route-hit', (e) => {
        const hitCp = map.queryRenderedFeatures(e.point, { layers: ['checkpoints'] })
        if (hitCp.length) return
        const id = e.features?.[0]?.properties?.id
        if (id) handlers.current.onSelectRoute(String(id))
      })
      map.on('mouseenter', 'checkpoints', () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', 'checkpoints', () => (map.getCanvas().style.cursor = ''))
      map.on('click', 'checkpoints', (e) => {
        const p = e.features?.[0]?.properties
        if (p) handlers.current.onFocusCheckpoint(String(p.route), Number(p.index))
      })
      setReady(true)
    })
    return () => {
      map.remove()
      mapRef.current = null
      setReady(false)
    }
  }, [])

  // ---- plan data
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    popupRef.current?.remove()
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []
    const set = (id: string, data: GeoJSON.FeatureCollection) => (map.getSource(id) as GeoJSONSource).setData(data)
    if (!plan) {
      ;['heat', 'routes', 'segments', 'checkpoints', 'trucks'].forEach((s) => set(s, EMPTY))
      return
    }
    set('heat', heatFeatures(plan))
    set('routes', routeFeatures(plan))
    set('checkpoints', checkpointFeatures(plan))

    for (const [place, kind] of [
      [plan.request.origin, 'origin'],
      [plan.request.destination, 'destination'],
    ] as const) {
      const el = document.createElement('div')
      el.className = `pin pin--${kind}`
      el.setAttribute('aria-label', `${kind}: ${place.label}`)
      el.innerHTML = `<span>${kind === 'origin' ? 'A' : 'B'}</span>`
      markersRef.current.push(new maplibregl.Marker({ element: el }).setLngLat([place.lon, place.lat]).addTo(map))
    }
    const b = new maplibregl.LngLatBounds()
    plan.routes.forEach((r) => r.geometry.forEach((c) => b.extend(c)))
    map.fitBounds(b, { padding: overlayPadding(map.getContainer()), duration: 900 })
  }, [plan, ready])

  // ---- heatmap radius tracks the grid step so the field reads as continuous
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !plan) return
    const pxPerDegZ0 = 512 / 360
    const r0 = plan.heatmap.step_deg * pxPerDegZ0 * 1.25
    map.setPaintProperty('heat', 'heatmap-radius', [
      'interpolate', ['exponential', 2], ['zoom'],
      0, r0,
      9, r0 * 512,
    ])
  }, [plan, ready])

  // ---- selection
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !plan) return
    ;(map.getSource('segments') as GeoJSONSource).setData(riskSegments(plan, selectedId))
    const sel = selectedId ?? ''
    map.setFilter('route-base', ['!=', ['get', 'id'], sel])
    map.setFilter('route-casing', ['!=', ['get', 'id'], sel])
    map.setPaintProperty('checkpoints', 'circle-opacity', ['case', ['==', ['get', 'route'], sel], 1, 0.35])
    map.setPaintProperty('checkpoints', 'circle-stroke-opacity', ['case', ['==', ['get', 'route'], sel], 1, 0.2])
    map.setPaintProperty('trucks', 'circle-color', ['case', ['==', ['get', 'route'], sel], '#F4F7FA', '#7F8C9D'])
    map.setPaintProperty('trucks-halo', 'circle-opacity', ['case', ['==', ['get', 'route'], sel], 0.2, 0])
  }, [plan, selectedId, ready])

  // ---- slider: only a paint property + a 3-point source change per tick
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !plan) return
    const id = requestAnimationFrame(() => {
      map.setPaintProperty('heat', 'heatmap-weight', ['get', `${METRIC_PREFIX[metric]}${hour}`])
      ;(map.getSource('trucks') as GeoJSONSource).setData(truckFeatures(plan, hour))
    })
    return () => cancelAnimationFrame(id)
  }, [plan, hour, metric, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    map.setLayoutProperty('heat', 'visibility', showHeatmap ? 'visible' : 'none')
  }, [showHeatmap, ready])

  // ---- focus a checkpoint (from the timeline or a map click)
  useEffect(() => {
    const map = mapRef.current
    const p = planRef.current
    if (!map || !ready || !p || !focus) return
    const r = p.routes.find((x) => x.id === focus.routeId)
    const c = r?.checkpoints[focus.index]
    if (!r || !c) return
    popupRef.current?.remove()
    // On a short (mobile) map, pin the checkpoint just above the dock and open the popup upwards.
    const narrow = window.innerWidth < 900
    popupRef.current = new maplibregl.Popup({ closeButton: true, maxWidth: '280px', offset: 12, className: 'risk-popup', ...(narrow ? { anchor: 'bottom' as const } : {}) })
      .setLngLat([c.lon, c.lat])
      .setHTML(popupHtml(p, r.name, c))
      .addTo(map)
    const pad = overlayPadding(map.getContainer())
    // Centre the checkpoint in the area left visible by the legend and time dock.
    const h = map.getContainer().clientHeight
    const offsetY = narrow ? h / 2 - pad.bottom + 28 : (pad.top - pad.bottom) / 2
    map.easeTo({ center: [c.lon, c.lat], zoom: Math.max(map.getZoom(), 6.2), duration: 600, offset: [(pad.left - pad.right) / 2, offsetY] })
  }, [focus, ready])

  return (
    <div className="map" aria-label="Route and weather map" role="region">
      <div ref={container} className="map__canvas" />
      {mapError && <div className="map__error" role="alert">{mapError} Route data is still available in the panel.</div>}
    </div>
  )
}
