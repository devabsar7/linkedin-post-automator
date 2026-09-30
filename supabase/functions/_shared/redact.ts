const SENSITIVE = [
  'authorization', 'access_token', 'refresh_token', 'client_secret', 'api_key',
  'bootstrap_secret', 'cron_secret', 'ciphertext', 'password', 'token', 'pkce_verifier',
]

export function redactDeep(input: unknown, depth = 0): unknown {
  if (depth > 8) return input
  if (Array.isArray(input)) return input.map((v) => redactDeep(v, depth + 1))
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE.some((s) => k.toLowerCase().includes(s))) out[k] = '[REDACTED]'
      else out[k] = redactDeep(v, depth + 1)
    }
    return out
  }
  if (typeof input === 'string' && /Bearer\s+\S+/i.test(input)) {
    return input.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
  }
  return input
}

export function logJson(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({ level, message, ts: new Date().toISOString(), ...(meta ? redactDeep(meta) as object : {}) })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}
