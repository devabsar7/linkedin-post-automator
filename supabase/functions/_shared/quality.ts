const STOP = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','is','are','was','were','be','been','with','as','by','from','that','this','it','you','i','we','they','our','your','my',
])

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function normalizeForHash(text: string): string {
  return normalizeWhitespace(text).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '')
}

export function tokenize(text: string): string[] {
  return normalizeForHash(text).split(' ').filter((t) => t.length > 1 && !STOP.has(t))
}

export function jaccardSimilarity(a: string, b: string): number {
  const sa = new Set(tokenize(a))
  const sb = new Set(tokenize(b))
  if (sa.size === 0 && sb.size === 0) return 1
  if (sa.size === 0 || sb.size === 0) return 0
  let inter = 0
  for (const t of sa) if (sb.has(t)) inter++
  return inter / (sa.size + sb.size - inter)
}

export function hookFingerprint(hook: string): string {
  return tokenize(hook).slice(0, 12).join(' ')
}

export function extractKeywords(text: string, limit = 12): string[] {
  const counts = new Map<string, number>()
  for (const t of tokenize(text)) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([k]) => k)
}

export function countHashtags(text: string): string[] {
  return [...new Set((text.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((h) => h.toLowerCase()))]
}

export type DraftLike = {
  pillar_slug: string
  topic: string
  angle: string
  hook: string
  body: string
  cta: string
  hashtags: string[]
  full_text: string
  evergreen: boolean
  research_cites: { research_item_id: string; claim_summary: string }[]
}

export type MemoryRecord = {
  topic?: string | null
  pillar?: string | null
  angle?: string | null
  hook_fingerprint?: string | null
  body_sample?: string | null
}

export type GateIssue = { code: string; message: string }

/** Drop invented / empty cite IDs before gating or saving. */
export function sanitizeResearchCites(
  cites: unknown,
  researchIds: Set<string>,
): { research_item_id: string; claim_summary: string }[] {
  if (!Array.isArray(cites)) return []
  const out: { research_item_id: string; claim_summary: string }[] = []
  for (const raw of cites) {
    if (!raw || typeof raw !== 'object') continue
    const c = raw as Record<string, unknown>
    const id = String(c.research_item_id ?? c.id ?? '').trim()
    if (!id || id === 'undefined' || id === 'null') continue
    if (!researchIds.has(id)) continue
    out.push({
      research_item_id: id,
      claim_summary: String(c.claim_summary ?? c.summary ?? '').slice(0, 400),
    })
  }
  return out
}

export function runDeterministicQualityGate(
  draft: DraftLike,
  memory: MemoryRecord[],
  researchIds: Set<string>,
  config: { charMin: number; charMax: number; maxHashtags?: number; jaccardThreshold?: number; hookSimilarityThreshold?: number },
): { passed: boolean; issues: GateIssue[] } {
  const issues: GateIssue[] = []
  const maxTags = config.maxHashtags ?? 3
  const jaccardThreshold = config.jaccardThreshold ?? 0.55
  const hookSimilarityThreshold = config.hookSimilarityThreshold ?? 0.7
  const text = normalizeWhitespace(draft.full_text)

  if (!draft.pillar_slug?.trim()) issues.push({ code: 'pillar', message: 'Missing content pillar.' })
  if (!draft.angle?.trim()) issues.push({ code: 'angle', message: 'Missing distinct angle.' })

  const len = [...text].length
  if (len < config.charMin || len > config.charMax) {
    issues.push({ code: 'length', message: `Character count ${len} outside ${config.charMin}-${config.charMax}.` })
  }
  if (!draft.hook?.trim() || draft.hook.trim().length < 12) issues.push({ code: 'hook', message: 'Hook too weak.' })
  if (!draft.body?.trim() || draft.body.trim().length < 40) issues.push({ code: 'body', message: 'Body too short.' })
  if (!draft.cta?.trim()) issues.push({ code: 'cta', message: 'Missing CTA.' })

  const tags = draft.hashtags?.length ? draft.hashtags : countHashtags(text)
  if (tags.length > maxTags) issues.push({ code: 'hashtags', message: `More than ${maxTags} hashtags.` })

  const fp = hookFingerprint(draft.hook || text)
  for (const m of memory) {
    if (m.hook_fingerprint && jaccardSimilarity(fp, m.hook_fingerprint) >= hookSimilarityThreshold) {
      issues.push({ code: 'dup_hook', message: 'Hook too similar to recent content.' })
      break
    }
    if (m.body_sample && jaccardSimilarity(text, m.body_sample) >= jaccardThreshold) {
      issues.push({ code: 'dup_body', message: 'Body too similar to recent content.' })
      break
    }
  }

  const prohibited = [
    /\bguaranteed returns?\b/i,
    /\bAI is (completely )?changing the world\b/i,
    /\bact now\b|\blimited time only\b/i,
  ]
  for (const re of prohibited) {
    if (re.test(text)) issues.push({ code: 'prohibited', message: `Prohibited: ${re}` })
  }

  if (!draft.evergreen) {
    for (const cite of draft.research_cites ?? []) {
      const id = cite?.research_item_id
      if (!id || id === 'undefined' || id === 'null') continue
      if (!researchIds.has(id)) {
        issues.push({ code: 'bad_cite', message: `Unknown research_item_id ${id}` })
      }
    }
    const needsEvidence = /\b(announced|released|launched|according to|reported)\b/i.test(text) || /\b20\d{2}\b/.test(text)
    if (needsEvidence && (draft.research_cites?.length ?? 0) === 0) {
      issues.push({ code: 'missing_evidence', message: 'Factual claim without research evidence.' })
    }
  }

  return { passed: issues.length === 0, issues }
}
