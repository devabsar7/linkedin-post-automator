import { describe, expect, it } from 'vitest'
import {
  canClaimForPublish,
  classifyLinkedInFailure,
  nextRetryAt,
  shouldRetry,
} from '../shared/publish'

describe('publish claim / retry / unknown outcome', () => {
  it('only claims SCHEDULED or RETRY_WAIT that are due', () => {
    const now = new Date('2026-03-24T10:00:00Z')
    expect(canClaimForPublish('SCHEDULED', new Date('2026-03-24T09:00:00Z'), now)).toBe(true)
    expect(canClaimForPublish('READY_FOR_REVIEW', new Date('2026-03-24T09:00:00Z'), now)).toBe(false)
    expect(canClaimForPublish('SCHEDULED', new Date('2026-03-24T11:00:00Z'), now)).toBe(false)
  })

  it('classifies auth, transient, permanent, unknown', () => {
    expect(classifyLinkedInFailure(401)).toBe('auth')
    expect(classifyLinkedInFailure(403)).toBe('auth')
    expect(classifyLinkedInFailure(429)).toBe('transient')
    expect(classifyLinkedInFailure(500)).toBe('transient')
    expect(classifyLinkedInFailure(400)).toBe('permanent')
    expect(classifyLinkedInFailure(null)).toBe('unknown')
  })

  it('retries only transient with bound', () => {
    expect(shouldRetry('transient', 1)).toBe(true)
    expect(shouldRetry('transient', 5)).toBe(false)
    expect(shouldRetry('unknown', 1)).toBe(false)
    expect(shouldRetry('auth', 1)).toBe(false)
  })

  it('backoff grows with attempt', () => {
    const a1 = nextRetryAt(1, new Date('2026-01-01T00:00:00Z'), 1000, 100000)
    const a3 = nextRetryAt(3, new Date('2026-01-01T00:00:00Z'), 1000, 100000)
    expect(a3.getTime()).toBeGreaterThan(a1.getTime())
  })
})
