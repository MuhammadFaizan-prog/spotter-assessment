export function fmtDuration(seconds: number): string {
  const m = Math.round(seconds / 60)
  const h = Math.floor(m / 60)
  const mm = m % 60
  return h ? `${h}h ${mm.toString().padStart(2, '0')}m` : `${mm}m`
}

export function fmtMiles(mi: number, digits = 0): string {
  return `${mi.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })} mi`
}

const cache = new Map<string, Intl.DateTimeFormat>()
function dtf(tz: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = tz + JSON.stringify(opts)
  let f = cache.get(key)
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', { ...opts, timeZone: tz })
    } catch {
      f = new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' })
    }
    cache.set(key, f)
  }
  return f
}

export const fmtTime = (iso: string | Date, tz: string) =>
  dtf(tz, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso))

export const fmtDayTime = (iso: string | Date, tz: string) =>
  dtf(tz, { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(iso))

export const fmtDay = (iso: string | Date, tz: string) => dtf(tz, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(iso))

export const fmtHourTick = (iso: string | Date, tz: string) => dtf(tz, { weekday: 'short', hour: 'numeric' }).format(new Date(iso))

export const fmtLoad = (lb: number) => `${lb.toLocaleString('en-US')} lb`

/** Current wall-clock time in a zone, formatted for <input type="datetime-local">. */
export function localInputValue(date: Date, tz: string): string {
  const parts = dtf(tz, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => ((acc[p.type] = p.value), acc), {})
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}
