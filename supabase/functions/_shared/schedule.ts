/** Minimal Karachi schedule helpers without date-fns (Deno Edge) */

export const TIMEZONE = 'Asia/Karachi'

export type ScheduleSlot = { day: number; hour: number; minute: number }

export function isoWeekKeyUtcMonday(d = new Date()): string {
  // Approximate ISO week using UTC Monday boundary aligned with Karachi Monday 00:00 ≈ Sunday 19:00 UTC previous
  // Prefer computing via Intl parts in Karachi.
  const parts = karachiParts(d)
  const asLocal = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  const day = asLocal.getUTCDay() || 7
  asLocal.setUTCDate(asLocal.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(asLocal.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((asLocal.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${asLocal.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export function karachiParts(date: Date): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  weekday: number
} {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  })
  const map: Record<string, string> = {}
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') map[p.type] = p.value
  }
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    weekday: weekdayMap[map.weekday] ?? 0,
  }
}

/** Convert Karachi wall time to UTC Date via iterative offset resolution */
export function karachiLocalToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  // month is 1-12
  const guess = new Date(Date.UTC(year, month - 1, day, hour - 5, minute, 0)) // PKT is UTC+5 (no DST)
  // Pakistan does not observe DST; UTC+5 is stable.
  return new Date(Date.UTC(year, month - 1, day, hour - 5, minute, 0))
}

export function scheduleWeekUtc(slots: ScheduleSlot[], reference = new Date()): Date[] {
  const parts = karachiParts(reference)
  // Find Monday of current Karachi week
  const weekday = parts.weekday === 0 ? 7 : parts.weekday
  const mondayDay = parts.day - (weekday - 1)
  const monday = new Date(Date.UTC(parts.year, parts.month - 1, mondayDay))
  const monParts = { year: monday.getUTCFullYear(), month: monday.getUTCMonth() + 1, day: monday.getUTCDate() }

  return slots.map((slot) => {
    const offsetFromMonday = slot.day === 0 ? 6 : slot.day - 1
    const d = new Date(Date.UTC(monParts.year, monParts.month - 1, monParts.day + offsetFromMonday))
    return karachiLocalToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), slot.hour, slot.minute)
  })
}
