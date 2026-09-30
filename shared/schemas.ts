import { z } from 'zod'
import { DEFAULT_CHAR_MAX, DEFAULT_CHAR_MIN, POST_STATUSES, PUBLISHING_MODES } from './constants'

export const PostStatusSchema = z.enum(POST_STATUSES)
export const PublishingModeSchema = z.enum(PUBLISHING_MODES)

export const ScheduleSlotSchema = z.object({
  day: z.number().int().min(0).max(6),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
})

export const AppSettingsPatchSchema = z.object({
  publishing_mode: PublishingModeSchema.optional(),
  timezone: z.literal('Asia/Karachi').optional(),
  groq_model: z.string().min(1).max(120).optional(),
  dry_run: z.boolean().optional(),
  char_min: z.number().int().min(100).max(5000).optional(),
  char_max: z.number().int().min(200).max(10000).optional(),
  min_research_items: z.number().int().min(0).max(100).optional(),
  max_research_items: z.number().int().min(1).max(200).optional(),
  retention_days: z.number().int().min(30).max(90).optional(),
  weekly_schedule: z.array(ScheduleSlotSchema).length(7).optional(),
  include_citations_in_post: z.boolean().optional(),
  allow_roman_urdu: z.boolean().optional(),
})

export const ResearchCiteSchema = z.object({
  research_item_id: z.string().uuid(),
  claim_summary: z.string().min(1).max(500),
})

export const StrategyOpportunitySchema = z.object({
  pillar_slug: z.string().min(1),
  angle: z.string().min(1).max(400),
  topic: z.string().min(1).max(200),
  hook_direction: z.string().min(1).max(300),
  evergreen: z.boolean().default(false),
  research_cites: z.array(ResearchCiteSchema).default([]),
})

export const StrategyResponseSchema = z.object({
  opportunities: z.array(StrategyOpportunitySchema).length(7),
})

export const DraftPostSchema = z.object({
  slot_index: z.number().int().min(0).max(6),
  pillar_slug: z.string().min(1),
  topic: z.string().min(1).max(200),
  angle: z.string().min(1).max(400),
  hook: z.string().min(1).max(500),
  body: z.string().min(1).max(5000),
  cta: z.string().min(1).max(400),
  hashtags: z.array(z.string().max(60)).max(3).default([]),
  full_text: z.string().min(1).max(5000),
  evergreen: z.boolean().default(false),
  research_cites: z.array(ResearchCiteSchema).default([]),
  keywords: z.array(z.string()).default([]),
})

export const DraftBatchSchema = z.object({
  drafts: z.array(DraftPostSchema).length(7),
})

export const ValidationItemSchema = z.object({
  slot_index: z.number().int().min(0).max(6),
  passed: z.boolean(),
  issues: z.array(z.string()).default([]),
  revised_full_text: z.string().optional(),
})

export const ValidationBatchSchema = z.object({
  results: z.array(ValidationItemSchema).min(1).max(7),
})

export const QualityGateConfigSchema = z.object({
  charMin: z.number().int().default(DEFAULT_CHAR_MIN),
  charMax: z.number().int().default(DEFAULT_CHAR_MAX),
  maxHashtags: z.number().int().default(3),
  jaccardThreshold: z.number().min(0).max(1).default(0.55),
  hookSimilarityThreshold: z.number().min(0).max(1).default(0.7),
})

export const BootstrapRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10).max(128),
  bootstrap_secret: z.string().min(16),
})

export const ImportHistorySchema = z.object({
  posts: z
    .array(
      z.object({
        text: z.string().min(20).max(5000),
        published_at: z.string().datetime().optional(),
        topic: z.string().max(200).optional(),
        pillar_slug: z.string().max(120).optional(),
      }),
    )
    .min(1)
    .max(500),
})

export type StrategyResponse = z.infer<typeof StrategyResponseSchema>
export type DraftBatch = z.infer<typeof DraftBatchSchema>
export type ValidationBatch = z.infer<typeof ValidationBatchSchema>
export type QualityGateConfig = z.infer<typeof QualityGateConfigSchema>
export type DraftPost = z.infer<typeof DraftPostSchema>
