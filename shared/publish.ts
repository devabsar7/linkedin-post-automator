/** Publish retry classification and backoff */

export type FailureClass = 'transient' | 'auth' | 'permanent' | 'unknown'

export function classifyLinkedInFailure(status: number | null, bodySnippet?: string): FailureClass {
  if (status === null) return 'unknown'
  if (status === 401 || status === 403) return 'auth'
  if (status === 429 || status >= 500) return 'transient'
  if (status >= 400 && status < 500) return 'permanent'
  if (bodySnippet && /timeout|network|ECONNRESET/i.test(bodySnippet)) return 'transient'
  return 'unknown'
}

export function nextRetryAt(
  attemptNumber: number,
  now = new Date(),
  baseMs = 60_000,
  maxMs = 60 * 60_000,
): Date {
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, attemptNumber - 1))
  const jitter = Math.floor(Math.random() * Math.min(5_000, exp * 0.2))
  return new Date(now.getTime() + exp + jitter)
}

export function shouldRetry(failure: FailureClass, attemptNumber: number, maxAttempts = 5): boolean {
  if (failure !== 'transient') return false
  return attemptNumber < maxAttempts
}

export type ClaimResult = 'claimed' | 'busy' | 'not_due' | 'wrong_status'

/**
 * Pure helper documenting claim transition rules (DB does the real lock).
 */
export function canClaimForPublish(status: string, scheduledAt: Date, now: Date): boolean {
  if (status === 'SCHEDULED' || status === 'RETRY_WAIT') {
    return scheduledAt.getTime() <= now.getTime()
  }
  return false
}
