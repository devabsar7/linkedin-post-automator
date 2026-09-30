-- LinkedIn Content OS â€” core schema, enums, tables, indexes
-- Hosted Supabase only (no local stack required to author)

create extension if not exists "pgcrypto";

-- Enums
do $$ begin
  create type public.post_status as enum (
    'DRAFT',
    'READY_FOR_REVIEW',
    'SCHEDULED',
    'PUBLISHING',
    'PUBLISHED',
    'RETRY_WAIT',
    'NEEDS_REAUTH',
    'FAILED',
    'UNKNOWN_OUTCOME',
    'SKIPPED',
    'REJECTED'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.publishing_mode as enum ('review', 'auto');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.oauth_health as enum (
    'connected',
    'expiring',
    'expired',
    'revoked',
    'needs_reauth',
    'disconnected'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.feed_health as enum (
    'unknown',
    'healthy',
    'degraded',
    'failed',
    'cooldown'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.scheduler_job_name as enum (
    'weekly-content',
    'process-due-posts',
    'token-health',
    'retention-heartbeat'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.scheduler_outcome as enum (
    'success',
    'partial',
    'failed',
    'skipped_idempotent'
  );
exception when duplicate_object then null;
end $$;

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- bootstrap_state (singleton row)
create table if not exists public.bootstrap_state (
  id boolean primary key default true check (id),
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.bootstrap_state (id, completed)
values (true, false)
on conflict (id) do nothing;

create trigger bootstrap_state_updated_at
before update on public.bootstrap_state
for each row execute function public.set_updated_at();

-- brand_profiles
create table if not exists public.brand_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  positioning text not null,
  core_expertise jsonb not null default '[]'::jsonb,
  career_context text not null default '',
  audience text not null default '',
  writing_style text not null default '',
  allow_roman_urdu boolean not null default false,
  include_citations_in_post boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id)
);

create trigger brand_profiles_updated_at
before update on public.brand_profiles
for each row execute function public.set_updated_at();

-- content_pillars
create table if not exists public.content_pillars (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  slug text not null,
  name text not null,
  description text not null default '',
  sort_order int not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, slug)
);

create index content_pillars_owner_idx on public.content_pillars (owner_id, sort_order);
create trigger content_pillars_updated_at
before update on public.content_pillars
for each row execute function public.set_updated_at();

-- source_feeds
create table if not exists public.source_feeds (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  feed_url text not null,
  category text not null default 'general',
  enabled boolean not null default true,
  quality_score int not null default 50 check (quality_score between 0 and 100),
  health_status public.feed_health not null default 'unknown',
  last_health_at timestamptz,
  last_error text,
  cooldown_until timestamptz,
  consecutive_failures int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, feed_url),
  constraint source_feeds_https check (feed_url like 'https://%')
);

create index source_feeds_owner_enabled_idx on public.source_feeds (owner_id, enabled);
create trigger source_feeds_updated_at
before update on public.source_feeds
for each row execute function public.set_updated_at();

-- research_items
create table if not exists public.research_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  source_feed_id uuid references public.source_feeds (id) on delete set null,
  title text not null,
  canonical_url text not null,
  published_at timestamptz,
  source_name text not null,
  snippet text not null default '',
  categories text[] not null default '{}',
  content_hash text not null,
  score numeric not null default 0,
  retrieved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, canonical_url),
  unique (owner_id, content_hash)
);

create index research_items_owner_retrieved_idx on public.research_items (owner_id, retrieved_at desc);
create index research_items_canonical_idx on public.research_items (canonical_url);
create trigger research_items_updated_at
before update on public.research_items
for each row execute function public.set_updated_at();

-- content_runs
create table if not exists public.content_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  iso_week_key text not null,
  idempotency_key text not null,
  status text not null default 'running'
    check (status in ('running', 'success', 'partial', 'failed')),
  prompt_version text not null default 'v1.0.0',
  model text,
  token_usage jsonb,
  latency_ms int,
  research_item_ids uuid[] not null default '{}',
  evergreen_used boolean not null default false,
  error_summary text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, idempotency_key),
  unique (owner_id, iso_week_key)
);

create index content_runs_owner_started_idx on public.content_runs (owner_id, started_at desc);
create trigger content_runs_updated_at
before update on public.content_runs
for each row execute function public.set_updated_at();

-- post_ideas
create table if not exists public.post_ideas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  content_run_id uuid not null references public.content_runs (id) on delete cascade,
  slot_index int not null check (slot_index between 0 and 6),
  pillar_slug text not null,
  topic text not null,
  angle text not null,
  hook_direction text,
  evergreen boolean not null default false,
  research_cites jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (content_run_id, slot_index)
);

create index post_ideas_owner_idx on public.post_ideas (owner_id, content_run_id);
create trigger post_ideas_updated_at
before update on public.post_ideas
for each row execute function public.set_updated_at();

-- posts
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  content_run_id uuid references public.content_runs (id) on delete set null,
  post_idea_id uuid references public.post_ideas (id) on delete set null,
  slot_index int check (slot_index is null or slot_index between 0 and 6),
  status public.post_status not null default 'DRAFT',
  pillar_slug text,
  topic text,
  angle text,
  full_text text not null default '',
  hook text,
  scheduled_at timestamptz,
  published_at timestamptz,
  linkedin_post_urn text,
  linkedin_post_url text,
  evergreen boolean not null default false,
  validation_report jsonb not null default '{}'::jsonb,
  research_cites jsonb not null default '[]'::jsonb,
  retry_count int not null default 0,
  next_retry_at timestamptz,
  last_error text,
  claim_token uuid,
  claimed_at timestamptz,
  iso_week_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index posts_owner_status_idx on public.posts (owner_id, status);
