export type RiskLevel = 0 | 1 | 2 | 3 | 4

export interface Place {
  label: string
  lat: number
  lon: number
}

export interface PlaceSuggestion extends Place {
  kind?: string
}

export interface RiskAssessment {
  level: RiskLevel
  label: string
  wind: RiskLevel
  rain: RiskLevel
  snow: RiskLevel
  load: RiskLevel
  drivers: Array<'wind' | 'rain' | 'snow' | 'load'>
  load_rule: string | null
}

export interface Checkpoint {
  index: number
  mile: number
  lon: number
  lat: number
  eta: string
  elapsed_s: number
  segment_mi: number
  weather: {
    wind_mph: number
    gust_mph: number
    rain_in_hr: number
    snow_in_hr: number
    temp_f: number
    forecast_hour: string
  }
  risk: RiskAssessment
}

export interface RouteSummary {
  distance_mi: number
  duration_s: number
  no_travel_mi: number
  severe_mi: number
  high_mi: number
  moderate_mi: number
  low_mi: number
  avg_risk: number
  max_risk: RiskLevel
}

export interface RouteOption {
  id: string
  name: string
  source: 'osrm' | 'osrm-alternative' | 'via-point'
  geometry: [number, number][]
  arrival: string
  checkpoints: Checkpoint[]
  hourly_position: [number, number][]
  summary: RouteSummary
  rank: number
  verdict: string
}

export interface HeatCell {
  lon: number
  lat: number
  score: number[]
  wind: number[]
  rain: number[]
  snow: number[]
}

export interface Plan {
  request: {
    origin: Place
    destination: Place
    departure: string
    timezone: string
    load_lb: number
    interval_mi: 10 | 25 | 50
  }
  recommended_route_id: string
  recommendation_reason: string
  ranking: string[]
  routes: RouteOption[]
  heatmap: { start: string; hours: number; step_deg: number; cells: HeatCell[] }
  meta: { weather_points: number; timings_ms: Record<string, number>; generated_at: string }
}

export interface PlanInput {
  origin: Place
  destination: Place
  departure_local: string | null
  load_lb: number
  interval_mi: 10 | 25 | 50
}

export type HeatMetric = 'risk' | 'wind' | 'precip'
