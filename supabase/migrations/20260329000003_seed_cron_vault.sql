-- Seed templates stored as SQL comments + function to seed owner data after bootstrap.
-- Actual row seeds require owner_id (auth.users), so seeding runs from Edge Function.
-- This migration adds a reusable seed function and cron/vault scaffolding.

create or replace function public.seed_owner_defaults(p_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.brand_profiles (
    owner_id, display_name, positioning, core_expertise, career_context, audience, writing_style
  ) values (
    p_owner_id,
    'Absar Alam',
    'AI engineer focused on LLMs, agentic systems, ML/DL practice, and applied AI research; Python practitioner; Stanford Code in Place 2025 Section Leader; published researcher.',
    '["Python for AI","LLMs and RAG","agentic AI development","machine learning","deep learning","generative AI","vector databases","AI evaluation","workflow automation for AI agents","Google Colab / experiments"]'::jsonb,
    'AI Engineer roles at Narsun Studios, Innoviast, and DeepVision.ai; Stanford Code in Place 2025 Section Leader; published research experience.',
    'Aspiring AI/ML engineers, LLM builders, students, and practitioners who want practical AI/research-informed posts — not web or app UI content.',
    'Clear, practical, humble, credible, and human. Teach from genuine hands-on AI learning and research reading. Conversational English. Never exaggerate. Stay inside AI domains.'
  ) on conflict (owner_id) do nothing;

  insert into public.content_pillars (owner_id, slug, name, description, sort_order) values
    (p_owner_id, 'llm-engineering', 'LLMs, RAG, prompting, and applied LLM engineering', 'Practical lessons on LLMs, retrieval, prompting, evaluation, and production LLM systems.', 1),
    (p_owner_id, 'agentic-ai', 'Agentic AI, tool use, and multi-agent systems', 'Hands-on notes on AI agents, tools, orchestration, and reliable agent workflows.', 2),
    (p_owner_id, 'ml-dl-research', 'Machine learning, deep learning, and research notes', 'Honest ML/DL learning notes and recent research takeaways.', 3),
    (p_owner_id, 'generative-ai', 'Generative AI, multimodal models, and AI systems', 'GenAI models, multimodal systems, and how modern AI stacks fit together.', 4),
    (p_owner_id, 'ai-growth', 'AI engineering growth, mentoring, and research craft', 'AI career learning, mentoring, and research habits without hype.', 5)
    on conflict (owner_id, slug) do nothing;

  insert into public.source_feeds (owner_id, name, feed_url, category, quality_score, enabled) values
    (p_owner_id, 'Hugging Face Blog', 'https://huggingface.co/blog/feed.xml', 'ai', 90, true),
    (p_owner_id, 'OpenAI Blog', 'https://openai.com/blog/rss.xml', 'ai', 88, true),
    (p_owner_id, 'Google DeepMind Blog', 'https://deepmind.google/blog/rss.xml', 'ai-research', 92, true),
    (p_owner_id, 'AWS Machine Learning Blog', 'https://aws.amazon.com/blogs/machine-learning/feed/', 'ml', 82, true),
    (p_owner_id, 'Microsoft Azure AI Blog', 'https://azure.microsoft.com/en-us/blog/topics/artificial-intelligence/feed/', 'ai', 80, true),
    (p_owner_id, 'NVIDIA AI Blog', 'https://blogs.nvidia.com/blog/category/deep-learning/feed/', 'ai', 84, true),
    (p_owner_id, 'Meta AI Blog', 'https://ai.meta.com/blog/rss/', 'ai-research', 88, true)
    on conflict (owner_id, feed_url) do nothing;

  insert into public.app_settings (owner_id, publishing_mode, dry_run, groq_model)
  values (p_owner_id, 'review', true, 'openai/gpt-oss-20b')
  on conflict (owner_id) do nothing;
end;
$$;

revoke all on function public.seed_owner_defaults(uuid) from public, anon, authenticated;
grant execute on function public.seed_owner_defaults(uuid) to service_role;

-- Vault + pg_cron + pg_net (hosted Supabase)
-- On hosted projects pg_net often lives in schema "extensions" (not "net").
create extension if not exists supabase_vault with schema vault;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

-- Placeholder secrets: owner must update after deploy via dashboard/SQL.
-- Names used by cron wrapper functions below.
do $$
begin
  -- Create secrets only if missing (vault.create_secret returns uuid)
  if not exists (select 1 from vault.secrets where name = 'cron_project_url') then
    perform vault.create_secret('https://YOUR_PROJECT.supabase.co', 'cron_project_url', 'Supabase project URL for pg_net cron invokes');
  end if;
  if not exists (select 1 from vault.secrets where name = 'cron_anon_key') then
    perform vault.create_secret('REPLACE_WITH_PUBLISHABLE_KEY', 'cron_anon_key', 'Publishable key for Edge gateway Authorization header');
  end if;
  if not exists (select 1 from vault.secrets where name = 'cron_internal_secret') then
    perform vault.create_secret('REPLACE_WITH_CRON_INTERNAL_SECRET', 'cron_internal_secret', 'Shared secret for X-Cron-Secret header');
  end if;
exception
  when others then
    raise notice 'Vault secret bootstrap skipped: %', sqlerrm;
end $$;

create or replace function public.invoke_edge_cron(p_function_name text, p_idempotency_key text)
returns bigint
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  project_url text;
  anon_key text;
  cron_secret text;
  request_id bigint;
begin
  select decrypted_secret into project_url from vault.decrypted_secrets where name = 'cron_project_url' limit 1;
  select decrypted_secret into anon_key from vault.decrypted_secrets where name = 'cron_anon_key' limit 1;
  select decrypted_secret into cron_secret from vault.decrypted_secrets where name = 'cron_internal_secret' limit 1;

  if project_url is null or cron_secret is null or anon_key is null then
    raise exception 'Vault cron secrets not configured';
  end if;

  -- pg_net on hosted Supabase is installed in schema "extensions"
  select extensions.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/' || p_function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key,
      'X-Cron-Secret', cron_secret
    ),
    body := jsonb_build_object('idempotency_key', p_idempotency_key, 'source', 'pg_cron')
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function public.invoke_edge_cron(text, text) from public, anon, authenticated;
grant execute on function public.invoke_edge_cron(text, text) to service_role;

-- Schedule jobs (unschedule first if re-run)
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname in (
    'weekly-content',
    'process-due-posts',
    'token-health',
    'retention-heartbeat'
  );
exception when others then
  raise notice 'cron unschedule skipped: %', sqlerrm;
end $$;

-- Monday 03:00 UTC = Monday 08:00 Asia/Karachi
select cron.schedule(
  'weekly-content',
  '0 3 * * 1',
  $$select public.invoke_edge_cron('weekly-content', 'weekly-content:' || to_char(now() at time zone 'UTC', 'IYYY-"W"IW'));$$
);

select cron.schedule(
  'process-due-posts',
  '*/5 * * * *',
  $$select public.invoke_edge_cron('process-due-posts', 'process-due-posts:' || to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MI'));$$
);

select cron.schedule(
  'token-health',
  '15 4 * * *',
  $$select public.invoke_edge_cron('token-health', 'token-health:' || to_char(now() at time zone 'UTC', 'YYYYMMDD'));$$
);

select cron.schedule(
  'retention-heartbeat',
  '45 4 * * *',
  $$select public.invoke_edge_cron('retention-heartbeat', 'retention-heartbeat:' || to_char(now() at time zone 'UTC', 'YYYYMMDD'));$$
);
