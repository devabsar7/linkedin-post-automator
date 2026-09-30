import { describe, expect, it } from 'vitest'
import { DraftBatchSchema, StrategyResponseSchema, ValidationBatchSchema } from '../shared/schemas'

describe('Groq schema parsing', () => {
  it('accepts valid strategy JSON shape', () => {
    const opportunities = Array.from({ length: 7 }, (_, i) => ({
      pillar_slug: 'real-world-ai-python',
      angle: `angle-${i}`,
      topic: `topic-${i}`,
      hook_direction: 'practical hook',
      evergreen: true,
      research_cites: [],
    }))
    expect(StrategyResponseSchema.parse({ opportunities }).opportunities).toHaveLength(7)
  })

  it('rejects wrong draft count', () => {
    expect(() => DraftBatchSchema.parse({ drafts: [] })).toThrow()
  })

  it('rejects malformed validation payload', () => {
    expect(() => ValidationBatchSchema.parse({ results: 'nope' })).toThrow()
  })
})
