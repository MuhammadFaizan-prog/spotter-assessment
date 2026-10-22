import type { RiskLevel } from '../types'

/**
 * Risk scale built on the Okabe–Ito palette (designed to stay distinguishable
 * for protanopia/deuteranopia/tritanopia). Colour is never the only signal:
 * every badge also carries the label and a glyph.
 */
export const RISK = [
  { level: 0, label: 'Low', short: 'LOW', glyph: '·', color: '#56B4E9', ink: '#06202E' },
  { level: 1, label: 'Moderate', short: 'MOD', glyph: '!', color: '#F0E442', ink: '#2A2700' },
  { level: 2, label: 'High', short: 'HIGH', glyph: '!!', color: '#E69F00', ink: '#2B1C00' },
  { level: 3, label: 'Severe', short: 'SEV', glyph: '▲', color: '#D55E00', ink: '#FFF4EC' },
  { level: 4, label: 'No Travel', short: 'STOP', glyph: '✕', color: '#CC79A7', ink: '#2A0B1C' },
] as const

export const riskOf = (l: RiskLevel | number) => RISK[Math.max(0, Math.min(4, Math.floor(l)))]

export const THRESHOLDS = {
  wind: ['<25 mph', '25–34', '35–44', '45–54', '≥55 mph'],
  rain: ['<0.10 in/h', '0.10–0.25', '0.25–0.50', '0.50–1.00', '>1.00'],
  snow: ['<0.5 in/h', '0.5–1.0', '1.0–2.0', '2.0–3.0', '>3.0'],
}

export function loadRuleHint(load: number): string {
  if (load > 40000) return 'Over 40,000 lb: 35–44 mph wind counts as Severe, 45+ mph is No Travel.'
  if (load > 30000) return 'Over 30,000 lb: 45–54 mph wind counts as No Travel.'
  return 'Load rules apply only above 30,000 lb (wind ≥55 mph is always No Travel).'
}

/** Piecewise-linear 0–4 score between the brief's thresholds (same as the API's
 * `continuous_score`), used to shade wind-only and precipitation-only heatmaps. */
function ramp(value: number, edges: [number, number, number, number]): number {
  const pts = [0, ...edges]
  if (value >= edges[3]) return 4
  for (let i = 0; i < 4; i++) {
    if (value < pts[i + 1]) return i + Math.max(0, (value - pts[i]) / (pts[i + 1] - pts[i])) * 0.999
  }
  return 4
}
export const windScore = (mph: number) => ramp(mph, [25, 35, 45, 55])
export const rainScore = (inch: number) => ramp(inch, [0.1, 0.25, 0.5, 1.000001])
export const snowScore = (inch: number) => ramp(inch, [0.5, 1, 2, 3.000001])
