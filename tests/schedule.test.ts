import { describe, expect, it } from 'vitest'
import { isoWeekKeyKarachi, scheduleWeekUtc, isDueInKarachi } from '../shared/schedule'

describe('Asia/Karachi scheduling', () => {
  it('produces an ISO week key', () => {
    const key = isoWeekKeyKarachi(new Date('2026-03-23T12:00:00Z'))
    expect(key).toMatch(/^\d{4}-W\d{2}$/)
  })

  it('builds seven UTC timestamps for the Karachi week', () => {
    const slots = [
      { day: 1, hour: 9, minute: 0 },
      { day: 2, hour: 9, minute: 0 },
      { day: 3, hour: 9, minute: 0 },
      { day: 4, hour: 9, minute: 0 },
      { day: 5, hour: 9, minute: 0 },
      { day: 6, hour: 10, minute: 0 },
      { day: 0, hour: 10, minute: 0 },
    ]
    const times = scheduleWeekUtc(slots, new Date('2026-03-23T12:00:00Z'))
    expect(times).toHaveLength(7)
    // Monday 09:00 PKT = Monday 04:00 UTC
    expect(times[0].toISOString()).toContain('T04:00:00.000Z')
  })

  it('detects due posts against UTC now', () => {
    const past = new Date(Date.now() - 60_000)
    const future = new Date(Date.now() + 60_000)
    expect(isDueInKarachi(past)).toBe(true)
    expect(isDueInKarachi(future)).toBe(false)
  })
})
