export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

type AppSettingsRow = {
  id: string
  owner_id: string
  publishing_mode: 'review' | 'auto'
  timezone: string
  groq_model: string
  dry_run: boolean
  char_min: number
  char_max: number
  min_research_items: number
  max_research_items: number
  retention_days: number
  weekly_schedule: Json
  include_citations_in_post: boolean
  allow_roman_urdu: boolean
  auto_publish_paused: boolean
  created_at: string
  updated_at: string
}

type BootstrapStateRow = {
  id: boolean
  completed: boolean
  completed_at: string | null
  created_at: string
  updated_at: string
}

type BrandProfilesRow = {
  id: string
  owner_id: string
  display_name: string
  positioning: string
  core_expertise: Json
  career_context: string
  audience: string
  writing_style: string
  allow_roman_urdu: boolean
  include_citations_in_post: boolean
  created_at: string
  updated_at: string
}

type ContentMemoryRow = {
  id: string
  owner_id: string
  post_id: string | null
  topic: string | null
  pillar: string | null
  angle: string | null
  keywords: string[]
  hook_fingerprint: string | null
  word_count: number
  published_or_imported_at: string
  normalized_hash: string
  body_sample: string
  source: string
  created_at: string
  updated_at: string
}

type ContentPillarsRow = {
  id: string
  owner_id: string
  slug: string
  name: string
  description: string
  sort_order: number
  enabled: boolean
  created_at: string
  updated_at: string
}

type ContentRunsRow = {
  id: string
  owner_id: string
  iso_week_key: string
  idempotency_key: string
  status: string
  prompt_version: string
  model: string | null
  token_usage: Json | null
  latency_ms: number | null
  research_item_ids: string[]
  evergreen_used: boolean
  error_summary: string | null
  metadata: Json
  started_at: string
  finished_at: string | null
  created_at: string
  updated_at: string
}

type OauthConnectionsRow = {
  id: string
  owner_id: string
  provider: string
  member_urn: string | null
  member_name: string | null
  token_iv: string | null
  token_ciphertext: string | null
  token_expires_at: string | null
  refresh_iv: string | null
  refresh_ciphertext: string | null
  scopes: string
  health: string
  last_health_check_at: string | null
  oauth_state: string | null
  oauth_state_expires_at: string | null
  pkce_verifier: string | null
  created_at: string
  updated_at: string
}

type PostIdeasRow = {
  id: string
  owner_id: string
  content_run_id: string
  slot_index: number
  pillar_slug: string
  topic: string
  angle: string
  hook_direction: string | null
  evergreen: boolean
  research_cites: Json
  created_at: string
  updated_at: string
}

type PostVersionsRow = {
  id: string
  owner_id: string
  post_id: string
  version_number: number
  full_text: string
  source: string
  created_at: string
}

type PostsRow = {
  id: string
  owner_id: string
  content_run_id: string | null
  post_idea_id: string | null
  slot_index: number | null
  status: string
  pillar_slug: string | null
  topic: string | null
  angle: string | null
  full_text: string
  hook: string | null
  scheduled_at: string | null
  published_at: string | null
  linkedin_post_urn: string | null
  linkedin_post_url: string | null
  evergreen: boolean
  validation_report: Json
  research_cites: Json
  retry_count: number
  next_retry_at: string | null
  last_error: string | null
  claim_token: string | null
  claimed_at: string | null
  iso_week_key: string | null
  created_at: string
  updated_at: string
}

type PublishingAttemptsRow = {
  id: string
  owner_id: string
  post_id: string
  attempt_number: number
  idempotency_key: string
  status: string
  failure_class: string | null
  http_status: number | null
  linkedin_post_urn: string | null
  error_summary: string | null
  dry_run: boolean
  started_at: string
  finished_at: string | null
  created_at: string
}

type ResearchItemsRow = {
  id: string
  owner_id: string
  source_feed_id: string | null
  title: string
  canonical_url: string
  published_at: string | null
  source_name: string
  snippet: string
  categories: string[]
  content_hash: string
  score: number
  retrieved_at: string
  created_at: string
  updated_at: string
}

