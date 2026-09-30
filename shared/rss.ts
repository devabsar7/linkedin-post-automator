/**
 * Safe RSS URL validation and feed item normalization (shared; used by tests + ported to Edge).
 */

const PRIVATE_HOST_RE =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|\[::1\]|0\.0\.0\.0|169\.254\.|metadata\.google\.internal)/i

export type UrlSafetyResult = { ok: true; url: URL } | { ok: false; reason: string }

export function assertSafeHttpsUrl(
  raw: string,
  allowHostnames?: Set<string>,
): UrlSafetyResult {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: 'invalid_url' }
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'https_required' }
  if (url.username || url.password) return { ok: false, reason: 'userinfo_forbidden' }
  if (PRIVATE_HOST_RE.test(url.hostname) || PRIVATE_HOST_RE.test(url.host)) {
    return { ok: false, reason: 'private_host' }
  }
  // Block literal IPv4 private ranges already covered; block IPv6 local
  if (url.hostname.startsWith('[') && /\[(::1|fc|fd|fe80)/i.test(url.hostname)) {
    return { ok: false, reason: 'private_ipv6' }
  }
  if (allowHostnames && allowHostnames.size > 0 && !allowHostnames.has(url.hostname.toLowerCase())) {
    return { ok: false, reason: 'host_not_allowlisted' }
  }
  return { ok: true, url }
}

export function canonicalizeUrl(raw: string): string {
  const u = new URL(raw)
  u.hash = ''
  // strip common tracking params
  ;['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'].forEach(
    (k) => u.searchParams.delete(k),
  )
  const path = u.pathname.replace(/\/+$/, '') || '/'
  u.pathname = path
  return u.toString()
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export type ParsedFeedItem = {
  title: string
  url: string
  canonicalUrl: string
  publishedAt: Date | null
  description: string
  categories: string[]
}

const MAX_DESCRIPTION = 600
const MAX_FEED_BYTES = 1_500_000

export { MAX_FEED_BYTES, MAX_DESCRIPTION }

/** Minimal RSS/Atom parser without external deps. */
export function parseRssOrAtom(xml: string, maxItems = 40): ParsedFeedItem[] {
  if (xml.length > MAX_FEED_BYTES) throw new Error('feed_too_large')
  const items: ParsedFeedItem[] = []

  const isAtom = /<feed[\s>]/i.test(xml)
  if (isAtom) {
    const entries = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? []
    for (const entry of entries.slice(0, maxItems)) {
      const title = textContent(entry, 'title')
      const link =
        attrMatch(entry, /<link[^>]*rel=["']?alternate["']?[^>]*href=["']([^"']+)["']/i) ||
        attrMatch(entry, /<link[^>]*href=["']([^"']+)["']/i) ||
        textContent(entry, 'id')
      const published =
        textContent(entry, 'published') || textContent(entry, 'updated') || null
      const summary =
        textContent(entry, 'summary') || textContent(entry, 'content') || ''
      const cats = [...entry.matchAll(/<category[^>]*term=["']([^"']+)["']/gi)].map((m) => m[1])
      if (!title || !link) continue
      items.push(toItem(title, link, published, summary, cats))
    }
  } else {
    const entries = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? []
    for (const entry of entries.slice(0, maxItems)) {
      const title = textContent(entry, 'title')
      const link = textContent(entry, 'link') || textContent(entry, 'guid')
      const published =
        textContent(entry, 'pubDate') || textContent(entry, 'dc:date') || null
      const summary =
        textContent(entry, 'description') || textContent(entry, 'content:encoded') || ''
      const cats = [...entry.matchAll(/<category[^>]*>([^<]+)<\/category>/gi)].map((m) =>
        decodeXml(m[1].trim()),
      )
      if (!title || !link) continue
      items.push(toItem(title, link, published, summary, cats))
    }
  }
  return items
}

function toItem(
  title: string,
  link: string,
  published: string | null,
  summary: string,
  categories: string[],
): ParsedFeedItem {
  const cleanTitle = decodeXml(stripTags(title)).trim()
  const url = decodeXml(link).trim()
  let canonicalUrl = url
  try {
    canonicalUrl = canonicalizeUrl(url)
  } catch {
    /* keep raw */
  }
  const publishedAt = published ? safeDate(published) : null
  const description = decodeXml(stripTags(summary)).slice(0, MAX_DESCRIPTION)
  return { title: cleanTitle, url, canonicalUrl, publishedAt, description, categories }
}

function textContent(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')
  const m = block.match(re)
  if (!m) return ''
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').trim()
}

function attrMatch(block: string, re: RegExp): string {
  const m = block.match(re)
  return m?.[1]?.trim() ?? ''
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ')
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function safeDate(raw: string): Date | null {
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

export function isStale(publishedAt: Date | null, maxAgeDays = 21, now = new Date()): boolean {
  if (!publishedAt) return true
  const age = now.getTime() - publishedAt.getTime()
  return age < 0 || age > maxAgeDays * 86400000
}

export function dedupeKey(canonicalUrl: string, title: string): string {
  return `${canonicalUrl}::${normalizeTitle(title)}`
}
