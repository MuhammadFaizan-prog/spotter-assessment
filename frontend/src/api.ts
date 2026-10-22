import type { Plan, PlanInput, PlaceSuggestion } from './types'

const BASE = import.meta.env.VITE_API_BASE ?? ''

export class ApiError extends Error {
  status: number
  fields?: Record<string, string[]>
  constructor(message: string, status: number, fields?: Record<string, string[]>) {
    super(message)
    this.status = status
    this.fields = fields
  }
}

async function parse<T>(res: Response): Promise<T> {
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const b = (body ?? {}) as Record<string, unknown>
    if (typeof b.error === 'string') throw new ApiError(b.error, res.status)
    if (res.status === 400 && b && typeof b === 'object') {
      const fields = b as Record<string, string[]>
      const first = Object.values(fields).flat()[0]
      throw new ApiError(typeof first === 'string' ? first : 'Please check the trip details.', 400, fields)
    }
    throw new ApiError(`Request failed (${res.status}). Please try again.`, res.status)
  }
  return body as T
}

export async function searchPlaces(q: string, signal?: AbortSignal): Promise<PlaceSuggestion[]> {
  const res = await fetch(`${BASE}/api/geocode?q=${encodeURIComponent(q)}`, { signal })
  const data = await parse<{ results: PlaceSuggestion[] }>(res)
  return data.results
}

export async function planTrip(input: PlanInput, signal?: AbortSignal): Promise<Plan> {
  let res: Response
  try {
    res = await fetch(`${BASE}/api/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal,
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new ApiError('Could not reach the planning server. Check your connection.', 0)
  }
  return parse<Plan>(res)
}