create index posts_owner_scheduled_idx on public.posts (owner_id, scheduled_at);
create index posts_due_idx on public.posts (status, scheduled_at)
  where status in ('SCHEDULED', 'RETRY_WAIT');
create index posts_owner_week_idx on public.posts (owner_id, iso_week_key);
create trigger posts_updated_at
before update on public.posts
for each row execute function public.set_updated_at();

-- post_versions
create table if not exists public.post_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  version_number int not null,
  full_text text not null,
  source text not null default 'edit'
    check (source in ('generate', 'validate', 'edit', 'regenerate', 'import')),
  created_at timestamptz not null default now(),
  unique (post_id, version_number)
);

create index post_versions_post_idx on public.post_versions (post_id, version_number desc);

-- content_memory
create table if not exists public.content_memory (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  post_id uuid references public.posts (id) on delete set null,
  topic text,
  pillar text,
  angle text,
  keywords text[] not null default '{}',
  hook_fingerprint text,
  word_count int not null default 0,
  published_or_imported_at timestamptz not null default now(),
  normalized_hash text not null,
  body_sample text not null default '',
  source text not null default 'published'
    check (source in ('published', 'imported', 'generated')),
  search_vector tsvector generated always as (
    to_tsvector('english', coalesce(topic, '') || ' ' || coalesce(angle, '') || ' ' || coalesce(body_sample, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, normalized_hash)
);

create index content_memory_owner_date_idx on public.content_memory (owner_id, published_or_imported_at desc);
create index content_memory_fts_idx on public.content_memory using gin (search_vector);
create trigger content_memory_updated_at
before update on public.content_memory
for each row execute function public.set_updated_at();

-- oauth_connections (NO browser SELECT via RLS)
create table if not exists public.oauth_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'linkedin' check (provider = 'linkedin'),
  member_urn text,
  member_name text,
  token_iv text,
  token_ciphertext text,
  token_expires_at timestamptz,
  refresh_iv text,
  refresh_ciphertext text,
  scopes text not null default 'openid profile w_member_social',
  health public.oauth_health not null default 'disconnected',
  last_health_check_at timestamptz,
  oauth_state text,
  oauth_state_expires_at timestamptz,
  pkce_verifier text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, provider)
);

create trigger oauth_connections_updated_at
before update on public.oauth_connections
for each row execute function public.set_updated_at();

-- Safe view for clients (no ciphertext)
create or replace view public.oauth_connection_status
with (security_invoker = true)
as
select
  id,
  owner_id,
  provider,
  member_urn,
  member_name,
  token_expires_at,
  scopes,
  health,
  last_health_check_at,
  created_at,
  updated_at
from public.oauth_connections;

-- publishing_attempts
create table if not exists public.publishing_attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  attempt_number int not null default 1,
  idempotency_key text not null,
  status text not null check (status in ('started', 'success', 'failed', 'unknown')),
  failure_class text check (failure_class in ('transient', 'auth', 'permanent', 'unknown')),
  http_status int,
  linkedin_post_urn text,
  error_summary text,
  dry_run boolean not null default false,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (post_id, idempotency_key)
);

create index publishing_attempts_owner_idx on public.publishing_attempts (owner_id, started_at desc);

-- scheduler_runs
create table if not exists public.scheduler_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  job_name public.scheduler_job_name not null,
  idempotency_key text not null,
  outcome public.scheduler_outcome not null,
  duration_ms int,
  detail jsonb not null default '{}'::jsonb,
  error_summary text,
  created_at timestamptz not null default now(),
  unique (idempotency_key)
);

create index scheduler_runs_job_created_idx on public.scheduler_runs (job_name, created_at desc);

-- app_settings
create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  publishing_mode public.publishing_mode not null default 'review',
  timezone text not null default 'Asia/Karachi' check (timezone = 'Asia/Karachi'),
  groq_model text not null default 'openai/gpt-oss-20b',
  dry_run boolean not null default true,
  char_min int not null default 700,
  char_max int not null default 1300,
  min_research_items int not null default 5,
  max_research_items int not null default 40,
  retention_days int not null default 60 check (retention_days between 30 and 90),
  weekly_schedule jsonb not null default '[
    {"day":1,"hour":9,"minute":0},
    {"day":2,"hour":9,"minute":0},
    {"day":3,"hour":9,"minute":0},
    {"day":4,"hour":9,"minute":0},
    {"day":5,"hour":9,"minute":0},
    {"day":6,"hour":10,"minute":0},
    {"day":0,"hour":10,"minute":0}
  ]'::jsonb,
  include_citations_in_post boolean not null default false,
  allow_roman_urdu boolean not null default false,
  auto_publish_paused boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id)
);

create trigger app_settings_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

-- Claim due post (service role / security definer)
create or replace function public.claim_due_post(p_owner_id uuid default null)
returns public.posts
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.posts;
begin
  update public.posts p
  set
    status = 'PUBLISHING',
    claim_token = gen_random_uuid(),
    claimed_at = now(),
    updated_at = now()
  where p.id = (
    select id
    from public.posts
    where status in ('SCHEDULED', 'RETRY_WAIT')
      and (p_owner_id is null or owner_id = p_owner_id)
      and coalesce(scheduled_at, next_retry_at, now()) <= now()
      and (status <> 'RETRY_WAIT' or next_retry_at is null or next_retry_at <= now())
    order by coalesce(scheduled_at, next_retry_at) asc
    for update skip locked
    limit 1
  )
  returning * into claimed;

  return claimed;
end;
$$;

revoke all on function public.claim_due_post(uuid) from public, anon, authenticated;
grant execute on function public.claim_due_post(uuid) to service_role;
