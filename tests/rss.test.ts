import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  assertSafeHttpsUrl,
  canonicalizeUrl,
  dedupeKey,
  isStale,
  normalizeTitle,
  parseRssOrAtom,
} from '../shared/rss'

const dir = dirname(fileURLToPath(import.meta.url))

describe('RSS safety and parsing', () => {
  it('rejects non-https and private hosts', () => {
    expect(assertSafeHttpsUrl('http://example.com/feed').ok).toBe(false)
    expect(assertSafeHttpsUrl('https://127.0.0.1/feed').ok).toBe(false)
    expect(assertSafeHttpsUrl('https://localhost/feed').ok).toBe(false)
    expect(assertSafeHttpsUrl('https://192.168.1.1/feed').ok).toBe(false)
    expect(assertSafeHttpsUrl('https://example.com/feed').ok).toBe(true)
  })

  it('enforces allow-list hosts when provided', () => {
    const allow = new Set(['huggingface.co'])
    expect(assertSafeHttpsUrl('https://evil.com/feed', allow).ok).toBe(false)
    expect(assertSafeHttpsUrl('https://huggingface.co/blog/feed.xml', allow).ok).toBe(true)
  })

  it('canonicalizes URLs and strips tracking', () => {
    expect(canonicalizeUrl('https://example.com/a/?utm_source=x&b=1#frag')).toBe(
      'https://example.com/a?b=1',
    )
  })

  it('parses RSS fixtures and marks missing dates stale', () => {
    const xml = readFileSync(join(dir, 'fixtures/sample-rss.xml'), 'utf8')
    const items = parseRssOrAtom(xml)
    expect(items.length).toBe(2)
    expect(items[0].title).toContain('Agentic')
    expect(items[0].canonicalUrl).toBe('https://example.com/posts/agents')
    expect(isStale(items[1].publishedAt)).toBe(true)
  })

  it('dedupes on canonical url + normalized title', () => {
    const a = dedupeKey('https://example.com/posts/agents', 'Agentic Workflows!')
    const b = dedupeKey('https://example.com/posts/agents', 'agentic workflows')
    expect(normalizeTitle('Agentic Workflows!')).toBe('agentic workflows')
    expect(a.split('::')[0]).toBe(b.split('::')[0])
  })
})
