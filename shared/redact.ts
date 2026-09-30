/** Structured log redaction */

const SENSITIVE_KEYS = [
  'authorization',
  'access_token',
  'refresh_token',
  'client_secret',
  'api_key',
  'bootstrap_secret',
  'cron_secret',
  'ciphertext',
  'iv_b64',
  'password',
  'token',
  'bearer',
]

export function redactValue(key: string, value: unknown): unknown {
  const k = key.toLowerCase()
  if (SENSITIVE_KEYS.some((s) => k.includes(s))) return '[REDACTED]'
  if (typeof value === 'string' && /Bearer\s+\S+/i.test(value)) {
    return value.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
  }
  return value
}

export function redactDeep<T>(input: T, depth = 0): T {
  if (depth > 8) return input
  if (Array.isArray(input)) {
    return input.map((v) => redactDeep(v, depth + 1)) as T
  }
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.some((s) => k.toLowerCase().includes(s))) {
        out[k] = '[REDACTED]'
      } else if (typeof v === 'object' && v !== null) {
        out[k] = redactDeep(v, depth + 1)
      } else {
        out[k] = redactValue(k, v)
      }
    }
    return out as T
  }
  return input
}

export function logJson(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) {
  const payload = {
    level,
    message,
    ts: new Date().toISOString(),
    ...(meta ? redactDeep(meta) : {}),
  }
  const line = JSON.stringify(payload)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}
