const PRIVATE_HOST_RE =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|\[::1\]|0\.0\.0\.0|169\.254\.|metadata\.google\.internal)/i

export const MAX_FEED_BYTES = 1_500_000
export const MAX_DESCRIPTION = 600

export type UrlSafetyResult = { ok: true; url: URL } | { ok: false; reason: string }

export function assertSafeHttpsUrl(raw: string, allowHostnames?: Set<string>): UrlSafetyResult {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: 'invalid_url' }
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'https_required' }
  if (url.username || url.password) return { ok: false, reason: 'userinfo_forbidden' }
  if (PRIVATE_HOST_RE.test(url.hostname)) return { ok: false, reason: 'private_host' }
  if (allowHostnames && allowHostnames.size > 0 && !allowHostnames.has(url.hostname.toLowerCase())) {
    return { ok: false, reason: 'host_not_allowlisted' }
  }
  return { ok: true, url }
}

export function canonicalizeUrl(raw: string): string {
  const u = new URL(raw)
  u.hash = ''
  ;['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'].forEach((k) =>
    u.searchParams.delete(k),
  )
  u.pathname = u.pathname.replace(/\/+$/, '') || '/'
  return u.toString()
}

export function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim()
}

export type ParsedFeedItem = {
  title: string
  url: string
  canonicalUrl: string
  publishedAt: Date | null
  description: string
  categories: string[]
}

export function parseRssOrAtom(xml: string, maxItems = 40): ParsedFeedItem[] {
  if (xml.length > MAX_FEED_BYTES) throw new Error('feed_too_large')
  const items: ParsedFeedItem[] = []
  const isAtom = /<feed[\s>]/i.test(xml)
  if (isAtom) {
    for (const entry of (xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? []).slice(0, maxItems)) {
      const title = textContent(entry, 'title')
      const link =
        attrMatch(entry, /<link[^>]*rel=["']?alternate["']?[^>]*href=["']([^"']+)["']/i) ||
        attrMatch(entry, /<link[^>]*href=["']([^"']+)["']/i) ||
        textContent(entry, 'id')
      const published = textContent(entry, 'published') || textContent(entry, 'updated') || null
      const summary = textContent(entry, 'summary') || textContent(entry, 'content') || ''
      const cats = [...entry.matchAll(/<category[^>]*term=["']([^"']+)["']/gi)].map((m) => m[1])
      if (title && link) items.push(toItem(title, link, published, summary, cats))
    }
  } else {
    for (const entry of (xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? []).slice(0, maxItems)) {
      const title = textContent(entry, 'title')
      const link = textContent(entry, 'link') || textContent(entry, 'guid')
      const published = textContent(entry, 'pubDate') || textContent(entry, 'dc:date') || null
      const summary = textContent(entry, 'description') || textContent(entry, 'content:encoded') || ''
      const cats = [...entry.matchAll(/<category[^>]*>([^<]+)<\/category>/gi)].map((m) => decodeXml(m[1].trim()))
      if (title && link) items.push(toItem(title, link, published, summary, cats))
    }
  }
  return items
}

function toItem(title: string, link: string, published: string | null, summary: string, categories: string[]): ParsedFeedItem {
  const cleanTitle = decodeXml(stripTags(title)).trim()
  const url = decodeXml(link).trim()
  let canonicalUrl = url
  try {
    canonicalUrl = canonicalizeUrl(url)
  } catch { /* keep */ }
  const publishedAt = published ? safeDate(published) : null
  return {
    title: cleanTitle,
    url,
    canonicalUrl,
    publishedAt,
    description: decodeXml(stripTags(summary)).slice(0, MAX_DESCRIPTION),
    categories,
  }
}

function textContent(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))
  return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').trim() : ''
}
function attrMatch(block: string, re: RegExp): string {
  return block.match(re)?.[1]?.trim() ?? ''
}
function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ')
}
function decodeXml(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
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

export async function fetchFeedSafe(
  feedUrl: string,
  allowHostnames: Set<string>,
  timeoutMs = 10_000,
): Promise<{ xml: string } | { error: string }> {
  const safety = assertSafeHttpsUrl(feedUrl, allowHostnames)
  if (!safety.ok) return { error: safety.reason }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(safety.url.toString(), {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
    })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) return { error: 'redirect_missing_location' }
      const next = assertSafeHttpsUrl(new URL(loc, safety.url).toString(), allowHostnames)
      if (!next.ok) return { error: `redirect_${next.reason}` }
      const res2 = await fetch(next.url.toString(), {
        method: 'GET',
        redirect: 'error',
        signal: controller.signal,
        headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
      })
      if (!res2.ok) return { error: `http_${res2.status}` }
      const buf = new Uint8Array(await res2.arrayBuffer())
      if (buf.byteLength > MAX_FEED_BYTES) return { error: 'feed_too_large' }
      return { xml: new TextDecoder().decode(buf) }
    }
    if (!res.ok) return { error: `http_${res.status}` }
    const buf = new Uint8Array(await res.arrayBuffer())
    if (buf.byteLength > MAX_FEED_BYTES) return { error: 'feed_too_large' }
    return { xml: new TextDecoder().decode(buf) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'fetch_failed' }
  } finally {
    clearTimeout(timer)
  }
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
