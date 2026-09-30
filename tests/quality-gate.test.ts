import { describe, expect, it } from 'vitest'
import { runDeterministicQualityGate } from '../shared/quality-gate'
import { jaccardSimilarity, hookFingerprint } from '../shared/text'
import type { DraftPost } from '../shared/schemas'

const bodyPad =
  'Instead of building an autonomous empire, I constrained the agent to one tool and readable logs. That made debugging honest and teachable for students I mentor. ' +
  'I wrote acceptance checks first, then wired a single retrieval step, then a single write step. Each failure printed the tool name, input shape, and truncated output. ' +
  'The lesson was not that agents are magic. The lesson was that narrow scope plus visible traces beats vague autonomy when you are still learning the stack. ' +
  'If you are shipping your first agent this month, pick one workflow you already understand manually and automate only that path.'

const baseDraft: DraftPost = {
  slot_index: 0,
  pillar_slug: 'real-world-ai-python',
  topic: 'Shipping a small agent',
  angle: 'Start with one tool call and clear logs',
  hook: 'I shipped a tiny agent that only does one thing well.',
  body: bodyPad,
  cta: 'What constraint helped your last agent project?',
  hashtags: ['#AI', '#Python'],
  full_text: '',
  evergreen: true,
  research_cites: [],
  keywords: ['agent', 'python'],
}

baseDraft.full_text = `${baseDraft.hook}\n\n${baseDraft.body}\n\n${baseDraft.cta}\n\n${baseDraft.hashtags.join(' ')}`

describe('quality gate and content memory scoring', () => {
  it('passes a solid evergreen draft', () => {
    const result = runDeterministicQualityGate(baseDraft, [], new Set())
    expect(result.passed).toBe(true)
  })

  it('rejects near-duplicate hooks via Jaccard', () => {
    const memory = [
      {
        hook_fingerprint: hookFingerprint(baseDraft.hook),
        body_sample: 'completely different body about databases and indexes for retrieval',
      },
    ]
    const result = runDeterministicQualityGate(baseDraft, memory, new Set())
    expect(result.passed).toBe(false)
    expect(result.issues.some((i) => i.code === 'dup_hook')).toBe(true)
  })

  it('rejects missing evidence for time-sensitive claims', () => {
    const draft = {
      ...baseDraft,
      evergreen: false,
      full_text: `${baseDraft.hook}\n\nOpenAI announced something huge in 2026 according to reports.\n\n${baseDraft.cta}`,
      research_cites: [],
    }
    const result = runDeterministicQualityGate(draft, [], new Set())
    expect(result.issues.some((i) => i.code === 'missing_evidence')).toBe(true)
  })

  it('scores similar bodies high', () => {
    expect(jaccardSimilarity('python agent tool logs', 'python agent tool logs debugging')).toBeGreaterThan(0.5)
  })
})
