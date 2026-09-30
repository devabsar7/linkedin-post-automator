/** Text normalization, hashing helpers, Jaccard similarity, hook fingerprints */

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'is', 'are',
  'was', 'were', 'be', 'been', 'with', 'as', 'by', 'from', 'that', 'this', 'it', 'you',
  'i', 'we', 'they', 'our', 'your', 'my',
])

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function normalizeForHash(text: string): string {
  return normalizeWhitespace(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
}

export function tokenize(text: string): string[] {
  return normalizeForHash(text)
    .split(' ')
    .filter((t) => t.length > 1 && !STOP.has(t))
}

export function tokenSet(text: string): Set<string> {
  return new Set(tokenize(text))
}

export function jaccardSimilarity(a: string, b: string): number {
  const sa = tokenSet(a)
  const sb = tokenSet(b)
  if (sa.size === 0 && sb.size === 0) return 1
  if (sa.size === 0 || sb.size === 0) return 0
  let inter = 0
  for (const t of sa) if (sb.has(t)) inter++
  const union = sa.size + sb.size - inter
  return union === 0 ? 0 : inter / union
}

export function hookFingerprint(hook: string): string {
  return tokenize(hook).slice(0, 12).join(' ')
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function extractKeywords(text: string, limit = 12): string[] {
  const counts = new Map<string, number>()
  for (const t of tokenize(text)) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k)
}

export function countHashtags(text: string): string[] {
  const matches = text.match(/#[\p{L}\p{N}_]+/gu) ?? []
  return [...new Set(matches.map((h) => h.toLowerCase()))]
}

export function splitHookBody(fullText: string): { hook: string; rest: string } {
  const parts = fullText.split(/\n+/)
  const hook = (parts[0] ?? '').trim()
  const rest = parts.slice(1).join('\n').trim()
  return { hook, rest }
}
