/** AES-GCM token encryption (Web Crypto). Used by Edge Functions and unit tests. */

export type EncryptedBlob = {
  iv_b64: string
  ciphertext_b64: string
}

function b64Encode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function b64Decode(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function parseEncryptionKey(raw: string): Uint8Array {
  // Accept 32-byte raw string, or base64 of 32 bytes, or 64-char hex
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    const out = new Uint8Array(32)
    for (let i = 0; i < 32; i++) out[i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16)
    return out
  }
  try {
    const decoded = b64Decode(raw)
    if (decoded.length === 32) return decoded
  } catch {
    /* fallthrough */
  }
  const enc = new TextEncoder().encode(raw)
  if (enc.length === 32) return enc
  throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes (raw, base64, or 64-hex)')
}

async function importKey(raw: string): Promise<CryptoKey> {
  const keyBytes = parseEncryptionKey(raw)
  return crypto.subtle.importKey('raw', keyBytes.buffer as ArrayBuffer, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

export async function encryptSecret(plaintext: string, keyRaw: string): Promise<EncryptedBlob> {
  const key = await importKey(keyRaw)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plaintext),
  )
  return { iv_b64: b64Encode(iv), ciphertext_b64: b64Encode(ct) }
}

export async function decryptSecret(blob: EncryptedBlob, keyRaw: string): Promise<string> {
  const key = await importKey(keyRaw)
  const iv = b64Decode(blob.iv_b64)
  const ct = b64Decode(blob.ciphertext_b64)
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ct as BufferSource,
  )
  return new TextDecoder().decode(pt)
}

/** Constant-time string compare for secrets. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    let _acc = 0
    for (let i = 0; i < a.length; i++) _acc |= a.charCodeAt(i) ^ 0
    return false
  }
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}
