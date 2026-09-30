/** AES-GCM encryption for OAuth tokens at rest */

export type EncryptedBlob = { iv_b64: string; ciphertext_b64: string }

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
  throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes')
}

async function importKey(raw: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', parseEncryptionKey(raw), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encryptSecret(plaintext: string, keyRaw: string): Promise<EncryptedBlob> {
  const key = await importKey(keyRaw)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext))
  return { iv_b64: b64Encode(iv), ciphertext_b64: b64Encode(ct) }
}

export async function decryptSecret(blob: EncryptedBlob, keyRaw: string): Promise<string> {
  const key = await importKey(keyRaw)
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64Decode(blob.iv_b64) },
    key,
    b64Decode(blob.ciphertext_b64),
  )
  return new TextDecoder().decode(pt)
}

export function randomUrlSafe(bytes = 32): string {
  const arr = crypto.getRandomValues(new Uint8Array(bytes))
  return b64Encode(arr).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return b64Encode(digest).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
