-- RLS policies: owner-scoped; oauth ciphertext never selectable by browser roles

alter table public.bootstrap_state enable row level security;
alter table public.brand_profiles enable row level security;
alter table public.content_pillars enable row level security;
alter table public.source_feeds enable row level security;
alter table public.research_items enable row level security;
alter table public.content_runs enable row level security;
alter table public.post_ideas enable row level security;
alter table public.posts enable row level security;
alter table public.post_versions enable row level security;
alter table public.content_memory enable row level security;
alter table public.oauth_connections enable row level security;
alter table public.publishing_attempts enable row level security;
alter table public.scheduler_runs enable row level security;
alter table public.app_settings enable row level security;

-- Deny anonymous entirely (no policies for anon = deny)

-- bootstrap_state: authenticated can read completion flag only; no write from client
create policy bootstrap_state_select_authenticated
  on public.bootstrap_state for select
  to authenticated
  using (true);

-- NOTE: using (true) only for the singleton boolean completion flag (no PII/secrets).
-- Writes are service-role only (no insert/update/delete policies for authenticated).

-- Helper: owner match
-- brand_profiles
create policy brand_profiles_select_own on public.brand_profiles
  for select to authenticated using (owner_id = auth.uid());
create policy brand_profiles_insert_own on public.brand_profiles
  for insert to authenticated with check (owner_id = auth.uid());
create policy brand_profiles_update_own on public.brand_profiles
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy brand_profiles_delete_own on public.brand_profiles
  for delete to authenticated using (owner_id = auth.uid());

-- content_pillars
create policy content_pillars_select_own on public.content_pillars
  for select to authenticated using (owner_id = auth.uid());
create policy content_pillars_insert_own on public.content_pillars
  for insert to authenticated with check (owner_id = auth.uid());
create policy content_pillars_update_own on public.content_pillars
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy content_pillars_delete_own on public.content_pillars
  for delete to authenticated using (owner_id = auth.uid());

-- source_feeds
create policy source_feeds_select_own on public.source_feeds
  for select to authenticated using (owner_id = auth.uid());
create policy source_feeds_insert_own on public.source_feeds
  for insert to authenticated with check (owner_id = auth.uid());
create policy source_feeds_update_own on public.source_feeds
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy source_feeds_delete_own on public.source_feeds
  for delete to authenticated using (owner_id = auth.uid());

-- research_items
create policy research_items_select_own on public.research_items
  for select to authenticated using (owner_id = auth.uid());
create policy research_items_insert_own on public.research_items
  for insert to authenticated with check (owner_id = auth.uid());
create policy research_items_update_own on public.research_items
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy research_items_delete_own on public.research_items
  for delete to authenticated using (owner_id = auth.uid());

-- content_runs
create policy content_runs_select_own on public.content_runs
  for select to authenticated using (owner_id = auth.uid());
create policy content_runs_insert_own on public.content_runs
  for insert to authenticated with check (owner_id = auth.uid());
create policy content_runs_update_own on public.content_runs
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- post_ideas
create policy post_ideas_select_own on public.post_ideas
  for select to authenticated using (owner_id = auth.uid());
create policy post_ideas_insert_own on public.post_ideas
  for insert to authenticated with check (owner_id = auth.uid());
create policy post_ideas_update_own on public.post_ideas
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- posts
create policy posts_select_own on public.posts
  for select to authenticated using (owner_id = auth.uid());
create policy posts_insert_own on public.posts
  for insert to authenticated with check (owner_id = auth.uid());
create policy posts_update_own on public.posts
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy posts_delete_own on public.posts
  for delete to authenticated using (owner_id = auth.uid());

-- post_versions
create policy post_versions_select_own on public.post_versions
  for select to authenticated using (owner_id = auth.uid());
create policy post_versions_insert_own on public.post_versions
  for insert to authenticated with check (owner_id = auth.uid());

-- content_memory
create policy content_memory_select_own on public.content_memory
  for select to authenticated using (owner_id = auth.uid());
create policy content_memory_insert_own on public.content_memory
  for insert to authenticated with check (owner_id = auth.uid());
create policy content_memory_update_own on public.content_memory
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy content_memory_delete_own on public.content_memory
  for delete to authenticated using (owner_id = auth.uid());

-- oauth_connections: NO select/insert/update/delete for authenticated or anon
-- Edge Functions use service_role only. Explicit revoke:
revoke all on public.oauth_connections from anon, authenticated, public;
grant all on public.oauth_connections to service_role;

-- oauth_connection_status view: owner can select own status (no tokens)
grant select on public.oauth_connection_status to authenticated;
create policy oauth_connection_status_select_own
  on public.oauth_connections
  for select to authenticated
  using (false);
-- The FORCED false policy ensures table itself never returns rows to JWT clients.
-- View uses security_invoker — so we need a safer approach:
-- Recreate view as security definer function instead.

drop view if exists public.oauth_connection_status;

create or replace function public.get_oauth_connection_status()
returns table (
  id uuid,
  provider text,
  member_urn text,
  member_name text,
  token_expires_at timestamptz,
  scopes text,
  health public.oauth_health,
  last_health_check_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    c.id,
    c.provider,
    c.member_urn,
    c.member_name,
    c.token_expires_at,
    c.scopes,
    c.health,
    c.last_health_check_at,
    c.created_at,
    c.updated_at
  from public.oauth_connections c
  where c.owner_id = auth.uid();
$$;

revoke all on function public.get_oauth_connection_status() from public;
grant execute on function public.get_oauth_connection_status() to authenticated;

-- publishing_attempts
create policy publishing_attempts_select_own on public.publishing_attempts
  for select to authenticated using (owner_id = auth.uid());

-- scheduler_runs: owner can read own or global (null owner) heartbeats
create policy scheduler_runs_select_own on public.scheduler_runs
  for select to authenticated
  using (owner_id = auth.uid() or owner_id is null);

-- app_settings
create policy app_settings_select_own on public.app_settings
  for select to authenticated using (owner_id = auth.uid());
create policy app_settings_insert_own on public.app_settings
  for insert to authenticated with check (owner_id = auth.uid());
create policy app_settings_update_own on public.app_settings
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
