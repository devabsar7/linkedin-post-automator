import { AuthError, handleOptions, jsonResponse, requireOwner, serviceClient } from '../_shared/http.ts'
import { hookFingerprint, extractKeywords, normalizeForHash } from '../_shared/quality.ts'
import { sha256Hex } from '../_shared/rss.ts'

Deno.serve(async (req) => {
  const opt = handleOptions(req)
  if (opt) return opt
  const origin = req.headers.get('Origin')
  try {
    const { userId } = await requireOwner(req)
    if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, origin)
    const body = await req.json()

    let posts: { text: string; published_at?: string; topic?: string; pillar_slug?: string }[] = []
    if (typeof body.csv === 'string') {
      posts = parseCsv(body.csv)
    } else if (typeof body.paste === 'string') {
      posts = body.paste
        .split(/\n---\n|\n\n\n+/)
        .map((t: string) => t.trim())
        .filter((t: string) => t.length >= 20)
        .map((text: string) => ({ text }))
    } else if (Array.isArray(body.posts)) {
      posts = body.posts
    }

    if (!posts.length) return jsonResponse({ error: 'no_posts' }, 400, origin)
    if (posts.length > 500) return jsonResponse({ error: 'too_many' }, 400, origin)

    const admin = serviceClient()
    let imported = 0
    for (const p of posts) {
      const text = p.text.trim()
      if (text.length < 20) continue
      const hash = await sha256Hex(normalizeForHash(text))
      const { error } = await admin.from('content_memory').upsert(
        {
          owner_id: userId,
          topic: p.topic ?? text.slice(0, 80),
          pillar: p.pillar_slug ?? null,
          angle: null,
          keywords: extractKeywords(text),
          hook_fingerprint: hookFingerprint(text.split('\n')[0] ?? text),
          word_count: text.split(/\s+/).length,
          normalized_hash: hash,
          body_sample: text.slice(0, 500),
          source: 'imported',
          published_or_imported_at: p.published_at ?? new Date().toISOString(),
        },
        { onConflict: 'owner_id,normalized_hash', ignoreDuplicates: true },
      )
      if (!error) imported++
    }

    return jsonResponse({ ok: true, imported, received: posts.length }, 200, origin)
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500
    return jsonResponse({ error: e instanceof Error ? e.message : 'failed' }, status, origin)
  }
})

function parseCsv(csv: string): { text: string; published_at?: string; topic?: string }[] {
  const lines = csv.split(/\r?\n/).filter(Boolean)
  if (!lines.length) return []
  const header = lines[0].toLowerCase().split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
  const textIdx = header.findIndex((h) => h === 'text' || h === 'content' || h === 'post')
  const dateIdx = header.findIndex((h) => h === 'date' || h === 'published_at')
  const topicIdx = header.findIndex((h) => h === 'topic')
  if (textIdx < 0) {
    // treat each line as post text
    return lines.map((l) => ({ text: l.replace(/^"|"$/g, '') }))
  }
  const out = []
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line)
    const text = cols[textIdx]?.trim()
    if (!text) continue
    out.push({
      text,
      published_at: dateIdx >= 0 ? cols[dateIdx] : undefined,
      topic: topicIdx >= 0 ? cols[topicIdx] : undefined,
    })
  }
  return out
}

function splitCsvLine(line: string): string[] {
  const result: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"'
        i++
      } else inQ = !inQ
    } else if (c === ',' && !inQ) {
      result.push(cur)
      cur = ''
    } else cur += c
  }
  result.push(cur)
  return result.map((s) => s.trim().replace(/^"|"$/g, ''))
}
