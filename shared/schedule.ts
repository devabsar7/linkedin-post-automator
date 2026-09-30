/**
 * Asia/Karachi schedule helpers. Store UTC in DB; compute due times in Karachi.
 */
import { fromZonedTime, toZonedTime } from 'date-fns-tz'
import { addDays, setHours, setMinutes, setSeconds, setMilliseconds, startOfWeek } from 'date-fns'
import { TIMEZONE, type DEFAULT_SCHEDULE_KARACHI } from './constants'

export type ScheduleSlot = {
  day: number // 0=Sun .. 6=Sat (JS getDay)
  hour: number
  minute: number
}

export function getKarachiParts(date: Date = new Date()): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  weekday: number
} {
  const z = toZonedTime(date, TIMEZONE)
  return {
    year: z.getFullYear(),
    month: z.getMonth(),
    day: z.getDate(),
    hour: z.getHours(),
    minute: z.getMinutes(),
    weekday: z.getDay(),
  }
}

/** ISO week key in Karachi (YYYY-Www) for Monday-based weeks. */
export function isoWeekKeyKarachi(date: Date = new Date()): string {
  const z = toZonedTime(date, TIMEZONE)
  // Use Monday as start
  const monday = startOfWeek(z, { weekStartsOn: 1 })
  const year = monday.getFullYear()
  const oneJan = new Date(year, 0, 1)
  const dayOfYear = Math.floor((monday.getTime() - oneJan.getTime()) / 86400000) + 1
  const week = Math.ceil((dayOfYear + ((oneJan.getDay() + 6) % 7)) / 7)
  return `${year}-W${String(week).padStart(2, '0')}`
}

/** Build UTC Date for a Karachi local wall time on a given calendar day in Karachi week. */
export function karachiLocalToUtc(
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const local = new Date(year, monthIndex, day, hour, minute, 0, 0)
  return fromZonedTime(local, TIMEZONE)
}

/**
 * Given a reference date and 7 schedule slots, return UTC timestamps for the
 * current Karachi week (Mon–Sun) matching each slot's weekday.
 */
export function scheduleWeekUtc(
  slots: readonly ScheduleSlot[],
  reference: Date = new Date(),
): Date[] {
  const z = toZonedTime(reference, TIMEZONE)
  const monday = startOfWeek(z, { weekStartsOn: 1 })
  return slots.map((slot) => {
    // Convert JS day to offset from Monday
    const offsetFromMonday = slot.day === 0 ? 6 : slot.day - 1
    const dayLocal = addDays(monday, offsetFromMonday)
    const t = setMilliseconds(setSeconds(setMinutes(setHours(dayLocal, slot.hour), slot.minute), 0), 0)
    return fromZonedTime(t, TIMEZONE)
  })
}

export function isDueInKarachi(scheduledAtUtc: Date, now: Date = new Date()): boolean {
  return scheduledAtUtc.getTime() <= now.getTime()
}

export type DefaultSlot = (typeof DEFAULT_SCHEDULE_KARACHI)[number]
