import type { DraftPost, QualityGateConfig } from './schemas'
import { QualityGateConfigSchema } from './schemas'
import { countHashtags, hookFingerprint, jaccardSimilarity, normalizeWhitespace } from './text'

export type MemoryRecord = {
  topic?: string | null
  pillar?: string | null
  angle?: string | null
  keywords?: string[] | null
  hook_fingerprint?: string | null
  normalized_hash?: string | null
  body_sample?: string | null
}

export type ResearchItemRef = {
  id: string
}

export type GateIssue = { code: string; message: string }

export type GateResult = {
  passed: boolean
  issues: GateIssue[]
}

const PROHIBITED = [
  /\bguaranteed returns?\b/i,
  /\bdiagnose\b|\bprescribe\b|\btreatment plan\b/i,
  /\blegal advice\b|\bsue them\b/i,
  /\bAI is (completely )?changing the world\b/i,
  /\bact now\b|\blimited time only\b|\bdon't miss out\b/i,
]

const FABRICATION_HINTS = [
  /\b\d{1,3}%\s+(increase|growth|roi|engagement)\b/i,
  /\bour client\b|\bClient X\b/i,
  /\baccording to (a )?study\b/i,
]

export function runDeterministicQualityGate(
  draft: DraftPost,
  memory: MemoryRecord[],
  researchIds: Set<string>,
  configInput?: Partial<QualityGateConfig>,
): GateResult {
  const config = QualityGateConfigSchema.parse(configInput ?? {})
  const issues: GateIssue[] = []
  const text = normalizeWhitespace(draft.full_text)

  if (!draft.pillar_slug?.trim()) {
    issues.push({ code: 'pillar', message: 'Missing content pillar.' })
  }
  if (!draft.angle?.trim()) {
    issues.push({ code: 'angle', message: 'Missing distinct angle.' })
  }

  const len = [...text].length
  if (len < config.charMin || len > config.charMax) {
    issues.push({
      code: 'length',
      message: `Character count ${len} outside ${config.charMin}-${config.charMax}.`,
    })
  }

  if (!draft.hook?.trim() || draft.hook.trim().length < 12) {
    issues.push({ code: 'hook', message: 'Hook is too weak or missing.' })
  }
  if (!draft.body?.trim() || draft.body.trim().length < 40) {
    issues.push({ code: 'body', message: 'Body is too short.' })
  }
  if (!draft.cta?.trim()) {
    issues.push({ code: 'cta', message: 'Missing natural CTA.' })
  }

  const tags = draft.hashtags?.length ? draft.hashtags : countHashtags(text)
  if (tags.length > config.maxHashtags) {
    issues.push({ code: 'hashtags', message: `More than ${config.maxHashtags} hashtags.` })
  }

  const fp = hookFingerprint(draft.hook || text)
  for (const m of memory) {
    if (m.hook_fingerprint && jaccardSimilarity(fp, m.hook_fingerprint) >= config.hookSimilarityThreshold) {
      issues.push({ code: 'dup_hook', message: 'Hook too similar to recent content.' })
      break
    }
    if (m.body_sample && jaccardSimilarity(text, m.body_sample) >= config.jaccardThreshold) {
      issues.push({ code: 'dup_body', message: 'Body too similar to recent content.' })
      break
    }
    if (m.topic && draft.topic && jaccardSimilarity(draft.topic, m.topic) >= 0.85 && m.angle && draft.angle) {
      if (jaccardSimilarity(draft.angle, m.angle) >= 0.7) {
        issues.push({ code: 'dup_topic', message: 'Topic/angle overlaps recent content.' })
        break
      }
    }
  }

  for (const re of PROHIBITED) {
    if (re.test(text)) {
      issues.push({ code: 'prohibited', message: `Prohibited pattern matched: ${re}` })
    }
  }

  for (const re of FABRICATION_HINTS) {
    if (re.test(text) && (!draft.research_cites || draft.research_cites.length === 0) && !draft.evergreen) {
      issues.push({
        code: 'unsupported_claim',
        message: 'Numerical or sourced-sounding claim without research cites.',
      })
      break
    }
  }

  if (!draft.evergreen) {
    for (const cite of draft.research_cites ?? []) {
      const id = cite?.research_item_id
      if (!id || id === 'undefined' || id === 'null') continue
      if (!researchIds.has(id)) {
        issues.push({
          code: 'bad_cite',
          message: `Unknown research_item_id ${id}`,
        })
      }
    }
    const needsEvidence =
      /\b(announced|released|launched|according to|reported)\b/i.test(text) ||
      /\b20\d{2}\b/.test(text)
    if (needsEvidence && (draft.research_cites?.length ?? 0) === 0) {
      issues.push({
        code: 'missing_evidence',
        message: 'Time-sensitive or factual claim without research_item_id evidence.',
      })
    }
  }

  return { passed: issues.length === 0, issues }
}