type SchedulerRunsRow = {
  id: string
  owner_id: string | null
  job_name: string
  idempotency_key: string
  outcome: string
  duration_ms: number | null
  detail: Json
  error_summary: string | null
  created_at: string
}

type SourceFeedsRow = {
  id: string
  owner_id: string
  name: string
  feed_url: string
  category: string
  enabled: boolean
  quality_score: number
  health_status: string
  last_health_at: string | null
  last_error: string | null
  cooldown_until: string | null
  consecutive_failures: number
  created_at: string
  updated_at: string
}

type TableDef<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      app_settings: TableDef<AppSettingsRow, Partial<AppSettingsRow> & { owner_id: string }>
      bootstrap_state: TableDef<BootstrapStateRow>
      brand_profiles: TableDef<
        BrandProfilesRow,
        Partial<BrandProfilesRow> & { owner_id: string; display_name: string; positioning: string }
      >
      content_memory: TableDef<
        ContentMemoryRow,
        Partial<ContentMemoryRow> & { owner_id: string; normalized_hash: string }
      >
      content_pillars: TableDef<
        ContentPillarsRow,
        Partial<ContentPillarsRow> & { owner_id: string; slug: string; name: string }
      >
      content_runs: TableDef<
        ContentRunsRow,
        Partial<ContentRunsRow> & { owner_id: string; iso_week_key: string; idempotency_key: string }
      >
      oauth_connections: TableDef<OauthConnectionsRow, Partial<OauthConnectionsRow> & { owner_id: string }>
      post_ideas: TableDef<
        PostIdeasRow,
        Partial<PostIdeasRow> & {
          owner_id: string
          content_run_id: string
          slot_index: number
          pillar_slug: string
          topic: string
          angle: string
        }
      >
      post_versions: TableDef<
        PostVersionsRow,
        Partial<PostVersionsRow> & {
          owner_id: string
          post_id: string
          version_number: number
          full_text: string
        }
      >
      posts: TableDef<PostsRow, Partial<PostsRow> & { owner_id: string }>
      publishing_attempts: TableDef<
        PublishingAttemptsRow,
        Partial<PublishingAttemptsRow> & {
          owner_id: string
          post_id: string
          idempotency_key: string
          status: string
        }
      >
      research_items: TableDef<
        ResearchItemsRow,
        Partial<ResearchItemsRow> & {
          owner_id: string
          title: string
          canonical_url: string
          source_name: string
          content_hash: string
        }
      >
      scheduler_runs: TableDef<
        SchedulerRunsRow,
        Partial<SchedulerRunsRow> & { job_name: string; idempotency_key: string; outcome: string }
      >
      source_feeds: TableDef<
        SourceFeedsRow,
        Partial<SourceFeedsRow> & { owner_id: string; name: string; feed_url: string }
      >
    }
    Views: Record<string, never>
    Functions: {
      claim_due_post: {
        Args: { p_owner_id?: string | null }
        Returns: PostsRow
      }
      get_oauth_connection_status: {
        Args: Record<string, never>
        Returns: {
          id: string
          provider: string
          member_urn: string | null
          member_name: string | null
          token_expires_at: string | null
          scopes: string
          health: string
          last_health_check_at: string | null
          created_at: string
          updated_at: string
        }[]
      }
      seed_owner_defaults: {
        Args: { p_owner_id: string }
        Returns: undefined
      }
    }
    Enums: {
      post_status:
        | 'DRAFT'
        | 'READY_FOR_REVIEW'
        | 'SCHEDULED'
        | 'PUBLISHING'
        | 'PUBLISHED'
        | 'RETRY_WAIT'
        | 'NEEDS_REAUTH'
        | 'FAILED'
        | 'UNKNOWN_OUTCOME'
        | 'SKIPPED'
        | 'REJECTED'
      publishing_mode: 'review' | 'auto'
      oauth_health:
        | 'connected'
        | 'expiring'
        | 'expired'
        | 'revoked'
        | 'needs_reauth'
        | 'disconnected'
    }
    CompositeTypes: Record<string, never>
  }
}
