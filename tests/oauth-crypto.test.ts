import { describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret, timingSafeEqual } from '../shared/crypto'
import { redactDeep } from '../shared/redact'

const KEY = '0123456789abcdef0123456789abcdef'

describe('oauth crypto and redaction', () => {
  it('encrypts and decrypts round-trip', async () => {
    const blob = await encryptSecret('linkedin-access-token-value', KEY)
    expect(blob.iv_b64).toBeTruthy()
    expect(blob.ciphertext_b64).toBeTruthy()
    expect(blob.ciphertext_b64).not.toContain('linkedin-access-token-value')
    const pt = await decryptSecret(blob, KEY)
    expect(pt).toBe('linkedin-access-token-value')
  })

  it('compares secrets in constant-time style', () => {
    expect(timingSafeEqual('abcdef', 'abcdef')).toBe(true)
    expect(timingSafeEqual('abcdef', 'abcdeg')).toBe(false)
    expect(timingSafeEqual('abc', 'abcd')).toBe(false)
  })

  it('redacts tokens from logs', () => {
    const redacted = redactDeep({
      authorization: 'Bearer secret-token',
      nested: { access_token: 'abc', ok: true },
      note: 'Bearer abcdef',
    }) as Record<string, unknown>
    expect(redacted.authorization).toBe('[REDACTED]')
    expect((redacted.nested as Record<string, unknown>).access_token).toBe('[REDACTED]')
    expect(String(redacted.note)).toContain('[REDACTED]')
  })
})
