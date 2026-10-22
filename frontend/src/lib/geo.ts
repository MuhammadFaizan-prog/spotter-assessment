const R = 3958.7613
const rad = (d: number) => (d * Math.PI) / 180

export function haversineMi(a: [number, number], b: [number, number]): number {
  const dLat = rad(b[1] - a[1])
  const dLon = rad(b[0] - a[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function cumulativeMiles(coords: [number, number][]): number[] {
  const out = [0]
  for (let i = 1; i < coords.length; i++) out.push(out[i - 1] + haversineMi(coords[i - 1], coords[i]))
  return out
}

function pointAt(coords: [number, number][], cum: number[], mile: number): [number, number] {
  if (mile <= 0) return coords[0]
  const total = cum[cum.length - 1]
  if (mile >= total) return coords[coords.length - 1]
  let lo = 0
  let hi = cum.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (cum[mid] < mile) lo = mid
    else hi = mid
  }
  const t = (mile - cum[lo]) / (cum[hi] - cum[lo] || 1)
  return [coords[lo][0] + (coords[hi][0] - coords[lo][0]) * t, coords[lo][1] + (coords[hi][1] - coords[lo][1]) * t]
}

/** Sub-line between two mileposts. Mileposts are scaled to this polyline's length
 * so the simplified geometry and the server's mileage stay aligned. */
export function sliceLine(coords: [number, number][], cum: number[], fromMi: number, toMi: number): [number, number][] {
  const out: [number, number][] = [pointAt(coords, cum, fromMi)]
  for (let i = 0; i < coords.length; i++) if (cum[i] > fromMi && cum[i] < toMi) out.push(coords[i])
  out.push(pointAt(coords, cum, toMi))
  return out
}
